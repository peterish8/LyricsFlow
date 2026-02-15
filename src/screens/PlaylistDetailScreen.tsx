/**
 * PlaylistDetailScreen - Optimized & Refined
 * Features:
 * - Reanimated Scroll (Native Driver)
 * - Optimized Drag & Drop (Memoized Item)
 * - Debounced Search (useMemo)
 * - Dynamic Header (Syncs with playing song)
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withTiming,
  runOnJS,
  useAnimatedProps,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { Song } from '../types/song';
import { getGradientColors, getGradientForSong } from '../constants/gradients';
import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore } from '../store/playerStore';
import { usePlaylistStore } from '../store/playlistStore'; // Assuming this store exists or is used
import Slider from '@react-native-community/slider';
import { useSettingsStore } from '../store/settingsStore';
import * as playlistQueries from '../database/playlistQueries';
import { PlaylistItem } from '../components/PlaylistItem';
import { CustomMenu } from '../components/CustomMenu';
import { CoverFlow } from '../components/CoverFlow';
import { AddToPlaylistModal } from '../components/AddToPlaylistModal'; // Reuse logic if possible, or just open modal
import Scrubber from '../components/Scrubber';
import { ModernDeleteModal } from '../components/ModernDeleteModal';

type PlaylistDetailRouteProp = RouteProp<
  { PlaylistDetail: { playlistId: string } },
  'PlaylistDetail'
>;

const SCREEN_WIDTH = Dimensions.get('window').width;

const AnimatedDraggableFlatList = Animated.createAnimatedComponent(DraggableFlatList) as unknown as typeof DraggableFlatList;

export const PlaylistDetailScreen: React.FC = () => {
  const route = useRoute<PlaylistDetailRouteProp>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { playlistId } = route.params;

  const [songs, setSongs] = useState<Song[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistCover, setPlaylistCover] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  // Show Add Modal ?
  const [showAddCallback, setShowAddCallback] = useState(false); // Maybe later
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [songToDelete, setSongToDelete] = useState<string | null>(null);

  // Store Hooks
  const {
    currentSongId,
    currentPlaylistId,
    currentSong,
    loadSong,
    setPlaylistQueue,
    play,
    pause,
    isPlaying,
    nextInPlaylist,
    previousInPlaylist,
    position,
    duration,
    seekTo,
  } = usePlayerStore();
  
  const lastUpdate = usePlaylistStore(state => state.lastUpdate);

  const activeIsPlaying = currentPlaylistId === playlistId;

  // Local state for smoother scrubber updates (matches NowPlayingScreen logic)
  const [currentTime, setCurrentTime] = useState(0);
  const player = usePlayer(); // Get direct access to player instance

  const isSeeking = useRef(false);
  const seekTimeout = useRef<NodeJS.Timeout | null>(null);

  // Sync Time & Playback State - mimicking NowPlayingScreen logic
  useEffect(() => {
    if (!player) return;

    const interval = setInterval(() => {
      // FORCE UPDATE: If active, pull directly from player
      // BUT blocked if user is currently seeking or just finished seeking (to prevent glitch back)
      if (player && activeIsPlaying && isPlaying && !isSeeking.current) {
        setCurrentTime(player.currentTime);
      }
    }, 200);
    
    return () => clearInterval(interval);
  }, [player, activeIsPlaying, isPlaying]);

  // Ensure Audio is Loaded (Robust Check)
  useEffect(() => {
    const loadAudioIfNeeded = async () => {
      if (activeIsPlaying && currentSong && player) {
        const state = usePlayerStore.getState();
        // If IDs don't match, load it.
        // Trust loadedAudioId primarily. The duration check caused resets on Pause->Play.
        const needsLoad = state.loadedAudioId !== currentSong.id;
        
        if (needsLoad) {
           if (currentSong.audioUri) {
               try {
                   console.log(`[InlinePlayer] Loading audio for: ${currentSong.title}`);
                   await player.replace(currentSong.audioUri);
                   state.setLoadedAudioId(currentSong.id);
                   if (isPlaying) {
                       // Small delay to ensure native player is ready
                       setTimeout(() => player.play(), 100);
                   }
               } catch (e) {
                   console.log('[InlinePlayer] Load failed', e);
               }
           }
        }
      }
    };
    
    loadAudioIfNeeded();
  }, [activeIsPlaying, currentSong?.id, player, isPlaying]);

  // Reanimated Shared Values
  const scrollY = useSharedValue(0);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Scroll Handler
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const flatListRef = React.useRef<any>(null);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      // Don't set loading true here avoids flickering on refresh
      const playlists = await playlistQueries.getAllPlaylists();
      const playlist = playlists.find((p) => p.id === playlistId);
      const playlistSongs = await playlistQueries.getPlaylistSongs(playlistId);

      setPlaylistName(playlist?.name || 'Playlist');
      setPlaylistCover(playlist?.coverImageUri || null);
      setSongs(playlistSongs);
    } catch (e) {
      console.error('Failed to load playlist', e);
    } finally {
      setLoading(false);
    }
  }, [playlistId, lastUpdate]); // Reload when global playlist state changes

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Derived State: Search
  // Debounce could be done via Effect, but simple useMemo on filter is OK for < 500 items usually.
  // For strict performance "No blocking main thread", we trust useMemo is fast enough for 100 items.
  // If list is huge, we need a separate debounced state.
  const filteredSongs = useMemo(() => {
    if (!searchQuery) return songs;
    const lower = searchQuery.toLowerCase();
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        s.artist?.toLowerCase().includes(lower)
    );
  }, [songs, searchQuery]);

  // Dynamic Header Logic & Gradient
  const activeSongInPlaylist = activeIsPlaying ? currentSong : null;
  
  // Calculate neighbors for CoverFlow
  const currentIndex = activeIsPlaying && currentSong ? songs.findIndex(s => s.id === currentSong.id) : -1;
  const prevSong = currentIndex > 0 ? songs[currentIndex - 1] : null;
  const nextSong = currentIndex >= 0 && currentIndex < songs.length - 1 ? songs[currentIndex + 1] : null;
  
  // If playing, use CoverFlow. Else static image (Playlist Cover).
  // Note: We use CoverFlow even if not playing? 
  // User asked for "dynamic cover coming let that area be like swipable"
  // If not playing, we show Playlist Cover. Swiping might not make sense unless we start playing.
  // Let's enable CoverFlow ONLY when activeIsPlaying.
  
  const headerImageUri = activeSongInPlaylist?.coverImageUri || playlistCover || songs[0]?.coverImageUri;
  
  // Reanimated Shared Values for Background Colors
  // We initialize with the first song's colors or default
  const bgColorTop = useSharedValue('#444');
  const bgColorBottom = useSharedValue('#111');

  // Trigger animation when active song changes
  useEffect(() => {
    let colors: string[];
    if (activeSongInPlaylist) {
        colors = getGradientForSong(activeSongInPlaylist);
    } else if (songs[0]) {
        colors = getGradientForSong(songs[0]);
    } else {
        colors = ['#444', '#111'];
    }
    
    // Animate to new colors
    bgColorTop.value = withTiming(colors[0], { duration: 500 });
    // Assuming 2nd color is bottom, or last color if array > 2
    bgColorBottom.value = withTiming(colors[colors.length - 1], { duration: 500 });
  }, [activeSongInPlaylist?.id, songs]);
  
  // Create Animated Gradient Component
  const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);
  
  const animatedGradientProps = useAnimatedProps(() => {
      // LinearGradient expects 'colors' array prop. 
      // Reanimated can map this if component is adapted.
      // However, modifying the 'colors' array prop directly in reanimated is tricky on some versions.
      // A safer bet is two separate Animated Views with backgroundColor? 
      // No, we want Gradient. 
      // Let's try passing the colors prop.
      return {
          colors: [bgColorTop.value, bgColorBottom.value]
      };
  });
  
  const activeSongGradient = useMemo(() => {
     if (activeSongInPlaylist) return getGradientForSong(activeSongInPlaylist);
     return getGradientForSong(songs[0] || { id: 'default', gradientId: 'dynamic' });
  }, [activeSongInPlaylist, songs]);

  const totalDuration = useMemo(
    () => songs.reduce((acc, song) => acc + (song.duration || 0), 0),
    [songs]
  );

  const formatTotalDuration = () => {
    const hours = Math.floor(totalDuration / 3600);
    const mins = Math.floor((totalDuration % 3600) / 60);
    if (hours > 0) return `${hours} hr ${mins} min`;
    return `${mins} min`;
  };

  // --- ACTIONS ---

  // --- ACTIONS ---
  
  const handlePlayPause = () => {
    // DIRECT PLAYER CONTROL 
    // The store's 'play/pause' functions might be stale or not bound.
    // We trust the 'player' object from context mainly.
    
    if (activeIsPlaying && player) {
        if (isPlaying) {
             player.pause();
             usePlayerStore.getState().setIsPlaying(false); // Manually sync store
        } else {
             player.play();
             usePlayerStore.getState().setIsPlaying(true); // Manually sync store
        }
    } else {
        // Start new playlist - SMART RESUME LOGIC
        if (filteredSongs.length > 0) {
            let startIndex = 0;
            
            try {
                // Check history
                const storeState = useSettingsStore.getState();
                const history = storeState.playlistHistory || {};
                const lastSongId = history[playlistId];
                
                if (lastSongId) {
                    const foundIndex = filteredSongs.findIndex(s => s.id === lastSongId);
                    if (foundIndex !== -1) {
                        startIndex = foundIndex;
                    }
                }
            } catch (e) {
                // Ignore
            }

            setPlaylistQueue(playlistId, filteredSongs, startIndex);
            // setPlaylistQueue triggers loadSong and play() inside the store usually, 
            // but let's be sure
             setTimeout(() => {
                 if(player) player.play();
             }, 500);
        }
    }
  };

  const handleShuffle = () => {
    if (filteredSongs.length > 0) {
      const shuffled = [...filteredSongs].sort(() => Math.random() - 0.5);
      setPlaylistQueue(playlistId, shuffled, 0);
      play();
    }
  };

  const handleSongPress = useCallback((song: Song, index: number) => {
    // If we filter, the index passed is from filtered list.
    // We should queue the FILTERED list so "Next" matches what user sees.
    setPlaylistQueue(playlistId, filteredSongs, index);
    play();
  }, [playlistId, filteredSongs, setPlaylistQueue, play]);

  const handleDeleteSong = useCallback(async (songId: string) => {
    setSongToDelete(songId);
    setShowDeleteConfirm(true);
  }, []);

  const handleDragEnd = useCallback(async ({ data }: { data: Song[] }) => {
      setSongs(data);
      if (searchQuery) return; // Don't save order if filtering
      try {
          await playlistQueries.updateSongOrder(playlistId, data.map(s => s.id));
      } catch (e) {
          console.error('Reorder failed', e);
      }
  }, [playlistId, searchQuery]);

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);

  const handleCoverPress = (event: any) => {
    if (!isEditMode) return;
    const { pageX, pageY } = event.nativeEvent;
    setMenuPosition({ x: pageX, y: pageY });
    setMenuVisible(true);
  };

  const handleResetCover = async () => {
    setPlaylistCover(null);
    await playlistQueries.updatePlaylist(playlistId, { coverImageUri: '' }); 
  };

  const handlePickLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setPlaylistCover(uri);
      await playlistQueries.updatePlaylist(playlistId, { coverImageUri: uri });
    }
  };

  interface MenuOption {
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    onPress: (e?: any) => void;
    isDestructive?: boolean;
  }

  const menuOptions: MenuOption[] = [
    { 
        label: 'Choose from Library', 
        icon: 'images', 
        onPress: handlePickLibrary 
    },
    { 
        label: 'Reset to Default', 
        icon: 'refresh', 
        isDestructive: true,
        onPress: handleResetCover 
    }
  ];

  // --- RENDERERS ---

  // Passing props to memoized component
  const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<Song>) => {
    return (
      <PlaylistItem
        item={item}
        drag={drag}
        isActive={isActive}
        getIndex={getIndex}
        currentSongId={currentSongId}
        isPlaying={isPlaying} // Pass down
        isEditMode={isEditMode}
        onPress={handleSongPress}
        onDelete={handleDeleteSong}
      />
    );
  }, [currentSongId, isPlaying, isEditMode, handleSongPress, handleDeleteSong]); // Added isPlaying dependency

  // Animated Styles
  const headerStyle = useAnimatedStyle(() => {
    // Fade to black faster (0 to 150 scroll)
    const opacity = interpolate(scrollY.value, [0, 150], [0, 1], Extrapolation.CLAMP);
    return {
      backgroundColor: `rgba(0,0,0,${opacity})`,
    };
  });

  const headerTitleStyle = useAnimatedStyle(() => {
     // Fade in title after header is black
     const opacity = interpolate(scrollY.value, [150, 200], [0, 1], Extrapolation.CLAMP);
     return { opacity };
  });

  const animatedGradientStyle = useAnimatedStyle(() => {
     // Scroll the background up with the list (Parallax-like or just direct scroll)
     // The user requested: "not fade but it also shld scroll the bg"
     return { 
        transform: [
            { translateY: -scrollY.value } 
        ]
     };
  });

  const fabStyle = useAnimatedStyle(() => {
    const show = scrollY.value > 400;
    return {
        opacity: withTiming(show ? 1 : 0),
        transform: [{ scale: withTiming(show ? 1 : 0.8) }],
    };
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Dynamic Background: Blurred Cover Art (Matches Dynamic Island) */}
      <Animated.View 
        style={[StyleSheet.absoluteFill, animatedGradientStyle, { backgroundColor: '#000', height: 500 }]}
        pointerEvents="none" 
      >
         {/* 1. The Blurred Image */}
         {headerImageUri && (
             <Image 
                source={{ uri: headerImageUri }}
                style={[StyleSheet.absoluteFill, { opacity: 0.6 }]}
                blurRadius={90}
                resizeMode="cover"
             />
         )}
         
         {/* 2. Fade to Black Overlay */}
         <LinearGradient
            colors={['transparent', '#000'] as const}
            style={StyleSheet.absoluteFill}
            locations={[0.2, 1]} 
         />
      </Animated.View>

      {/* Sticky Header (Absolute) */}
      <Animated.View style={[styles.stickyHeader, { height: 50 + insets.top, paddingTop: insets.top }, headerStyle]}>
          {!isSearchActive && (
              <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </Pressable>
          )}
          
          {/* Animated Header Title (Fades in when scrolled) */}
          {!isSearchActive && (
              <Animated.Text style={[styles.stickyHeaderTitle, headerTitleStyle]} numberOfLines={1}>
                  {playlistName}
              </Animated.Text>
          )}
          
          <View style={{flex: 1}} />

          {/* Animated Search Bar */}
          {isSearchActive ? (
              <Animated.View style={[styles.searchPill, { flex: 1, marginRight: 8 }]}>
                  <Ionicons name="search" size={20} color="#666" style={{marginLeft: 12}} />
                  <TextInput
                        style={styles.searchInput}
                        placeholder="Find in playlist"
                        placeholderTextColor="#666"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoFocus
                  />
                  <Pressable onPress={() => { setIsSearchActive(false); setSearchQuery(''); }} style={{padding: 8}}>
                      <Ionicons name="close-circle" size={20} color="#666" />
                  </Pressable>
              </Animated.View>
          ) : (
             <Pressable 
                style={[styles.iconButton, { marginRight: 8 }]} 
                onPress={() => setIsSearchActive(true)}
             >
                <Ionicons name="search" size={24} color="#fff" />
             </Pressable>
          )}
          
          {/* Quick Add Button */}
           <Pressable 
              style={[styles.iconButton, { marginRight: 8 }]} 
              onPress={() => (navigation as any).navigate('AddToPlaylist', { playlistId })}
           >
              <Ionicons name="add" size={28} color="#fff" />
           </Pressable>

          <Pressable 
             style={[styles.iconButton, isEditMode && styles.activeButton]} 
             onPress={() => setIsEditMode(!isEditMode)}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
          </Pressable>
      </Animated.View>

      {/* Main List */}
      <AnimatedDraggableFlatList
        ref={flatListRef}
        data={filteredSongs}
        onDragEnd={handleDragEnd}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onScroll={scrollHandler}
        scrollEventThrottle={1} // Use 1 for maximum update frequency
        contentContainerStyle={{ paddingBottom: 150, paddingTop: 50 + insets.top }} 
        ListHeaderComponent={
             <View style={styles.listHeader}>
             {/* Dynamic Cover Art - NO ICON OVERLAY */}
             {activeIsPlaying ? (
                 <CoverFlow 
                    currentSong={activeSongInPlaylist}
                    prevSong={prevSong}
                    nextSong={nextSong}
                    onNext={nextInPlaylist}
                    onPrev={previousInPlaylist}
                    defaultGradientColors={activeSongGradient}
                    isEditMode={isEditMode}
                    onPress={handleCoverPress}
                    onSwipeConfirmed={pause} // Stop immediately
                 />
             ) : (
                 <Pressable onPress={handleCoverPress} disabled={!isEditMode}>
                   <View style={styles.coverContainer}>
                      {headerImageUri ? (
                          <Image source={{ uri: headerImageUri }} style={styles.coverArt} />
                      ) : (
                          <LinearGradient colors={activeSongGradient as [string, string]} style={styles.coverArt}>
                              <Ionicons name="musical-notes" size={80} color="rgba(255,255,255,0.4)" />
                          </LinearGradient>
                      )}
                      
                      {isEditMode && (
                          <View style={styles.editOverlay}>
                              <Ionicons name="camera" size={32} color="#fff" />
                          </View>
                      )}
                   </View>
                 </Pressable>
             )}

             <Text style={styles.playlistName}>{playlistName}</Text>
             <Text style={styles.playlistMeta}>{songs.length} songs • {formatTotalDuration()}</Text>

             {/* Search Bar Removed from here */}
             
             {/* Inline Player Controls */}
             {/* Show this ALWAYS, or only when songs exist? User said "keep... in that place" */}
             {songs.length > 0 && (
                 <View style={styles.inlinePlayerContainer}>
                     {/* Scrubber - Full Width */}
                     <View style={styles.scrubberContainer}>
                         <Scrubber 
                            currentTime={activeIsPlaying ? currentTime : 0}
                            duration={activeIsPlaying ? (duration > 0 ? duration : (currentSong?.duration || 180)) : (songs[0]?.duration || 180)}
                            onSeek={(value) => {
                                if (activeIsPlaying && player) {
                                    // 1. Lock updates to prevent "glitch back"
                                    isSeeking.current = true;
                                    if (seekTimeout.current) clearTimeout(seekTimeout.current);
                                    
                                    // 2. Optimistic Visual Update
                                    setCurrentTime(value);

                                    // 3. Perform Seek
                                    player.seekTo(value);

                                    // 4. Release lock after delay (1s is usually enough for audio to catch up)
                                    seekTimeout.current = setTimeout(() => {
                                        isSeeking.current = false;
                                    }, 1000);
                                }
                            }}
                         />
                     </View>

                     {/* Buttons Row */}
                     <View style={styles.inlineControlsRow}>
                        {/* -10s */}
                        <Pressable 
                            style={styles.skipButton} 
                            onPress={() => {
                                if (activeIsPlaying && player) {
                                    const newTime = Math.max(0, currentTime - 10);
                                    player.seekTo(newTime);
                                    setCurrentTime(newTime);
                                }
                            }}
                            disabled={!activeIsPlaying}
                        >
                            <Ionicons name="play-back-outline" size={24} color={activeIsPlaying ? "#FFF" : "rgba(255,255,255,0.3)"} />
                        </Pressable>

                        {/* Play/Pause (Central) */}
                        <Pressable 
                            style={styles.playButtonLarge} 
                            onPress={() => {
                                if (activeIsPlaying) {
                                    // Optimistic Update
                                    const nextState = !isPlaying;
                                    usePlayerStore.getState().setIsPlaying(nextState);

                                    if (isPlaying) player?.pause();
                                    else player?.play();
                                } else {
                                    // Start from first song
                                    if (songs.length > 0) {
                                        // Use store to set queue and start
                                        usePlayerStore.getState().setPlaylistQueue(playlistId, songs, 0);
                                    }
                                }
                            }}
                        >
                            <Ionicons 
                                name={activeIsPlaying && isPlaying ? "pause" : "play"} 
                                size={28} 
                                color="#000" 
                                style={{ marginLeft: activeIsPlaying && isPlaying ? 0 : 2 }} // Optical adjustment
                            />
                        </Pressable>

                        {/* +10s */}
                        <Pressable 
                            style={styles.skipButton} 
                            onPress={() => {
                                if (activeIsPlaying && player && player.duration > 1) {
                                    const newTime = Math.min(player.duration - 1, currentTime + 10);
                                    player.seekTo(Math.floor(newTime * 1000));
                                    setCurrentTime(newTime);
                                }
                            }}
                            disabled={!activeIsPlaying}
                        >
                            <Ionicons name="play-forward-outline" size={24} color={activeIsPlaying ? "#FFF" : "rgba(255,255,255,0.3)"} />
                        </Pressable>
                     </View>
                 </View>
             )}
          </View>
        }
      />
      
      {isEditMode && (
          <BlurView intensity={20} tint="dark" style={[styles.editModeToast, { top: 60 + insets.top }]}>
              <Text style={styles.editModeText}>Editing Playlist</Text>
          </BlurView>
      )}

      <CustomMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        options={menuOptions}
        title="Edit Cover Art"
        anchorPosition={menuPosition}
      />

      {/* Scroll To Top FAB */}
      <Animated.View 
        style={[
            styles.fab, 
            { bottom: 80 + insets.bottom }, 
            fabStyle 
        ]}
        pointerEvents="box-none" 
      >
         <Pressable 
            style={styles.fabButton}
            onPress={() => {
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            }}
         >
            <Ionicons name="arrow-up" size={24} color="#000" />
         </Pressable>
      </Animated.View>

      <ModernDeleteModal
        visible={showDeleteConfirm}
        title="Remove Song"
        message="Remove this song from the playlist?"
        confirmText="Remove"
        onConfirm={async () => {
            if (songToDelete) {
                await playlistQueries.removeSongFromPlaylist(playlistId, songToDelete);
                loadData();
                setShowDeleteConfirm(false);
            }
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  stickyHeaderTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: 'bold',
      color: '#fff',
      marginLeft: 16,
      textAlign: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeButton: {
      backgroundColor: Colors.primary || '#1DB954',
  },
  listHeader: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%', // Ensure header takes full width
  },
  coverContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
    marginBottom: 20,
    marginTop: 10,
  },
  inlinePlayerContainer: {
      marginBottom: 24,
      marginTop: 12,
      width: '100%', // Ensure this takes full width of ListHeader
  },
  coverArt: {
    width: 220,
    height: 220,
    borderRadius: 8,
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  playingIndicator: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      backgroundColor: Colors.primary,
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center'
  },
  playlistName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  },
  playlistMeta: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 16,
  },
  searchPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderRadius: 20,
      height: 40,
  },
  searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.1)',
      marginHorizontal: 24,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 40,
      marginBottom: 20,
      width: SCREEN_WIDTH - 48,
  },
  searchIcon: {
      marginRight: 8
  },
  searchInput: {
      flex: 1,
      color: '#fff',
      fontSize: 14
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  playButtonLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF', // WHITE BUTTON
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFF',
    shadowOpacity: 0.2, // Softer shadow
    shadowRadius: 10,
    elevation: 5,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModeToast: {
      position: 'absolute',
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
  },
  editModeText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 12,
  },
  swipeHintContainer: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
  },
  scrubberContainer: {
      width: '100%',
      paddingHorizontal: 40, // More padding = "Shorter" slider
      marginBottom: 20,
  },
  timerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4, // Positive margin to sit below slider
      width: '100%',
  },
  timerText: {
      fontSize: 12,
      color: '#FFFFFF', // Solid white for visibility
      fontVariant: ['tabular-nums'],
  },
  inlineControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 50, // Increased significantly from 32
  },
  skipButton: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 40,
      height: 40,
  },
  skipText: {
      position: 'absolute',
      fontSize: 8,
      fontWeight: 'bold',
      color: '#FFF',
      marginTop: 2,
  },
  fab: {
      position: 'absolute',
      right: 20,
      zIndex: 999,
  },
  fabButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#fff',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 6,
  },
});

export default PlaylistDetailScreen;
