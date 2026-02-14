import React, { useState, useEffect, useRef } from 'react';
import { 
    View, Text, StyleSheet, TextInput, Pressable, Image, 
    ActivityIndicator, Dimensions, ScrollView, Modal, FlatList, SectionList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSongStaging } from '../hooks/useSongStaging'; // Kept for simple single-song checks if needed
import { Colors } from '../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { QueueItem } from '../store/downloadQueueStore';
import { Toast } from '../components/Toast';
import { MultiSourceSearchService } from '../services/MultiSourceSearchService';
import { UnifiedSong } from '../types/song';
import { usePlayerStore } from '../store/playerStore';
import { Audio } from 'expo-av';
import { ImageSearchService } from '../services/ImageSearchService';

// New Architecture Imports
import { useDownloaderTabStore } from '../store/downloaderTabStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { 
    DownloadGridCard, 
    BatchReviewModal, 
    FloatingDownloadIndicator, 
    DownloadQueueModal 
} from '../components';

const { width } = Dimensions.get('window');

export const AudioDownloaderScreen = ({ navigation }: any) => {
    // Global Stores
    const { 
        tabs, activeTabId, 
        createTab, closeTab, setActiveTab, updateTab, 
        toggleSelection, clearAllSelections, getSelectedSongs 
    } = useDownloaderTabStore();
    
    const { addToQueue } = useDownloadQueueStore();
    const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);

    // Local UI State
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' } | null>(null);
    
    const [showQueue, setShowQueue] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    
    // Dual-Field Search State (Mutually Exclusive)
    const [searchMode, setSearchMode] = useState<'title' | 'artist'>('title'); // Default: title open
    const [titleQuery, setTitleQuery] = useState('');
    const [artistQuery, setArtistQuery] = useState('');
    const [remixSectionExpanded, setRemixSectionExpanded] = useState(false);
    
    // Animated values for smooth transitions
    const titleFieldWidth = useSharedValue(200); // Start with title open
    const artistFieldWidth = useSharedValue(0);
    
    // Animated styles
    const titleFieldStyle = useAnimatedStyle(() => ({
        width: titleFieldWidth.value,
        opacity: titleFieldWidth.value > 0 ? 1 : 0
    }));
    
    const artistFieldStyle = useAnimatedStyle(() => ({
        width: artistFieldWidth.value,
        opacity: artistFieldWidth.value > 0 ? 1 : 0
    }));
    
    // Handle field expansion (mutually exclusive)
    useEffect(() => {
        if (searchMode === 'title') {
            titleFieldWidth.value = withSpring(200);
            artistFieldWidth.value = withSpring(0);
        } else if (searchMode === 'artist') {
            titleFieldWidth.value = withSpring(0);
            artistFieldWidth.value = withSpring(200);
        }
    }, [searchMode]);
    
    // Preview Audio State
    const [previewSound, setPreviewSound] = useState<Audio.Sound | null>(null);
    const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);

    // Audio Ref for cleanup
    const previewSoundRef = useRef<Audio.Sound | null>(null);

    // Sync ref with state
    useEffect(() => {
        previewSoundRef.current = previewSound;
    }, [previewSound]);

    // Cleanup on unmount
    useEffect(() => {
        setMiniPlayerHidden(true);
        return () => {
            setMiniPlayerHidden(false);
            if (previewSoundRef.current) {
                previewSoundRef.current.unloadAsync();
            }
        };
    }, []);

    // Filter Results for Artist Search
    const filterResults = (results: UnifiedSong[], artistQuery: string): {
        exactMatches: UnifiedSong[];
        remixesAndCovers: UnifiedSong[];
    } => {
        const artistLower = artistQuery.toLowerCase().trim();
        
        const exactMatches = results.filter(song => {
            const songArtist = song.artist.toLowerCase();
            // Exact match: artist name appears without remix/cover keywords
            return songArtist.includes(artistLower) && 
                   !songArtist.match(/remix|cover|vs\.|feat\.|ft\./i);
        });
        
        const remixesAndCovers = results.filter(song => {
            const songArtist = song.artist.toLowerCase();
            return songArtist.includes(artistLower) && 
                   songArtist.match(/remix|cover|vs\.|feat\.|ft\./i);
        });
        
        return { exactMatches, remixesAndCovers };
    };

    // Handle Search
    const handleSearch = async () => {
        // Construct query from dual fields
        let finalQuery = '';
        
        if (titleQuery && artistQuery) {
            finalQuery = `${titleQuery} ${artistQuery}`;
        } else if (artistQuery) {
            finalQuery = artistQuery;
        } else if (titleQuery) {
            finalQuery = titleQuery;
        }
        
        if (!finalQuery.trim()) return;
        
        // Update Tab State
        updateTab(activeTabId, { isSearching: true, status: 'Searching...', results: [], remixResults: [] });

        try {
            console.log(`[Tab-${activeTabId.slice(-4)}] 🔍 Searching: ${finalQuery}`);
            const results = await MultiSourceSearchService.searchMusic(finalQuery, (status) => {
                 updateTab(activeTabId, { status });
            });
            
            // Filter results if artist query exists
            if (artistQuery) {
                const { exactMatches, remixesAndCovers } = filterResults(results, artistQuery);
                updateTab(activeTabId, { 
                    results: exactMatches,
                    remixResults: remixesAndCovers,
                    isSearching: false, 
                    status: exactMatches.length === 0 && remixesAndCovers.length === 0 ? 'No results found.' : '' 
                });
            } else {
                updateTab(activeTabId, { 
                    results, 
                    remixResults: [],
                    isSearching: false, 
                    status: results.length === 0 ? 'No results found.' : '' 
                });
            }
            
        } catch (error) {
            updateTab(activeTabId, { isSearching: false, status: 'Search failed.' });
            setToast({ visible: true, message: 'Search failed', type: 'error' });
        }
    };

    // Handle Preview
    const handlePreviewToggle = async (song: UnifiedSong) => {
        try {
            if (playingPreviewId === song.id && previewSound) {
                await previewSound.pauseAsync();
                setPlayingPreviewId(null);
                return;
            }

            if (previewSound) await previewSound.unloadAsync();

            const { sound } = await Audio.Sound.createAsync(
                { uri: song.downloadUrl },
                { shouldPlay: true }
            );
            
            setPreviewSound(sound);
            setPlayingPreviewId(song.id);
            sound.setOnPlaybackStatusUpdate((s) => {
                if (s.isLoaded && s.didJustFinish) setPlayingPreviewId(null);
            });
        } catch (e) {
            setToast({ visible: true, message: 'Preview failed', type: 'error' });
        }
    };

    // New Tab for Artist
    const openArtistTab = (artistName: string) => {
        createTab(artistName);
        // We'll need to trigger search for the new tab after creation
        // Since createTab is synchronous, we can find the last tab and update it
        // Or better: createTab could accept initial search request?
        // Current implementation: createTab(query).
        // I need to trigger search effect or just call search manually?
        // I'll manually trigger it in a timeout to ensure state update
        setTimeout(() => {
            // Find the new tab (it's the active one now)
            // But wait, createTab sets active.
            // We need a way to run search.
            // For now, user has to hit enter? 
            // Better: update logic.
            // Actually, `handleSearch` uses `activeTab`. 
            // So if I call handleSearch() immediately it might use old active tab if state hasn't flushed.
            // React batching...
            // I'll just let the user hit enter for now or Auto-Search?
            // "Clicking Artist Name -> Opens new search tab... and immediately fetch".
            // I'll add an effect: useEffect(() => { if new tab has query & no results & !searching => search }, [activeTabId])
        }, 100);
    };
    
    // Auto-Search Effect for new Tabs
    useEffect(() => {
        if (activeTab.query && activeTab.results.length === 0 && !activeTab.isSearching && activeTab.status === '') {
             handleSearch();
        }
    }, [activeTabId]); // When switching to a tab (including new one)

    // Selection Logic
    const handleLongPress = (song: UnifiedSong) => {
        toggleSelection(activeTabId, song.id);
    };

    // Direct Download Logic
    const handlePress = (song: UnifiedSong) => {
        // If selection mode is active, toggle selection
        if (activeTab.selectedSongs.length > 0 || selectionMode) {
            toggleSelection(activeTabId, song.id);
            return;
        }

        // Direct Download
        const queueItem: UnifiedSong = {
            ...song,
            highResArt: song.highResArt || song.thumbnail || '',
            downloadUrl: song.downloadUrl || song.streamUrl || '',
            streamUrl: song.downloadUrl || song.streamUrl || '', // Ensure streamUrl is set
            selectedQuality: {
                url: song.downloadUrl || song.streamUrl || '',
                quality: '320kbps',
                format: 'mp3'
            },
            selectedLyrics: '', // Lyrics will be fetched during download
            selectedCoverUri: song.highResArt || song.thumbnail || ''
        };

        addToQueue([queueItem]);
        setToast({ visible: true, message: 'Added to Download Queue', type: 'success' });
    };

    const handleBatchDownload = () => {
        const selectedSongs = getSelectedSongs().map(s => s.song);
        if (selectedSongs.length === 0) return;

        const queueItems = selectedSongs.map(song => ({
            ...song,
            highResArt: song.highResArt || song.thumbnail || '',
            downloadUrl: song.downloadUrl || song.streamUrl || '',
            streamUrl: song.downloadUrl || song.streamUrl || '',
            selectedQuality: {
                url: song.downloadUrl || song.streamUrl || '',
                quality: '320kbps',
                format: 'mp3'
            },
            selectedLyrics: '',
            selectedCoverUri: song.highResArt || song.thumbnail || ''
        }));

        addToQueue(queueItems as UnifiedSong[]);
        clearAllSelections();
        setToast({ visible: true, message: `Added ${selectedSongs.length} songs to queue`, type: 'success' });
    };

    // Render Tab Bar
    const renderTabBar = () => (
        <View style={styles.tabBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 8}}>
                {tabs.map(tab => (
                    <Pressable 
                        key={tab.id}
                        style={[styles.tabItem, tab.id === activeTabId && styles.activeTabItem]}
                        onPress={() => setActiveTab(tab.id)}
                    >
                        <Text style={[styles.tabText, tab.id === activeTabId && styles.activeTabText]} numberOfLines={1}>
                            {tab.query || 'New Tab'}
                        </Text>
                        {tabs.length > 1 && (
                            <Pressable onPress={() => closeTab(tab.id)} style={{marginLeft: 6}}>
                                <Ionicons name="close" size={14} color="#999" />
                            </Pressable>
                        )}
                    </Pressable>
                ))}
                <Pressable style={styles.newTabBtn} onPress={() => createTab('')}>
                    <Ionicons name="add" size={20} color="#fff" />
                </Pressable>
            </ScrollView>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#1F1F1F', '#000']} style={StyleSheet.absoluteFill} />
            <SafeAreaView style={styles.safeArea}>
                
                {/* Header Section */}
                <View style={styles.header}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </Pressable>
                    {/* Simplified Search Bar */}
                    <View style={styles.searchContainer}>
                        {/* Title Icon */}
                        <Pressable 
                            onPress={() => setSearchMode('title')}
                            style={styles.iconBtn}
                        >
                            <Ionicons 
                                name="musical-note" 
                                size={20} 
                                color={searchMode === 'title' ? '#fff' : '#666'} 
                            />
                        </Pressable>
                        
                        {/* Title Field (Animated) - Only render when active */}
                        {searchMode === 'title' && (
                            <Animated.View 
                                style={[styles.animatedField, titleFieldStyle]}
                            >
                                <TextInput
                                    style={styles.animatedInput}
                                    value={titleQuery}
                                    onChangeText={setTitleQuery}
                                    onSubmitEditing={handleSearch}
                                    placeholder="Song Title..."
                                    placeholderTextColor="#666"
                                    returnKeyType="search"
                                />
                                {titleQuery.length > 0 && (
                                    <Pressable onPress={() => setTitleQuery('')} style={styles.inlineClearBtn}>
                                        <Ionicons name="close-circle" size={16} color="#666" />
                                    </Pressable>
                                )}
                            </Animated.View>
                        )}

                        {/* Artist Icon */}
                        <Pressable 
                            onPress={() => setSearchMode('artist')}
                            style={styles.iconBtn}
                        >
                            <Ionicons 
                                name="person" 
                                size={20} 
                                color={searchMode === 'artist' ? '#fff' : '#666'} 
                            />
                        </Pressable>
                        
                        {/* Artist Field (Animated) - Only render when active */}
                        {searchMode === 'artist' && (
                            <Animated.View 
                                style={[styles.animatedField, artistFieldStyle]}
                            >
                                <TextInput
                                    style={styles.animatedInput}
                                    value={artistQuery}
                                    onChangeText={setArtistQuery}
                                    onSubmitEditing={handleSearch}
                                    placeholder="Artist Name..."
                                    placeholderTextColor="#666"
                                    returnKeyType="search"
                                />
                                {artistQuery.length > 0 && (
                                    <Pressable onPress={() => setArtistQuery('')} style={styles.inlineClearBtn}>
                                        <Ionicons name="close-circle" size={16} color="#666" />
                                    </Pressable>
                                )}
                            </Animated.View>
                        )}
                    </View>
                    
                    <Pressable 
                        onPress={() => setSelectionMode(!selectionMode)} 
                        style={[styles.selectModeBtn, selectionMode && styles.selectModeBtnActive]}
                    >
                        <Text style={[styles.selectModeText, selectionMode && styles.selectModeTextActive]}>
                            {selectionMode ? 'Done' : 'Select'}
                        </Text>
                    </Pressable>
                </View>

                {/* Tab Bar */}
                {renderTabBar()}

                {/* Content Area */}
                <View style={styles.content}>
                    {activeTab.isSearching ? (
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={Colors.primary} />
                            <Text style={styles.statusText}>{activeTab.status}</Text>
                        </View>
                    ) : activeTab.results.length > 0 || (activeTab.remixResults && activeTab.remixResults.length > 0) ? (
                        activeTab.remixResults && activeTab.remixResults.length > 0 ? (
                            <SectionList
                                sections={[
                                    ...(activeTab.results.length > 0 ? [{
                                        title: 'OFFICIAL TRACKS',
                                        data: activeTab.results
                                    }] : []),
                                    {
                                        title: 'REMIXES & COVERS',
                                        data: activeTab.remixResults,
                                        collapsed: !remixSectionExpanded
                                    }
                                ]}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={styles.gridContent}
                                renderSectionHeader={({ section }) => (
                                    <Pressable 
                                        onPress={() => {
                                            if (section.title === 'REMIXES & COVERS') {
                                                setRemixSectionExpanded(!remixSectionExpanded);
                                            }
                                        }}
                                        style={styles.sectionHeader}
                                    >
                                        <Text style={styles.sectionHeaderText}>
                                            {section.title} ({section.data.length})
                                        </Text>
                                        {section.title === 'REMIXES & COVERS' && (
                                            <Ionicons 
                                                name={remixSectionExpanded ? 'chevron-up' : 'chevron-down'} 
                                                size={18} 
                                                color="#999" 
                                            />
                                        )}
                                    </Pressable>
                                )}
                                renderItem={({ item, section }) => {
                                    if (section.title === 'REMIXES & COVERS' && !remixSectionExpanded) {
                                        return null;
                                    }
                                    return (
                                        <View style={{ width: '50%', padding: 4 }}>
                                            <DownloadGridCard
                                                song={item}
                                                isSelected={activeTab.selectedSongs.includes(item.id)}
                                                isPlayingPreview={playingPreviewId === item.id}
                                                onPress={() => handlePress(item)}
                                                onLongPress={() => handleLongPress(item)}
                                                onPlayPress={() => handlePreviewToggle(item)}
                                                onArtistPress={() => openArtistTab(item.artist)}
                                                selectionMode={selectionMode || activeTab.selectedSongs.length > 0}
                                            />
                                        </View>
                                    );
                                }}
                            />
                        ) : (
                            <FlatList
                                data={activeTab.results}
                                keyExtractor={(item) => item.id}
                                numColumns={2}
                                contentContainerStyle={styles.gridContent}
                                renderItem={({ item }) => (
                                    <DownloadGridCard
                                        song={item}
                                        isSelected={activeTab.selectedSongs.includes(item.id)}
                                        isPlayingPreview={playingPreviewId === item.id}
                                        onPress={() => handlePress(item)}
                                        onLongPress={() => handleLongPress(item)}
                                        onPlayPress={() => handlePreviewToggle(item)}
                                        onArtistPress={() => openArtistTab(item.artist)}
                                        selectionMode={selectionMode || activeTab.selectedSongs.length > 0}
                                    />
                                )}
                            />
                        )
                    ) : (
                        <View style={styles.center}>
                            <Ionicons name="musical-notes-outline" size={64} color="#333" />
                            <Text style={styles.emptyText}>
                                {activeTab.status || 'Search for your favorite songs to download.'}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Bottom Action Bar (Selection Mode) */}
                 {getSelectedSongs().length > 0 && (
                    <View style={styles.actionBar}>
                        <Text style={styles.selectionText}>
                            {getSelectedSongs().length} selected
                        </Text>
                        <Pressable style={styles.reviewBtn} onPress={handleBatchDownload}>
                            <Text style={styles.reviewBtnText}>Download Selected</Text>
                            <Ionicons name="download" size={18} color="#fff" />
                        </Pressable>
                        <Pressable style={styles.clearBtn} onPress={clearAllSelections}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </Pressable>
                    </View>
                )}

                {/* Overlays */}
                {/* BatchReviewModal Removed */}

                
                <DownloadQueueModal 
                    visible={showQueue}
                    onClose={() => setShowQueue(false)}
                />
                
                <FloatingDownloadIndicator onPress={() => setShowQueue(true)} />
                
                {toast && (
                    <Toast 
                        visible={toast.visible} 
                        message={toast.message} 
                        type={toast.type} 
                        onDismiss={() => setToast(null)} 
                    />
                )}

            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    safeArea: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
        paddingTop: 8,
    },
    backBtn: { padding: 8, marginRight: 8 },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#222',
        borderRadius: 20,
        paddingHorizontal: 12,
        height: 44,
    },
    selectModeBtn: {
        marginLeft: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#222',
        borderRadius: 20,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333'
    },
    selectModeBtnActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary
    },
    selectModeText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14
    },
    selectModeTextActive: {
        color: '#fff'
    },
    input: { flex: 1, color: '#fff', fontSize: 16, height: '100%' },
    tabBar: {
        height: 40,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        marginBottom: 8
    },
    tabItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#111',
        borderRadius: 12,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#333'
    },
    activeTabItem: {
        backgroundColor: '#333',
        borderColor: Colors.primary
    },
    tabText: { color: '#888', fontSize: 13, maxWidth: 120 },
    activeTabText: { color: '#fff', fontWeight: 'bold' },
    newTabBtn: {
        padding: 8,
        backgroundColor: '#222',
        borderRadius: 20,
        marginLeft: 4
    },
    content: { flex: 1 },
    gridContent: { padding: 8, paddingBottom: 100 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    statusText: { color: '#888', marginTop: 12 },
    emptyText: { color: '#444', marginTop: 16, fontSize: 16 },
    
    actionBar: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        backgroundColor: '#222',
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        elevation: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
        borderWidth: 1,
        borderColor: Colors.primary
    },
    selectionText: { color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1 },
    reviewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        gap: 8,
        marginRight: 12
    },
    reviewBtnText: { color: '#fff', fontWeight: 'bold' },
    clearBtn: { padding: 4 },
    
    // Simplified Search Styles
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333'
    },
    animatedField: {
        height: 40,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#222',
        borderRadius: 20,
        overflow: 'hidden',
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#333'
    },
    animatedInput: {
        flex: 1,
        color: '#fff',
        fontSize: 14,
        height: '100%'
    },
    inlineClearBtn: {
        padding: 4,
        marginLeft: 4
    },
    
    // Section Header Styles
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginHorizontal: 8,
        marginTop: 8,
        marginBottom: 4,
        borderRadius: 8
    },
    sectionHeaderText: {
        color: '#999',
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1
    }
});

