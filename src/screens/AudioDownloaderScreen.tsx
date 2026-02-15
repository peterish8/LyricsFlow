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
    DownloadQueueModal,
    BulkSwapModal,
    PlaylistSelectionModal
} from '../components';
import * as Clipboard from 'expo-clipboard';
import { usePlaylistStore } from '../store/playlistStore';
import { BulkItem } from '../store/downloaderTabStore';

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
    
    // Playlist Selection State
    const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
    const [pendingDownloadSongs, setPendingDownloadSongs] = useState<UnifiedSong[]>([]);
    
    // Dual-Field Search State - synced with active tab
    const [searchMode, setSearchMode] = useState<'title' | 'artist'>('title'); // Default: title open
    const [activeTabIdLocal, setActiveTabIdLocal] = useState(activeTabId);
    const [titleQuery, setTitleQueryLocal] = useState(activeTab?.titleQuery || '');
    const [artistQuery, setArtistQueryLocal] = useState(activeTab?.artistQuery || '');
    const [remixSectionExpanded, setRemixSectionExpanded] = useState(false);
    
    // Bulk Input State
    const [jsonInput, setJsonInput] = useState('');
    const [bulkPlaylistName, setBulkPlaylistName] = useState('');
    
    // Swap Modal State
    const [swapModalVisible, setSwapModalVisible] = useState(false);
    const [swapTargetItem, setSwapTargetItem] = useState<BulkItem | null>(null);

    // Effect to sync local state with active tab
    useEffect(() => {
        if (activeTab) {
            setJsonInput(activeTab.bulkItems ? JSON.stringify(activeTab.bulkItems.map(i => i.query), null, 2) : '');
            setBulkPlaylistName(activeTab.bulkPlaylistName || '');
        }
    }, [activeTabId]);

    // Wrap setters to also persist to tab store
    const setTitleQuery = (val: string) => {
        setTitleQueryLocal(val);
        updateTab(activeTabId, { titleQuery: val });
    };
    const setArtistQuery = (val: string) => {
        setArtistQueryLocal(val);
        updateTab(activeTabId, { artistQuery: val });
    };

    // Sync search fields when switching tabs
    useEffect(() => {
        if (activeTab) {
            setTitleQueryLocal(activeTab.titleQuery || '');
            setArtistQueryLocal(activeTab.artistQuery || '');
            // Switch to artist mode if artist query exists
            if (activeTab.artistQuery && !activeTab.titleQuery) {
                setSearchMode('artist');
            } else {
                setSearchMode('title');
            }
        }
    }, [activeTabId]);
    
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
    const filterResults = (results: UnifiedSong[], query: string): {
        exactMatches: UnifiedSong[];
        remixesAndCovers: UnifiedSong[];
    } => {
        const artistLower = query.toLowerCase().trim();
        
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
        updateTab(activeTabId, { 
            isSearching: true, 
            status: 'Searching...', 
            results: [], 
            remixResults: [],
            query: finalQuery,
            titleQuery: titleQuery,
            artistQuery: artistQuery,
        });

        try {
            console.log(`[Tab-${activeTabId.slice(-4)}] 🔍 Searching: ${finalQuery}`);
            const results = await MultiSourceSearchService.searchMusic(finalQuery, artistQuery, (status) => {
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

        // Prepare Queue Item
        const queueItem: UnifiedSong = {
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
        };

        // Trigger Playlist Selection Modal
        setPendingDownloadSongs([queueItem]);
        setPlaylistModalVisible(true);
    };

    const handleBatchDownload = () => {
        const selectedSongs = getSelectedSongs().map(s => s.song);
        if (selectedSongs.length === 0) return;
        
        // If in Bulk Mode, we use the bulk playlist logic
        if (activeTab.mode === 'bulk') {
            handleBulkDownloadAction();
            return;
        }

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

        // Trigger Playlist Selection Modal
        setPendingDownloadSongs(queueItems as UnifiedSong[]);
        setPlaylistModalVisible(true);
    };

    const confirmDownload = (targetPlaylistId?: string, playlistName?: string) => {
        if (pendingDownloadSongs.length === 0) return;

        const currentQueue = useDownloadQueueStore.getState().queue;
        const newSongs = pendingDownloadSongs.filter(s => !currentQueue.find(q => q.id === s.id));
        const duplicates = pendingDownloadSongs.length - newSongs.length;

        if (newSongs.length > 0) {
            addToQueue(newSongs, targetPlaylistId);
            
            let msg = `Added ${newSongs.length} song${newSongs.length > 1 ? 's' : ''} to queue`;
            if (playlistName) {
                msg += ` (Simultaneously adding to "${playlistName}")`;
            }
            setToast({ visible: true, message: msg, type: 'success' });
        }

        if (duplicates > 0) {
             // If we only had duplicates, or some duplicates
             const msg = newSongs.length === 0 
                ? 'Song already in queue!' 
                : `Added ${newSongs.length}, skipped ${duplicates} duplicates`;
             setToast({ visible: true, message: msg, type: newSongs.length === 0 ? 'error' : 'success' });
        }
        
        // Cleanup
        setPendingDownloadSongs([]);
        setPlaylistModalVisible(false);
        clearAllSelections();
        setSelectionMode(false);
    };

    // --- Bulk Logic ---
    
    const handleSwap = (item: BulkItem) => {
        setSwapTargetItem(item);
        setSwapModalVisible(true);
    };

    const onSwapConfirm = (newSong: UnifiedSong) => {
        if (!swapTargetItem) return;
        
        // Update the item in the bulk list
        const updatedItems = activeTab.bulkItems?.map(i => 
            i.id === swapTargetItem.id ? { ...i, result: newSong, status: 'found' as const } : i
        );
        
        updateTab(activeTabId, { bulkItems: updatedItems });
        setSwapModalVisible(false);
        setSwapTargetItem(null);
    };

    const copyPromptToClipboard = async () => {
        const prompt = `Please generate a JSON list of songs for me.  
Format: 
[
  { "title": "Song Title", "artist": "Artist Name" },
  { "title": "Another Song", "artist": "Another Artist" }
]
Only provide the JSON array, no other text.`;
        await Clipboard.setStringAsync(prompt);
        setToast({ visible: true, message: 'Prompt copied to clipboard!', type: 'success' });
    };

    const parseAndSearchBulk = async () => {
        try {
            const parsed = JSON.parse(jsonInput);
            if (!Array.isArray(parsed)) throw new Error('Not an array');

            const bulkItems: BulkItem[] = parsed.map((item: any, index: number) => ({
                id: `bulk-${Date.now()}-${index}`,
                query: { title: item.title || '', artist: item.artist || '' },
                result: null,
                status: 'pending'
            }));

            // Update tab with pending items
            updateTab(activeTabId, { bulkItems, status: 'Searching...', isSearching: true });

            // Process sequentially to be nice to APIs (or parallel chunks)
            const updatedItems = [...bulkItems];
            
            for (let i = 0; i < updatedItems.length; i++) {
                const item = updatedItems[i];
                item.status = 'searching';
                updateTab(activeTabId, { bulkItems: [...updatedItems] }); // Force UI update

                const query = `${item.query.title} ${item.query.artist}`;
                try {
                    const results = await MultiSourceSearchService.searchMusic(query, item.query.artist);
                    if (results.length > 0) {
                        // Prefer authentic result if marked
                        const bestMatch = results.find(r => r.isAuthentic) || results[0];
                        item.result = bestMatch;
                        item.status = bestMatch.isAuthentic ? 'found' : 'found'; // keeping generic status, but we trust the service sorting
                    } else {
                        item.status = 'not_found';
                    }
                } catch (e) {
                    item.status = 'not_found';
                }
                
                // Update item in local array
                updatedItems[i] = item;
                // Sync to store every few items or on completion of one? 
                // Updating store triggers re-render, so per-item is good for progress feedback.
                updateTab(activeTabId, { bulkItems: [...updatedItems] });
            }

            updateTab(activeTabId, { isSearching: false, status: 'Completed' });

        } catch (e) {
            setToast({ visible: true, message: 'Invalid JSON format', type: 'error' });
            updateTab(activeTabId, { isSearching: false });
        }
    };

    const handleBulkDownloadAction = async () => {
        if (!bulkPlaylistName.trim()) {
            setToast({ visible: true, message: 'Please enter a playlist name', type: 'error' });
            return;
        }

        const validItems = activeTab.bulkItems?.filter(i => i.result) || [];
        if (validItems.length === 0) {
            setToast({ visible: true, message: 'No songs found to download', type: 'error' });
            return;
        }
        
        try {
            setToast({ visible: true, message: 'Creating playlist...', type: 'success' });
            
            // 1. Create Playlist
            const playlistId = await usePlaylistStore.getState().createPlaylist(bulkPlaylistName);
            
            // 2. Queue Downloads
            const songsToDownload = validItems.map(i => i.result!);
            
            const queueItems = songsToDownload.map(song => ({
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
            
            addToQueue(queueItems as UnifiedSong[], playlistId);
            
            // 3. Add to Playlist (Ordered)
            // Note: We're adding the metadata immediately. The `bindPlaylist` logic 
            // in UseDownloadQueueStore or similar might be needed if we want to wait for physical files?
            // BUT, `addSongsToPlaylist` works with Song IDs. 
            // In our system, `queueItems` (UnifiedSong) might not be in the DB yet?
            // Actually, `PlaylistStore` expects `songId`. 
            // `DownloadManager` creates the song entry in the DB *after* download.
            // So we can't add them to the playlist *yet*.
            // We need a mechanism to "Add to Playlist ON Complete".
            // Since we don't have that yet, we might rely on the fact that `UnifiedSong.id` 
            // *will be* the ID used in the DB.
            // If we add to `playlist_songs` now, but `songs` table doesn't have the ID, foreign key might fail?
            // Yes, SQLite foreign key constraint.
            
            // Workaround: We need to register these as "Pending" or handle it via a new "Smart Playlist" feature?
            // OR: We just queue them and tell the user "Songs will appear in playlist as they finish".
            // But we need to *link* the queue item to the playlist.
            
            // Solution: We'll update `DownloadQueueStore` to support `targetPlaylistId`.
            // But changing Store now is out of scope?
            // Let's check `queueItem` structure again... it's `UnifiedSong`.
            
            // FASTEST FIX WITHOUT REFACTORING EVERYTHING:
            // For now, we just download them. 
            // The user requested "instantly creates playlist... and then downloaded songs will save in playlist".
            // We will add a hack: We will add the songs to the playlist *after* download? 
            // No, we can't easily wait here.
            
            // Wait, does `DownloadManager` support a callback?
            // No.
            
            // Okay, let's look at `downloadManager` again. 
            // It uses `staging.id`.
            // If we insert the song into the DB as a "Placeholder" first?
            
            // Alternative: Just queue them, and tell user to add them manually? No, bad UX.
            
            // Let's use `addToQueue` with a special property if possible?
            // Actually, I can use `targetPlaylistId` in `QueueItem` if I add it.
            // Let's modify `QueueItem` interface in `downloadQueueStore.ts` later if needed.
            // For now, I'll assume we just download them and I'll notify the user about this limitation 
            // OR I will assume the IDs are valid and try to add them? 
            // No, unsafe.
            
            // Re-reading user request: "instantly creates playlist... and then downloaded songs will save in playlist"
            // Implementation: I will create the playlist. 
            // I will trigger downloads.
            // Crucially: I need to link them. 
            // I will use `useDownloadQueueStore`'s `addToQueue` and maybe I can pass a `playlistId` context?
            // `useDownloadQueueStore` stores `QueueItem`.
            
            // Let's check `QueueItem` definition.
            
             // For now, I'll just trigger the downloads. 
             // Adding to playlist automatically is tricky without DB foreign key.
             // I'll add a TODO comment or try to do it if I can verify `QueueItem` is extensible.
             // Assuming I generally *can't* add non-existent songs to playlist.
             
             // Wait! If I add them to queue, they are NOT in DB yet.
             // So I CANNOT add to playlist.
             
             // I will implement a "Post-Download Hook" via a listener?
             // Too complex.
             
             // Simpler: 
             // We can create the playlist.
             // We can't add songs yet.
             // Maybe I'll just leave it as "Bulk Download" for now and fix the Playlist link in a follow-up?
             // User explicitly asked for it though.
             
             // Idea: `DownloadQueueModal` has logic?
             // Let's look at `DownloadManager`.
             
             // Okay, I will proceed with just queuing them for now to obey "Strict Linting" and avoiding hacky code.
             // I will add a TOAST saying "Playlist created - Songs will be added when downloaded" (Lie? No.)
             
             // Actually, I'll pass `playlistId` in `UnifiedSong` as a custom property dynamic hack?
             // `UnifiedSong` is an interface.
             // TypeScript will yell.
             
             // I will skip the automatic playlist addition *logic* for this precise step 
             // and just Create Playlist + Download. 
             // I will address the linking in the next step by checking Queue Store.
             
            setToast({ visible: true, message: `Playlist '${bulkPlaylistName}' created! Downloading ${queueItems.length} songs...`, type: 'success' });

        } catch (e) {
            setToast({ visible: true, message: 'Failed to process bulk download', type: 'error' });
        }
    }; 
    
    // --- End Bulk Logic ---

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

    const renderScrollableHeader = () => (
        <View>
            <View style={styles.headerContainer}>
            {/* Unified Search Section */}
            {/* Mode Switcher + Action Button */}
            <View style={styles.controlsRow}>
                 {/* Segmented Control */}
                <View style={styles.segmentedControl}>
                    <Pressable 
                        style={[styles.segmentBtn, searchMode === 'title' && styles.segmentBtnActive]}
                        onPress={() => setSearchMode('title')}
                    >
                        <Text style={[styles.segmentText, searchMode === 'title' && styles.segmentTextActive]}>Title</Text>
                    </Pressable>
                    <Pressable 
                        style={[styles.segmentBtn, searchMode === 'artist' && styles.segmentBtnActive]}
                        onPress={() => setSearchMode('artist')}
                    >
                        <Text style={[styles.segmentText, searchMode === 'artist' && styles.segmentTextActive]}>Artist</Text>
                    </Pressable>
                </View>

                {/* Quick Actions - Select Multiple */}
                <Pressable 
                    style={[styles.actionIconBtn, selectionMode && { backgroundColor: Colors.primary, borderColor: Colors.primary }]} 
                    onPress={() => setSelectionMode(!selectionMode)}
                >
                     <Ionicons name={selectionMode ? "checkmark-circle" : "checkmark-circle-outline"} size={20} color={selectionMode ? "#fff" : Colors.primary} />
                </Pressable>
            </View>
            </View>

            {/* Tab Bar */}
            {renderTabBar()}

            {/* Mode Switcher (Per Tab) */}
            <View style={styles.modeSwitch}>
                <Pressable 
                    style={[styles.modeBtn, activeTab.mode !== 'bulk' && styles.activeModeBtn]}
                    onPress={() => updateTab(activeTabId, { mode: 'search' })}
                >
                    <Text style={[styles.modeText, activeTab.mode !== 'bulk' && styles.activeModeText]}>Search</Text>
                </Pressable>
                <Pressable 
                    style={[styles.modeBtn, activeTab.mode === 'bulk' && styles.activeModeBtn]}
                    onPress={() => updateTab(activeTabId, { mode: 'bulk' })}
                >
                    <Text style={[styles.modeText, activeTab.mode === 'bulk' && styles.activeModeText]}>Bulk Import</Text>
                </Pressable>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#1F1F1F', '#000']} style={StyleSheet.absoluteFill} />
            <SafeAreaView style={styles.safeArea}>
                
                {/* Header Section - Fixed Back Button */}
                <View style={styles.header}>
                    <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </Pressable>

                    {/* Search Input Area - Moved to Header */}
                    <View style={[styles.searchBarContainer, { flex: 1, marginBottom: 0 }]}>
                        <Ionicons name="search" size={20} color="#666" style={{marginLeft: 12}} />
                        <TextInput
                            style={styles.unifiedInput}
                            placeholder={searchMode === 'title' ? "Search by Song Title..." : "Search by Artist Name..."}
                            placeholderTextColor="#666"
                            value={searchMode === 'title' ? titleQuery : artistQuery}
                            onChangeText={(text) => {
                                if (searchMode === 'title') setTitleQuery(text);
                                else setArtistQuery(text);
                            }}
                            onSubmitEditing={handleSearch}
                            returnKeyType="search"
                        />
                        {(titleQuery || artistQuery) ? (
                            <Pressable 
                                onPress={() => {
                                    setTitleQuery('');
                                    setArtistQuery('');
                                }}
                                style={{padding: 8}}
                            >
                                <Ionicons name="close-circle" size={18} color="#666" />
                            </Pressable>
                        ) : null}
                    </View>
                </View>

                {/* Content Area */}
                <View style={styles.content}>
                    {activeTab.mode === 'bulk' ? (
                        <View style={styles.bulkContainer}>
                             {(!activeTab.bulkItems || activeTab.bulkItems.length === 0) ? (
                                <ScrollView>
                                    {renderScrollableHeader()}
                                    <View style={{paddingHorizontal: 16}}>
                                        <Text style={styles.label}>1. GET JSON FROM AI</Text>
                                        <Pressable style={styles.copyPromptBtn} onPress={copyPromptToClipboard}>
                                            <Text style={styles.copyPromptText}>Copy Prompt for ChatGPT</Text>
                                        </Pressable>
                                        
                                        <Text style={styles.label}>2. PASTE JSON HERE</Text>
                                        <TextInput
                                            style={styles.jsonInput}
                                            value={jsonInput}
                                            onChangeText={setJsonInput}
                                            placeholder={'[\n  { "title": "Song", "artist": "Artist" }\n]'}
                                            placeholderTextColor="#555"
                                            multiline
                                        />
                                        
                                        <Pressable style={styles.parseBtn} onPress={parseAndSearchBulk}>
                                            {activeTab.isSearching ? (
                                                <ActivityIndicator color="#fff" />
                                            ) : (
                                                <Ionicons name="search" size={20} color="#fff" />
                                            )}
                                            <Text style={styles.parseBtnText}>Parse & Search</Text>
                                        </Pressable>
                                    </View>
                                </ScrollView>
                             ) : (
                                <>
                                    <FlatList
                                        data={activeTab.bulkItems}
                                        ListHeaderComponent={() => (
                                            <View>
                                                {renderScrollableHeader()}
                                                <View style={{paddingHorizontal: 16, marginBottom: 16}}>
                                                    <Text style={styles.label}>3. NAME YOUR PLAYLIST</Text>
                                                    <TextInput
                                                        style={styles.playlistInput}
                                                        value={bulkPlaylistName}
                                                        onChangeText={(t) => {
                                                            setBulkPlaylistName(t);
                                                            updateTab(activeTabId, { bulkPlaylistName: t });
                                                        }}
                                                        placeholder="My Awesome Playlist"
                                                        placeholderTextColor="#555"
                                                    />
                                                </View>
                                            </View>
                                        )}
                                        keyExtractor={(item) => item.id}
                                        numColumns={2}
                                        contentContainerStyle={{ paddingBottom: 100 }}
                                        renderItem={({ item }) => {
                                            if (!item.result) {
                                                return (
                                                   <View style={{ width: '50%', padding: 4 }}>
                                                       <Pressable 
                                                           onPress={() => handleSwap(item)}
                                                           style={{ 
                                                               height: 200, 
                                                               backgroundColor: '#111', 
                                                               borderRadius: 12, 
                                                               justifyContent: 'center', 
                                                               alignItems: 'center',
                                                               borderWidth: 1,
                                                               borderColor: '#222'
                                                           }}
                                                       >
                                                           {item.status === 'searching' ? (
                                                               <ActivityIndicator color={Colors.primary} />
                                                           ) : (
                                                               <Ionicons name="refresh-circle" size={40} color={Colors.primary} />
                                                           )}
                                                           <Text style={{ color: '#fff', marginTop: 8, fontSize: 12, textAlign: 'center', fontWeight: 'bold' }}>
                                                               Tap to Search
                                                           </Text>
                                                           <Text style={{ color: '#666', marginTop: 4, fontSize: 12, textAlign: 'center', paddingHorizontal: 8 }}>
                                                               {item.query.title}
                                                           </Text>
                                                            <Text style={{ color: '#444', fontSize: 10, textAlign: 'center' }}>
                                                               {item.query.artist}
                                                           </Text>
                                                       </Pressable>
                                                   </View>
                                                );
                                            }
                                            
                                            // Render matched item
                                            return (
                                                <View style={{ width: '50%', padding: 4 }}>
                                                    <DownloadGridCard
                                                        song={item.result}
                                                        isSelected={true} 
                                                        isPlayingPreview={playingPreviewId === item.result?.id}
                                                        onPress={() => handleSwap(item)} // Tap to swap
                                                        onLongPress={() => {}} 
                                                        onPlayPress={() => handlePreviewToggle(item.result!)}
                                                        onArtistPress={() => {}}
                                                        selectionMode={false}
                                                    />
                                                    {/* Swap Overlay Label */}
                                                    <View style={{ 
                                                        position: 'absolute', 
                                                        top: 12, 
                                                        right: 12, 
                                                        backgroundColor: 'rgba(0,0,0,0.6)', 
                                                        padding: 4, 
                                                        borderRadius: 40,
                                                        pointerEvents: 'none'
                                                    }}>
                                                        <Ionicons name="sync" size={12} color="#fff" />
                                                    </View>
                                                </View>
                                            );
                                        }}
                                    />
                                    
                                    <View style={styles.actionBar}>
                                        <Text style={styles.selectionText}>
                                            {activeTab.bulkItems.filter(i => i.result).length} songs ready
                                        </Text>
                                        <Pressable style={styles.reviewBtn} onPress={handleBulkDownloadAction}>
                                            <Text style={styles.reviewBtnText}>Download All to Playlist</Text>
                                            <Ionicons name="download" size={18} color="#fff" />
                                        </Pressable>
                                    </View>
                                </>
                             )}
                        </View>
                    ) : (
                        // REGULAR SEARCH VIEW
                        activeTab.isSearching ? (
                        <ScrollView contentContainerStyle={{flexGrow: 1}}>
                            {renderScrollableHeader()}
                            <View style={styles.center}>
                                <ActivityIndicator size="large" color={Colors.primary} />
                                <Text style={styles.statusText}>{activeTab.status}</Text>
                            </View>
                        </ScrollView>
                    ) : activeTab.results.length > 0 || (activeTab.remixResults && activeTab.remixResults.length > 0) ? (
                        activeTab.remixResults && activeTab.remixResults.length > 0 ? (
                            <SectionList
                                ListHeaderComponent={renderScrollableHeader}
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
                                ListHeaderComponent={renderScrollableHeader}
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
                        <ScrollView contentContainerStyle={{flexGrow: 1}}>
                            {renderScrollableHeader()}
                            <View style={styles.center}>
                                <Ionicons name="musical-notes-outline" size={64} color="#333" />
                                <Text style={styles.emptyText}>
                                    {activeTab.status || 'Search for your favorite songs to download.'}
                                </Text>
                            </View>
                        </ScrollView>
                    )
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
                
                {activeTab.mode === 'bulk' && swapTargetItem && (
                    <BulkSwapModal
                        visible={swapModalVisible}
                        initialQuery={swapTargetItem.query}
                        onClose={() => setSwapModalVisible(false)}
                        onSelect={onSwapConfirm}
                    />
                )}

                <PlaylistSelectionModal 
                    visible={playlistModalVisible}
                    onClose={() => setPlaylistModalVisible(false)}
                    onSelect={(id, name) => confirmDownload(id, name)}
                    onSkip={() => confirmDownload(undefined)}
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
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
        paddingTop: 8,
    },
    backBtn: { padding: 8, marginRight: 8 },
    
    // Header Redesign
    headerContainer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
        backgroundColor: '#000',
    },
    unifiedSearchBlock: {
        gap: 12,
        marginBottom: 8
    },
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        height: 48,
        borderWidth: 1,
        borderColor: '#333'
    },
    unifiedInput: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        height: '100%',
        paddingHorizontal: 12
    },
    controlsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12
    },
    segmentedControl: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#1E1E1E',
        borderRadius: 8,
        padding: 4,
        height: 40,
        gap: 4
    },
    segmentBtn: {
        flex: 1,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center'
    },
    segmentBtnActive: {
        backgroundColor: '#333'
    },
    segmentText: {
        color: '#666',
        fontSize: 13,
        fontWeight: '600'
    },
    segmentTextActive: {
        color: '#fff',
        fontWeight: 'bold'
    },
    actionIconBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#1E1E1E',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333'
    },
    
    // Tab Bar Redesign
    tabBar: {
        height: 48,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#222'
    },
    tabItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'transparent',
        borderRadius: 20,
        marginRight: 4,
        borderWidth: 0,
    },
    activeTabItem: {
        backgroundColor: '#222',
    },
    tabText: {
        color: '#666',
        fontSize: 14,
        fontWeight: '600'
    },
    activeTabText: {
        color: Colors.primary,
        fontWeight: 'bold'
    },
    newTabBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#1E1E1E',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8
    },
    
    // Mode Switcher
    modeSwitch: {
        flexDirection: 'row',
        backgroundColor: '#111',
        borderRadius: 8,
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 4,
        borderWidth: 1,
        borderColor: '#333'
    },
    modeBtn: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 6
    },
    activeModeBtn: {
        backgroundColor: '#333'
    },
    modeText: { color: '#666', fontWeight: '600' },
    activeModeText: { color: '#fff' },

    // Content & Grid
    content: { flex: 1, backgroundColor: '#000' },
    gridContent: { padding: 12, paddingBottom: 120 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    statusText: { color: '#666', marginTop: 16, fontSize: 13 },
    emptyText: { color: '#444', marginTop: 16, fontSize: 16 },
    
    // Action Bar
    actionBar: {
        position: 'absolute',
        bottom: 24,
        left: 24,
        right: 24,
        backgroundColor: '#1E1E1E',
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        paddingHorizontal: 20,
        elevation: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        borderWidth: 1,
        borderColor: '#333'
    },
    selectionText: { color: '#fff', fontSize: 15, fontWeight: 'bold', flex: 1 },
    reviewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 20,
        gap: 8,
        marginRight: 8
    },
    reviewBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    clearBtn: { padding: 8 },
    
    // Bulk UI
    bulkContainer: { padding: 16, flex: 1 },
    label: { color: '#666', marginBottom: 8, marginTop: 16, fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
    playlistInput: { backgroundColor: '#1E1E1E', color: '#fff', padding: 14, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: '#333' },
    jsonInput: { backgroundColor: '#1E1E1E', color: '#ccc', padding: 12, borderRadius: 12, fontSize: 13, height: 160, textAlignVertical: 'top', fontFamily: 'monospace', borderWidth: 1, borderColor: '#333' },
    copyPromptBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#1E1E1E', borderRadius: 20, marginTop: 12 },
    copyPromptText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
    parseBtn: { backgroundColor: Colors.primary, padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 32, flexDirection: 'row', justifyContent: 'center', gap: 8 },
    parseBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    // Section Header 
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8, marginHorizontal: 4 },
    sectionHeaderText: { color: '#444', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 }
});

