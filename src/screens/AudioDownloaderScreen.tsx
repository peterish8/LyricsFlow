import React, { useState, useEffect, useRef } from 'react';
import { 
    View, Text, StyleSheet, TextInput, Pressable, Image, 
    ActivityIndicator, Dimensions, ScrollView, Animated, Modal, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSongStaging } from '../hooks/useSongStaging';
import { Colors } from '../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Toast } from '../components/Toast';
import { MultiSourceSearchService } from '../services/MultiSourceSearchService';
import { UnifiedSong } from '../types/song';
import { usePlayerStore } from '../store/playerStore';

import { QualitySelector } from '../components/QualitySelector';
import { Audio } from 'expo-av';
import { ImageSearchService } from '../services/ImageSearchService';

const { width } = Dimensions.get('window');

export const AudioDownloaderScreen = ({ navigation, route }: any) => {
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UnifiedSong[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchStatus, setSearchStatus] = useState<string>('');
    
    // Preview sound for search results
    const [previewSound, setPreviewSound] = useState<Audio.Sound | null>(null);
    const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
    const [previewPosition, setPreviewPosition] = useState(0);
    const [previewDuration, setPreviewDuration] = useState(0);
    
    // Lyrics fetch cleanup
    const lyricsFetchCleanupRef = useRef<(() => void) | null>(null);
    
    // stageSong now accepts UnifiedSong from race engine
    const { staging, stageSong, updateSelection, finalizeDownload, togglePreview, isPlaying } = useSongStaging();
    const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' } | null>(null);
    
    // Visibility Management: Hide MiniPlayer when Downloader is open
    useEffect(() => {
        setMiniPlayerHidden(true);
        return () => setMiniPlayerHidden(false);
    }, [setMiniPlayerHidden]);
    const [showLyricsModal, setShowLyricsModal] = useState(false);
    const [showQualityModal, setShowQualityModal] = useState(false);
    const [showCoverSearchModal, setShowCoverSearchModal] = useState(false);
    const [coverSearchQuery, setCoverSearchQuery] = useState('');
    const [coverSearchResults, setCoverSearchResults] = useState<string[]>([]);
    const [isSearchingCovers, setIsSearchingCovers] = useState(false);

    // Cleanup preview sound on unmount
    useEffect(() => {
        return () => {
            if (previewSound) {
                previewSound.unloadAsync();
            }
            if (lyricsFetchCleanupRef.current) {
                lyricsFetchCleanupRef.current();
            }
        };
    }, [previewSound]);

    // Stop preview and lyrics fetch when navigating away from screen
    useEffect(() => {
        const unsubscribe = navigation.addListener('blur', async () => {
            if (previewSound) {
                await previewSound.unloadAsync();
                setPreviewSound(null);
                setPlayingPreviewId(null);
            }
            if (lyricsFetchCleanupRef.current) {
                lyricsFetchCleanupRef.current();
                lyricsFetchCleanupRef.current = null;
            }
        });

        return unsubscribe;
    }, [navigation, previewSound]);

    const handleSearch = async () => {
        if (!query.trim()) return;
        
        // Stop any playing preview
        if (previewSound) {
            await previewSound.unloadAsync();
            setPreviewSound(null);
            setPlayingPreviewId(null);
        }
        
        setIsSearching(true);
        setSearchStatus('Starting search...');
        setSearchResults([]);
        try {
            console.log('[UI] 🏁 Starting parallel race search...');
            const results = await MultiSourceSearchService.searchMusic(query, (status) => {
                setSearchStatus(status);
            });
            setSearchResults(results);
            if (results.length === 0) {
                setToast({ visible: true, message: 'No songs found', type: 'error' });
            } else {
                console.log(`[UI] ✓ Got ${results.length} results`);
            }
        } catch (error) {
            setToast({ visible: true, message: 'Search failed', type: 'error' });
        } finally {
            setIsSearching(false);
            setSearchStatus('');
        }
    };

    const handlePreviewToggle = async (song: UnifiedSong) => {
        try {
            // If this song is already playing, pause it
            if (playingPreviewId === song.id && previewSound) {
                await previewSound.pauseAsync();
                setPlayingPreviewId(null);
                return;
            }

            // Stop any currently playing preview
            if (previewSound) {
                await previewSound.unloadAsync();
            }

            // Load and play new preview
            console.log('[Preview] Loading:', song.title);
            const { sound } = await Audio.Sound.createAsync(
                { uri: song.downloadUrl },
                { shouldPlay: true }
            );
            
            setPreviewSound(sound);
            setPlayingPreviewId(song.id);

            // Track playback status for progress bar
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded) {
                    setPreviewPosition(status.positionMillis);
                    setPreviewDuration(status.durationMillis || 0);
                    
                    if (status.didJustFinish) {
                        setPlayingPreviewId(null);
                        setPreviewPosition(0);
                        setPreviewDuration(0);
                    }
                }
            });
        } catch (error) {
            console.error('[Preview] Failed:', error);
            setToast({ visible: true, message: 'Preview failed', type: 'error' });
        }
    };

    const handleSelectSong = async (song: UnifiedSong) => {
        // Stop preview when selecting
        if (previewSound) {
            await previewSound.unloadAsync();
            setPreviewSound(null);
            setPlayingPreviewId(null);
        }
        
        // Cancel any previous lyrics fetch
        if (lyricsFetchCleanupRef.current) {
            lyricsFetchCleanupRef.current();
        }
        
        // Stage song and store cleanup function
        const cleanup = await stageSong(song);
        lyricsFetchCleanupRef.current = cleanup || null;
        
        setSearchResults([]); // Clear results to show staging
        setQuery(''); 
    };

    const handleCoverSearch = async () => {
        if (!coverSearchQuery.trim()) return;
        
        console.log('[CoverSearch] Searching for:', coverSearchQuery);
        setIsSearchingCovers(true);
        try {
            const results = await ImageSearchService.searchItunes(coverSearchQuery);
            console.log('[CoverSearch] Got results:', results.length);
            setCoverSearchResults(results);
            if (results.length === 0) {
                setToast({ visible: true, message: 'No cover art found', type: 'error' });
            } else {
                console.log('[CoverSearch] First result:', results[0]);
            }
        } catch (error) {
            console.error('[CoverSearch] Failed:', error);
            setToast({ visible: true, message: 'Cover search failed', type: 'error' });
        } finally {
            setIsSearchingCovers(false);
        }
    };

    const handleAddCover = (coverUrl: string) => {
        console.log('[CoverSearch] Adding cover:', coverUrl);
        if (!staging) {
            console.error('[CoverSearch] No staging found!');
            return;
        }
        
        console.log('[CoverSearch] Current coverOptions:', staging.coverOptions);
        
        // Add to cover options if not already there
        const newCoverOptions = staging.coverOptions.includes(coverUrl)
            ? staging.coverOptions
            : [...staging.coverOptions, coverUrl];
        
        console.log('[CoverSearch] New coverOptions:', newCoverOptions);
        console.log('[CoverSearch] Calling updateSelection...');
        
        updateSelection({ 
            coverOptions: newCoverOptions,
            selectedCoverUri: coverUrl 
        });
        
        console.log('[CoverSearch] UpdateSelection called');
        
        setShowCoverSearchModal(false);
        setCoverSearchQuery('');
        setCoverSearchResults([]);
        setToast({ visible: true, message: 'Cover art added!', type: 'success' });
    };

    // Render Search Results
    const renderSearchResults = () => {
        if (staging) return null; // Don't show results if staging is active

        if (isSearching) {
            return (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.statusText}>{searchStatus || 'Searching...'}</Text>
                </View>
            );
        }

        if (searchResults.length > 0) {
            return (
                <FlatList
                    data={searchResults}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 20 }}
                    renderItem={({ item }) => (
                        <View style={styles.resultItem}>
                            {/* Play/Pause Button */}
                            <Pressable 
                                style={styles.playButton}
                                onPress={() => handlePreviewToggle(item)}
                            >
                                <Ionicons 
                                    name={playingPreviewId === item.id ? "pause" : "play"} 
                                    size={24} 
                                    color="#fff" 
                                />
                            </Pressable>

                            {/* Song Info - Tappable to select */}
                            <Pressable 
                                style={styles.resultContent}
                                onPress={() => handleSelectSong(item)}
                            >
                                <Image source={{ uri: item.highResArt }} style={styles.resultImage} />
                                <View style={styles.resultInfo}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                                        <View style={[
                                            styles.sourceBadge, 
                                            { backgroundColor: 
                                                item.source === 'Wynk' ? '#0066FF' : // Blue for Wynk
                                                item.source === 'NetEase' ? '#E60012' : // Red for NetEase
                                                item.source === 'SoundCloud' ? '#FF5500' : 
                                                '#FFA500' 
                                            }
                                        ]}>
                                            <Text style={styles.sourceBadgeText}>{item.source}</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.resultArtist} numberOfLines={1}>{item.artist}</Text>
                                </View>
                                <Ionicons name="download-outline" size={24} color={Colors.primary} />
                            </Pressable>
                        </View>
                    )}
                />
            );
        }
        
        return null;
    };

    // Staging Preview UI
    const renderStaging = () => {
        if (!staging) return null;

        if (staging.status === 'searching') {
             // Should not happen often with new flow, but good fallback
            return (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.statusText}>Loading metadata...</Text>
                </View>
            );
        }
        
        // Error state...
        if (staging.status === 'error') {
            return (
                <View style={styles.center}>
                    <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
                    <Text style={styles.errorText}>{staging.error || 'Staging failed'}</Text>
                    <Pressable style={styles.retryBtn} onPress={() => stageSong({ 
                        id: staging.id, 
                        title: staging.title, 
                        artist: staging.artist, 
                        highResArt: staging.coverOptions[0], 
                        downloadUrl: staging.qualityOptions[0]?.url || '', 
                        source: 'SoundCloud', // Default to SoundCloud for retry
                        duration: staging.duration  
                    })}> 
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                     <Pressable style={styles.cancelBtn} onPress={() => setSearchResults([])}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                </View>
            );
        }
        
        return (
            <ScrollView contentContainerStyle={styles.stagingContent}>
                {/* 1. Cover Art Selection (Carousel) */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingRight: 16 }}>
                    <Text style={styles.sectionTitle}>Cover Art</Text>
                    <Pressable onPress={() => {
                        setCoverSearchQuery(`${staging.title} ${staging.artist}`);
                        setShowCoverSearchModal(true);
                    }}>
                        <Ionicons name="search" size={20} color={Colors.primary} />
                    </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel}>
                    {staging.coverOptions.map((uri, idx) => (
                        <Pressable 
                            key={idx} 
                            onPress={() => updateSelection({ selectedCoverUri: uri })}
                            onLongPress={() => {
                                setCoverSearchQuery(`${staging.title} ${staging.artist}`);
                                setShowCoverSearchModal(true);
                            }}
                            style={[
                                styles.coverOption, 
                                staging.selectedCoverUri === uri && styles.selectedCover
                            ]}
                        >
                            <Image source={{ uri }} style={styles.coverImage} />
                            {staging.selectedCoverUri === uri && (
                                <View style={styles.checkBadge}>
                                    <Ionicons name="checkmark" size={16} color="#fff" />
                                </View>
                            )}
                        </Pressable>
                    ))}
                </ScrollView>

                {/* 2. Audio Metadata & Quality */}
                <View style={styles.metaContainer}>
                    <Text style={styles.trackTitle}>{staging.title}</Text>
                    <Text style={styles.trackArtist}>{staging.artist}</Text>
                    
                    {/* Quality Selection Button */}
                    <View style={styles.qualityContainer}>
                       <Pressable 
                            style={styles.qualityBtn}
                            onPress={() => setShowQualityModal(true)}
                       >
                            <View style={styles.qualityInfo}>
                                <Text style={styles.qualityLabel}>Audio Quality</Text>
                                <Text style={styles.qualityValue}>
                                    {staging.selectedQuality?.label}
                                </Text>
                            </View>
                            <Ionicons name="chevron-down" size={20} color="#888" />
                       </Pressable>
                    </View>

                    {/* Quality Modal */}
                    <QualitySelector
                        visible={showQualityModal}
                        onClose={() => setShowQualityModal(false)}
                        options={staging.qualityOptions}
                        selected={staging.selectedQuality}
                        onSelect={(opt) => updateSelection({ selectedQuality: opt })}
                    />

                    <Pressable style={styles.previewBtn} onPress={togglePreview}>
                        <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#fff" />
                        <Text style={styles.previewText}>{isPlaying ? "Pause Preview" : "Preview Audio"}</Text>
                    </Pressable>
                </View>

                {/* 3. Lyrics Selection */}
                <Text style={styles.sectionTitle}>Select Lyrics</Text>
                {staging.lyricOptions === null ? (
                    <View style={styles.lyricsLoadingContainer}>
                        <ActivityIndicator size="small" color={Colors.primary} />
                        <Text style={styles.lyricsLoadingText}>Fetching lyrics...</Text>
                    </View>
                ) : staging.lyricOptions.length > 0 ? (
                    <View style={styles.lyricsCard}>
                        {staging.lyricOptions.map((opt, idx) => (
                            <View key={idx}>
                                <Pressable 
                                    style={[
                                        styles.lyricOption,
                                        staging.selectedLyrics === opt.lyrics && styles.selectedLyricOption
                                    ]}
                                    onPress={() => updateSelection({ selectedLyrics: opt.lyrics })}
                                >
                                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                                        <Text style={styles.lyricSource}>{opt.source}</Text>
                                        <Pressable onPress={() => setShowLyricsModal(true)} style={styles.viewFullBtn}>
                                             <Text style={styles.viewFullText}>View Full</Text>
                                        </Pressable>
                                    </View>
                                    <Text numberOfLines={3} style={styles.lyricPreview}>
                                        {opt.lyrics.substring(0, 150).replace(/\n/g, ' ')}...
                                    </Text>
                                </Pressable>
                            </View>
                        ))}
                    </View>
                ) : (
                    <View style={styles.lyricsLoadingContainer}>
                        <Ionicons name="document-text-outline" size={24} color={Colors.textSecondary} />
                        <Text style={[styles.lyricsLoadingText, { marginLeft: 8 }]}>No lyrics found.</Text>
                    </View>
                )}
                
                {/* 4. Action */}
                <View style={{ height: 100 }} /> 
            </ScrollView>
        );
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#1F1F1F', '#000']}
                style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </Pressable>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color="#666" style={{ marginRight: 8 }} />
                        <TextInput
                            style={styles.input}
                            value={query}
                            onChangeText={setQuery}
                            onSubmitEditing={handleSearch}
                            placeholder="Search song to download..."
                            placeholderTextColor="#666"
                            returnKeyType="search"
                            autoFocus
                        />
                         {query.length > 0 && (
                            <Pressable onPress={() => setQuery('')}>
                                <Ionicons name="close-circle" size={18} color="#666" />
                            </Pressable>
                        )}
                    </View>
                </View>

                {renderSearchResults()}
                {renderStaging()}

                {/* FAB - Download Button */}
                {staging && staging.status === 'ready' && (
                    <Pressable 
                        style={styles.fab} 
                        onPress={async () => {
                            await finalizeDownload();
                            setToast({ visible: true, message: 'Song Saved to Library!', type: 'success' });
                            setTimeout(() => {
                                navigation.goBack(); // Close modal
                                navigation.navigate('Main', { screen: 'Library' });
                            }, 1500);
                        }}
                    >
                        <LinearGradient
                            colors={['#8E2DE2', '#4A00E0']}
                            style={styles.fabGradient}
                        >
                            <Ionicons name="download-outline" size={24} color="#fff" />
                            <Text style={styles.fabText}>Save to Library</Text>
                        </LinearGradient>
                    </Pressable>
                )}
                
                {staging && staging.status === 'downloading' && (
                     <View style={styles.downloadingOverlay}>
                        <ActivityIndicator size="large" color="#fff" />
                        <Text style={styles.downloadText}>Downloading... {(staging.progress * 100).toFixed(0)}%</Text>
                     </View>
                )}
                
                {/* Mini Preview Player Bar */}
                {playingPreviewId && searchResults.length > 0 && (
                    <View style={styles.miniPlayerBar}>
                        {(() => {
                            const playingSong = searchResults.find(s => s.id === playingPreviewId);
                            if (!playingSong) return null;
                            
                            const progress = previewDuration > 0 ? previewPosition / previewDuration : 0;
                            const formatTime = (ms: number) => {
                                const seconds = Math.floor(ms / 1000);
                                const mins = Math.floor(seconds / 60);
                                const secs = seconds % 60;
                                return `${mins}:${secs.toString().padStart(2, '0')}`;
                            };
                            
                            return (
                                <>
                                    <Image source={{ uri: playingSong.highResArt }} style={styles.miniPlayerArt} />
                                    <View style={styles.miniPlayerInfo}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <Text style={styles.miniPlayerTitle} numberOfLines={1}>{playingSong.title}</Text>
                                            <Text style={styles.miniPlayerTime}>{formatTime(previewPosition)} / {formatTime(previewDuration)}</Text>
                                        </View>
                                        <Text style={styles.miniPlayerArtist} numberOfLines={1}>{playingSong.artist}</Text>
                                        
                                        {/* Progress Bar */}
                                        <View 
                                            style={styles.progressBarContainer}
                                            onLayout={(e) => {
                                                // Store width for scrubbing calculation
                                                e.currentTarget.measure((x, y, width) => {
                                                    (e.currentTarget as any)._width = width;
                                                });
                                            }}
                                        >
                                            <View style={styles.progressBarBackground}>
                                                <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
                                            </View>
                                            {/* Scrubber - tap to seek */}
                                            <Pressable 
                                                style={styles.progressBarTouchArea}
                                                onPress={async (e) => {
                                                    if (!previewSound || !previewDuration) return;
                                                    const { locationX } = e.nativeEvent;
                                                    const containerWidth = (e.currentTarget as any)._width || 300;
                                                    const seekPosition = (locationX / containerWidth) * previewDuration;
                                                    await previewSound.setPositionAsync(seekPosition);
                                                }}
                                            />
                                        </View>
                                    </View>
                                    <Pressable 
                                        style={styles.miniPlayerButton}
                                        onPress={() => handlePreviewToggle(playingSong)}
                                    >
                                        <Ionicons name="pause" size={24} color="#fff" />
                                    </Pressable>
                                </>
                            );
                        })()}
                    </View>
                )}

                {/* Cover Art Search Modal */}
                <Modal visible={showCoverSearchModal} animationType="slide" transparent={true}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Search Cover Art</Text>
                                <Pressable onPress={() => {
                                    setShowCoverSearchModal(false);
                                    setCoverSearchQuery('');
                                    setCoverSearchResults([]);
                                }} style={styles.closeModalBtn}>
                                    <Ionicons name="close" size={24} color="#fff" />
                                </Pressable>
                            </View>

                            {/* Search Input */}
                            <View style={styles.searchContainer}>
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search for cover art..."
                                    placeholderTextColor="#888"
                                    value={coverSearchQuery}
                                    onChangeText={setCoverSearchQuery}
                                    onSubmitEditing={handleCoverSearch}
                                />
                                <Pressable style={styles.searchButton} onPress={handleCoverSearch}>
                                    {isSearchingCovers ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Ionicons name="search" size={20} color="#fff" />
                                    )}
                                </Pressable>
                            </View>

                            {/* Results Grid */}
                            <ScrollView style={styles.coverResultsScroll}>
                                <View style={styles.coverResultsGrid}>
                                    {coverSearchResults.map((coverUrl, idx) => (
                                        <Pressable
                                            key={idx}
                                            style={styles.coverResultItem}
                                            onPress={() => handleAddCover(coverUrl)}
                                        >
                                            <Image source={{ uri: coverUrl }} style={styles.coverResultImage} />
                                        </Pressable>
                                    ))}
                                </View>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                {toast && (
                    <Toast 
                        visible={toast.visible} 
                        message={toast.message} 
                        type={toast.type} 
                        onDismiss={() => setToast(null)} 
                    />
                )}

                {/* Lyrics Preview Modal */}
                <Modal visible={showLyricsModal} animationType="slide" transparent={true}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Full Lyrics</Text>
                                <Pressable onPress={() => setShowLyricsModal(false)} style={styles.closeModalBtn}>
                                    <Ionicons name="close" size={24} color="#fff" />
                                </Pressable>
                            </View>
                            <ScrollView style={styles.modalScroll}>
                                <Text style={styles.fullLyricsText}>
                                    {staging?.selectedLyrics || 'No lyrics selected.'}
                                </Text>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
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
        paddingBottom: 16,
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
    input: { flex: 1, color: '#fff', fontSize: 16, height: '100%' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    statusText: { color: Colors.textSecondary, marginTop: 12 },
    errorText: { color: Colors.error, marginTop: 12, textAlign: 'center' },
    retryBtn: { marginTop: 16, padding: 10, backgroundColor: '#333', borderRadius: 8 },
    retryText: { color: '#fff' },
    stagingContent: { paddingBottom: 120 },
    sectionTitle: {
        fontSize: 18, fontWeight: '700', color: '#fff', 
        marginLeft: 16, marginTop: 24, marginBottom: 12 
    },
    carousel: { paddingLeft: 16 },
    coverOption: {
        width: 140, height: 140, marginRight: 12,
        borderRadius: 12, overflow: 'hidden',
        borderWidth: 2, borderColor: 'transparent',
    },
    selectedCover: { borderColor: Colors.primary },
    coverImage: { width: '100%', height: '100%' },
    checkBadge: {
        position: 'absolute', top: 8, right: 8,
        backgroundColor: Colors.primary, borderRadius: 12,
        width: 24, height: 24, alignItems: 'center', justifyContent: 'center'
    },
    metaContainer: { padding: 16, alignItems: 'center' },
    trackTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
    trackArtist: { fontSize: 16, color: Colors.textSecondary, marginTop: 4 },
    qualityContainer: { width: '100%', marginTop: 16, paddingHorizontal: 16 },
    qualityBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#222', padding: 16, borderRadius: 12,
        borderWidth: 1, borderColor: '#333'
    },
    qualityInfo: {},
    qualityLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
    qualityValue: { color: Colors.primary, fontSize: 16, fontWeight: '600' },
    previewBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(142, 45, 226, 0.2)',
        paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25,
        marginTop: 16
    },
    previewText: { color: '#A78BFA', fontWeight: '600' },
    lyricsCard: { marginHorizontal: 16 },
    lyricOption: {
        backgroundColor: '#222', borderRadius: 12, padding: 16, marginBottom: 10,
        borderWidth: 1, borderColor: 'transparent'
    },
    selectedLyricOption: { borderColor: Colors.primary, backgroundColor: '#2A2A2A' },
    lyricSource: { color: Colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
    lyricPreview: { color: '#ccc', fontSize: 14, lineHeight: 22 },
    viewFullBtn: { backgroundColor: '#333', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    viewFullText: { color: '#fff', fontSize: 10, fontWeight: '600' },
    noLyricsText: { color: '#666', marginLeft: 16, fontStyle: 'italic' },
    fab: {
        position: 'absolute', bottom: 30,alignSelf: 'center',
        borderRadius: 30, elevation: 8,
        shadowColor: Colors.primary, shadowOffset: {width:0, height:4}, shadowOpacity:0.4, shadowRadius:8
    },
    fabGradient: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 24, paddingVertical: 16, borderRadius: 30
    },
    fabText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    downloadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center', alignItems: 'center',
        zIndex: 100
    },
    downloadText: { color: '#fff', marginTop: 16, fontSize: 18, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, maxHeight: '80%', padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
    closeModalBtn: { padding: 4 },
    modalScroll: { flex: 1 },
    fullLyricsText: { color: '#ddd', fontSize: 16, lineHeight: 28, textAlign: 'center' },
    browseYoutubeBtn: {
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 16,
        overflow: 'hidden',
    },
    browseYoutubeGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        gap: 12,
    },
    browseYoutubeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    browseYoutubeSubtext: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#1A1A1A',
        borderRadius: 12,
        marginBottom: 12,
        gap: 12,
    },
    playButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resultContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    resultImage: {
        width: 50,
        height: 50,
        borderRadius: 8,
    },
    resultInfo: {
        flex: 1,
    },
    resultTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    resultArtist: {
        color: '#aaa',
        fontSize: 14,
    },
    cancelBtn: {
        marginTop: 12,
        padding: 8,
    },
    cancelText: {
        color: '#888',
        fontSize: 14,
        textDecorationLine: 'underline',
    },
    sourceBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 4,
    },
    sourceBadgeText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    lyricsLoadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        gap: 10,
    },
    lyricsLoadingText: {
        color: '#888',
        fontSize: 14,
        fontStyle: 'italic',
    },
    miniPlayerBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A1A',
        borderTopWidth: 1,
        borderTopColor: '#333',
        padding: 12,
        gap: 12,
    },
    miniPlayerArt: {
        width: 50,
        height: 50,
        borderRadius: 8,
    },
    miniPlayerInfo: {
        flex: 1,
    },
    miniPlayerTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    miniPlayerArtist: {
        color: '#888',
        fontSize: 12,
        marginTop: 2,
    },
    miniPlayerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    miniPlayerTime: {
        color: '#888',
        fontSize: 10,
        marginLeft: 8,
    },
    progressBarContainer: {
        marginTop: 6,
        position: 'relative',
    },
    progressBarBackground: {
        height: 3,
        backgroundColor: '#333',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: Colors.primary,
    },
    searchContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    searchInput: {
        flex: 1,
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        fontSize: 14,
    },
    searchButton: {
        backgroundColor: Colors.primary,
        borderRadius: 8,
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressBarTouchArea: {
        position: 'absolute',
        top: -8,
        left: 0,
        right: 0,
        height: 20,
    },
    coverResultsScroll: {
        maxHeight: 400,
    },
    coverResultsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        padding: 4,
    },
    coverResultItem: {
        width: '30%',
        aspectRatio: 1,
        borderRadius: 8,
        overflow: 'hidden',
    },
    coverResultImage: {
        width: '100%',
        height: '100%',
    },
});
