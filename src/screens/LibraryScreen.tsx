/**
 * LyricFlow - Library Screen
 * Home screen with song grid, aurora header
 */

import React, { useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  Image,
  Alert,
  Modal,
  ScrollView,
  Animated,
  Platform,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
// import { LinearGradient } from 'expo-linear-gradient';
import { TabScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import { useDailyStatsStore } from '../store/dailyStatsStore';
import { 
  AuroraHeader, SongCard, CustomMenu, MiniPlayer, Toast, DownloadQueueModal 
} from '../components';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { CoverArtSearchScreen } from './CoverArtSearchScreen';
import { Colors } from '../constants/colors';
import { getGradientColors } from '../constants/gradients';
// import { getGradientById, GRADIENTS } from '../constants/gradients';
import { Song } from '../types/song';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import { useLyricsScanQueueStore } from '../store/lyricsScanQueueStore';
// import { useTasksStore } from '../store/tasksStore';
// import { TasksModal } from '../components/TasksModal';

type Props = TabScreenProps<'Library'>;

const LibraryScreen: React.FC<Props> = ({ navigation }) => {
  const songs = useSongsStore(state => state.songs);
  const fetchSongs = useSongsStore(state => state.fetchSongs);
  const setCurrentSong = useSongsStore(state => state.setCurrentSong);
  const updateSong = useSongsStore(state => state.updateSong);
  const libraryCurrentSong = useSongsStore(state => state.currentSong);
  const getSong = useSongsStore(state => state.getSong);
  const deleteSong = useSongsStore(state => state.deleteSong);
  const toggleLike = useSongsStore(state => state.toggleLike);
  const hideSong = useSongsStore(state => state.hideSong);
  
  const playerCurrentSong = usePlayerStore(state => state.currentSong);
  const { recentArts, addRecentArt } = useArtHistoryStore();
  const libraryBackgroundMode = useSettingsStore(state => state.libraryBackgroundMode);
  const playInMiniPlayerOnly = useSettingsStore(state => state.playInMiniPlayerOnly);
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  const isIsland = miniPlayerStyle === 'island';
  const setMiniPlayerHidden = usePlayerStore(state => state.setMiniPlayerHidden);
  
  // Visibility Management: Ensure MiniPlayer is VISIBLE when Home is focused
  useFocusEffect(
    useCallback(() => {
      setMiniPlayerHidden(false);
    }, [setMiniPlayerHidden])
  );
  
  // Bottom Sheet State
  const [showBottomSheet, setShowBottomSheet] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const gradientOpacity = React.useRef(new Animated.Value(1)).current;
  
  const [activeThemeColors, setActiveThemeColors] = React.useState<string[] | undefined>(undefined);
  const [activeImageUri, setActiveImageUri] = React.useState<string | null>(null);
  
  const [artMenuVisible, setArtMenuVisible] = React.useState(false);
  const [artMenuAnchor, setArtMenuAnchor] = React.useState<{ x: number, y: number } | undefined>(undefined);
  const [selectedSongForArt, setSelectedSongForArt] = React.useState<Song | null>(null);
  const [recentArtVisible, setRecentArtVisible] = React.useState(false);
  const [showCoverSearch, setShowCoverSearch] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [toast, setToast] = React.useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showQueueModal, setShowQueueModal] = React.useState(false);
  
  const downloadQueue = useDownloadQueueStore(state => state.queue);
  const activeDownloadsCount = downloadQueue.filter(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'staging').length;

  const scanQueue = useLyricsScanQueueStore(state => state.queue);
  const addToScanQueue = useLyricsScanQueueStore(state => state.addToQueue);

  // Wrapper for feedback
  const handleAddToQueue = useCallback((song: Song) => {
      const existing = scanQueue.find(j => j.songId === song.id);
      if (existing) {
         if (existing.status === 'failed') {
            // Allow retry
         } else {
            setToast({ visible: true, message: `Already searching for "${song.title}"`, type: 'info' });
            return;
         }
      }
  
      addToScanQueue(song);
      Vibration.vibrate(50); // Light haptic
      setToast({ visible: true, message: `Searching lyrics for "${song.title}"...`, type: 'success' });
  }, [addToScanQueue, scanQueue]);


  // const { tasks } = useTasksStore();
  // const activeTasksCount = tasks.filter(t => t.status === 'queued' || t.status === 'processing').length;
  // const activeTasksCount = 0;

  useEffect(() => {
    fetchSongs();
  }, []);

  // Dynamic Background Logic
  useEffect(() => {
    const updateTheme = async () => {
      let colors: string[] | undefined = undefined;
      let image: string | null = null;

      if (libraryBackgroundMode === 'current') {
         // USE PLAYER STORE for "Current" mode to be responsive
         if (playerCurrentSong) {
             image = playerCurrentSong.coverImageUri || null;
             // Only fallback to colors if no image
             if (!image && playerCurrentSong.gradientId) {
                 if (playerCurrentSong.gradientId === 'dynamic') {
                      colors = ['#f7971e', '#ffd200', '#ff6b35']; 
                 } else {
                      colors = getGradientColors(playerCurrentSong.gradientId);
                 }
             }
         }
      } else if (libraryBackgroundMode === 'daily') {
         const topSongId = useDailyStatsStore.getState().getTopSongOfYesterday();
         if (topSongId) {
            const song = songs.find(s => s.id === topSongId) || await getSong(topSongId);
            if (song) {
                 image = song.coverImageUri || null;
                 if (!image && song.gradientId) {
                     if (song.gradientId === 'dynamic') {
                          colors = ['#f7971e', '#ffd200', '#ff6b35']; 
                     } else {
                          colors = getGradientColors(song.gradientId);
                     }
                 }
            }
         }
         // Fallback to Today's Top
         if (!colors && !image) {
             const todayTopId = useDailyStatsStore.getState().getTopSongOfToday();
             if (todayTopId) {
                const song = songs.find(s => s.id === todayTopId) || await getSong(todayTopId);
                if (song) {
                    image = song.coverImageUri || null;
                    if (!image && song.gradientId) {
                        if (song.gradientId === 'dynamic') {
                            colors = ['#f7971e', '#ffd200', '#ff6b35']; 
                        } else {
                            colors = getGradientColors(song.gradientId);
                        }
                    }
                }
             }
         }
      }
      
      setActiveThemeColors(colors);
      setActiveImageUri(image);
    };
    updateTheme();
  }, [libraryBackgroundMode, playerCurrentSong?.id, playerCurrentSong?.coverImageUri, songs.length]);
  
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchSongs();
    });
    return unsubscribe;
  }, [navigation]);


  // Removed Scrollable Header - User prefers icons in "All Songs" section


  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSongs();
    setRefreshing(false);
  }, [fetchSongs]);
  
  const handleDeleteSong = async () => {
    if (!selectedSongForArt) return;
    
    try {
        console.log('[Library] Deleting song:', selectedSongForArt.title);
        await deleteSong(selectedSongForArt.id);
        setShowDeleteConfirm(false);
        setShowBottomSheet(false);
        setToast({ visible: true, message: 'Song deleted', type: 'success' });
    } catch (error) {
        console.error('[Library] Delete failed:', error);
        setToast({ visible: true, message: 'Failed to delete song', type: 'error' });
    }
  };

  const handleSongPress = useCallback((song: Song) => {
    // Check if the song is already the current one in the player
    const isCurrentlyPlaying = playerCurrentSong?.id === song.id;

    if (playInMiniPlayerOnly) {
      if (isCurrentlyPlaying) {
        // Second tap on the same song: Open NowPlayingScreen
        setMiniPlayerHidden(true);
        navigation.navigate('NowPlaying', { songId: song.id });
      } else {
        // First tap or different song: Just start playing in mini player
        setCurrentSong(song);
        usePlayerStore.getState().loadSong(song.id);
      }
    } else {
      // Default: Always navigate to NowPlayingScreen
      setCurrentSong(song);
      setMiniPlayerHidden(true);
      navigation.navigate('NowPlaying', { songId: song.id });
      usePlayerStore.getState().loadSong(song.id);
    }
  }, [navigation, setCurrentSong, playInMiniPlayerOnly, playerCurrentSong?.id]);

  const handleSongLongPress = useCallback((song: Song, event?: any) => {
    // Show bottom sheet for cover art options
    setSelectedSongForArt(song);
    setShowBottomSheet(true);
  }, []);

  const handleAddPress = useCallback(() => {
    navigation.navigate('AddEditLyrics', {});
  }, [navigation]);
  
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0].uri && selectedSongForArt) {
        const uri = result.assets[0].uri;
        const updatedSong = {
          ...selectedSongForArt,
          coverImageUri: uri,
          dateModified: new Date().toISOString(),
        };
        await updateSong(updatedSong);
        addRecentArt(uri);
        setShowBottomSheet(false);
        fetchSongs();
      }
    } catch (error) {
      console.error('Cover art save failed:', error);
      setToast({ visible: true, message: 'Failed to save cover', type: 'error' });
    }
  };

  const selectRecentArt = async (uri: string) => {
    if (selectedSongForArt) {
      try {
        const updatedSong = {
          ...selectedSongForArt,
          coverImageUri: uri,
          dateModified: new Date().toISOString(),
        };
        await updateSong(updatedSong);
        setShowBottomSheet(false);
        fetchSongs();
      } catch (error) {
        console.error('Recent art apply failed:', error);
        setToast({ visible: true, message: 'Failed to save cover', type: 'error' });
      }
    }
  };

  const artOptions = [
    {
      label: 'Choose from Gallery',
      icon: 'image-outline' as const,
      onPress: pickImage,
    },
    {
       label: 'Search Web',
       icon: 'globe-outline' as const,
       onPress: () => {
           setArtMenuVisible(false);
           setShowCoverSearch(true);
       }
    },
    ...(recentArts.length > 0 ? [{
      label: 'Recent Art',
      icon: 'time-outline' as const,
      onPress: () => {
        setArtMenuVisible(false);
        setTimeout(() => setRecentArtVisible(true), 100);
      },
    }] : []),
    {
      label: 'Delete Song',
      icon: 'trash-outline' as const,
      onPress: async () => {
        setArtMenuVisible(false);
        if (selectedSongForArt) {
          Alert.alert(
            'Delete Song',
            `Delete "${selectedSongForArt.title}"? This cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  const { deleteSong } = useSongsStore.getState();
                  await deleteSong(selectedSongForArt.id);
                  fetchSongs();
                },
              },
            ]
          );
        }
      },
    },
  ];

  // const topSongs = songs.slice(0, 2);
  // const otherSongs = songs.slice(2);

  // const renderSong = ({ item, index }: { item: Song; index: number }) => (
  //   <View style={[styles.cardWrapper, index % 2 === 0 && styles.cardLeft]}>
  //     <SongCard
  //       id={item.id}
  //       title={item.title}
  //       artist={item.artist}
  //       album={item.album}
  //       gradientId={item.gradientId}
  //       coverImageUri={item.coverImageUri}
  //       onPress={() => handleSongPress(item)}
  //     />
  //   </View>
  // );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="musical-notes-outline" size={80} color={Colors.textSecondary} />
      <Text style={styles.emptyTitle}>No songs yet</Text>
      <Text style={styles.emptySubtitle}>
        Add your first song with timestamped lyrics
      </Text>
      <Pressable style={styles.addButton} onPress={handleAddPress}>
        <Ionicons name="add" size={20} color="#000" />
        <Text style={styles.addButtonText}>Add Lyrics</Text>
      </Pressable>
    </View>
  );

// Extract SongListItem to a memoized component to improve performance
const SongListItem = React.memo(({ 
  song, 
  onPress, 
  onLongPress, 
  scanQueue, 
  addToScanQueue 
}: { 
  song: Song, 
  onPress: (song: Song) => void, 
  onLongPress: (song: Song, event: any) => void,
  scanQueue: any[],
  addToScanQueue: (song: Song) => void
}) => {
    const scanJob = scanQueue.find(j => j.songId === song.id);
    const isScanning = scanJob?.status === 'scanning' || scanJob?.status === 'pending';
    const isCompleted = scanJob?.status === 'completed';
    
    // Scale animation for bounce effect
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.96,
            useNativeDriver: true,
            speed: 20,
            bounciness: 4,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 20,
            bounciness: 4,
        }).start();
    };

    const renderRightActions = (_progress: any, dragX: any) => {
        const scale = dragX.interpolate({
            inputRange: [-80, 0],
            outputRange: [1, 0],
            extrapolate: 'clamp',
        });
        
        return (
            <Pressable 
                style={[styles.swipeAction]} 
                onPress={() => addToScanQueue(song)}
            >
                <Animated.View style={[
                    StyleSheet.absoluteFill, 
                    { 
                        transform: [{ scale }],
                        borderRadius: 12, 
                        overflow: 'hidden',
                    }
                ]}>
                    {song.coverImageUri ? (
                       <Image 
                         source={{ uri: song.coverImageUri }} 
                         style={StyleSheet.absoluteFill}
                         blurRadius={40} 
                       />
                    ) : (
                       <View style={[StyleSheet.absoluteFill, { backgroundColor: '#222' }]} />
                    )}

                    <LinearGradient
                      colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)']}
                      start={{x: 0, y: 0}}
                      end={{x: 0, y: 1}}
                      style={StyleSheet.absoluteFill}
                    />
                    
                    <View style={{ 
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#FFF',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.9,
                        shadowRadius: 15,
                        elevation: 10,
                    }}>
                        <Ionicons name="sparkles" size={28} color="#FFF" />
                    </View>
                </Animated.View>
            </Pressable>
        );
    };

    return (
        <Swipeable 
            renderRightActions={renderRightActions}
            containerStyle={{ marginBottom: 8 }}
            overshootRight={false}
            friction={2}
            rightThreshold={40}
        >
            <Pressable
              onPress={() => onPress(song)}
              onLongPress={(e: any) => onLongPress(song, e)}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              style={{ marginBottom: 0 }} // Move style to Animated.View
            >
                <Animated.View style={[
                    styles.listItem, 
                    { 
                        marginBottom: 0,
                        transform: [{ scale: scaleAnim }] 
                    }
                ]}>
                  <View style={styles.listItemThumbnail}>
                    {song.coverImageUri ? (
                      <Image source={{ uri: song.coverImageUri }} style={styles.listItemImage} />
                    ) : (
                      <View style={styles.defaultListThumbnail}>
                        <Ionicons name="disc" size={24} color="rgba(255,255,255,0.3)" />
                      </View>
                    )}
                    {isScanning && (
                        <View style={styles.scanningOverlay}>
                            <Ionicons name="sync" size={16} color="#FFF" />
                        </View>
                    )}
                  </View>
                  
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemTitle} numberOfLines={1}>{song.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.listItemArtist} numberOfLines={1}>{song.artist || 'Unknown Artist'}</Text>
                        {isCompleted && (
                            <Ionicons name="checkmark-circle" size={12} color={Colors.primary} style={{ marginLeft: 4 }} />
                        )}
                        {scanJob?.status === 'failed' && (
                            <Ionicons name="alert-circle" size={12} color={Colors.error} style={{ marginLeft: 4 }} />
                        )}
                    </View>
                  </View>
                  
                  <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                      <Text style={styles.listItemDuration}>
                        {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, '0')}
                      </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                </Animated.View>
            </Pressable>
        </Swipeable>
    );
});

  return (
    <View style={styles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: gradientOpacity }]}>
        <AuroraHeader palette="library" colors={activeThemeColors} imageUri={activeImageUri} />
      </Animated.View>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <Text style={styles.brandName}>LuvLyrics</Text>
        </View>

        {/* Content */}
        <FlatList<Song>
          key="library-list"
          data={songs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SongListItem 
                song={item} 
                onPress={handleSongPress} 
                onLongPress={handleSongLongPress}
                scanQueue={scanQueue}
                addToScanQueue={handleAddToQueue}
            />
          )}
          contentContainerStyle={[
             styles.listContent,
             isIsland && { paddingTop: 20 } // Reduced gap to bring covers up
          ]}
          ListEmptyComponent={songs.length === 0 ? renderEmpty : null}
          ListHeaderComponent={
            <View>
              {songs.length > 0 ? (
                <>
                  {/* Recently Played Cards (Header Removed) */}
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalScroll}
                  >
                    {songs
                      .filter(song => song.lastPlayed)
                      .sort((a, b) => {
                        const dateA = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
                        const dateB = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
                        return dateB - dateA;
                      })
                      .slice(0, 10)
                      .map((song) => (
                        <View key={song.id} style={styles.horizontalCard}>
                          <SongCard
                            id={song.id}
                            title={song.title}
                            artist={song.artist}
                            album={song.album}
                            gradientId={song.gradientId}
                            coverImageUri={song.coverImageUri}
                            duration={song.duration}
                            isLiked={song.isLiked}
                            onPress={() => handleSongPress(song)}
                            onLongPress={() => handleSongLongPress(song, {} as any)}
                            onLikePress={() => toggleLike(song.id)}
                          />
                        </View>
                      ))}
                  </ScrollView>

                  {/* All Songs Header & List */}
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>All Songs</Text>
                    <View style={styles.headerActions}>
                      <Pressable 
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('Search')}
                      >
                        <Ionicons name="search" size={20} color={Colors.textSecondary} />
                      </Pressable>
                      
                      <Pressable 
                        style={styles.actionButton}
                        onPress={() => setShowQueueModal(true)}
                      >
                        <Ionicons name="list" size={22} color={Colors.textSecondary} />
                        {activeDownloadsCount > 0 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{activeDownloadsCount}</Text>
                            </View>
                        )}
                      </Pressable>
                      <Pressable 
                        style={styles.actionButton}
                        onPress={() => (navigation as any).navigate('AudioDownloader')}
                      >
                        <Ionicons name="cloud-download-outline" size={22} color={Colors.textSecondary} />
                      </Pressable>
                      <Pressable 
                        style={styles.actionButton}
                        onPress={handleAddPress}
                      >
                        <Ionicons name="add" size={24} color={Colors.textSecondary} />
                      </Pressable>
                    </View>
                  </View>
                </>
              ) : null}
            </View>
          }
          ListFooterComponent={<View style={{ height: 100 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.textSecondary}
              progressViewOffset={isIsland ? 160 : 0} 
            />
          }
          onScroll={(e) => {
            const offsetY = e.nativeEvent.contentOffset.y;
            Animated.timing(gradientOpacity, {
              toValue: offsetY < 50 ? 1 : 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
          }}
          scrollEventThrottle={16}
        />

        {/* FAB - Hidden */}
      </SafeAreaView>
      
      <CustomMenu
        visible={artMenuVisible}
        onClose={() => setArtMenuVisible(false)}
        title="Cover Art Options"
        anchorPosition={artMenuAnchor}
        options={artOptions}
      />
      
      <Modal
        visible={recentArtVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRecentArtVisible(false)}
      >
        <Pressable 
          style={styles.recentArtOverlay} 
          onPress={() => setRecentArtVisible(false)}
        >
          <View style={styles.recentArtContainer}>
            <Text style={styles.recentArtTitle}>Recent Art</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentArtScroll}>
              {recentArts.map((uri, index) => (
                <Pressable
                  key={index}
                  style={styles.recentArtItem}
                  onPress={() => {
                    selectRecentArt(uri);
                    setRecentArtVisible(false);
                  }}
                >
                  <Image source={{ uri }} style={styles.recentArtImage} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Bottom Sheet for Cover Art Options */}
      <Modal
        visible={showBottomSheet}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowBottomSheet(false)}
      >
        <Pressable 
          style={styles.bottomSheetOverlay}
          onPress={() => setShowBottomSheet(false)}
        >
          <Pressable 
            style={styles.bottomSheetContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.bottomSheetHandle} />
            <Text style={styles.bottomSheetTitle}>
              {selectedSongForArt?.title}
            </Text>
            <Text style={styles.bottomSheetSubtitle}>
              {selectedSongForArt?.artist}
            </Text>

            {/* Options */}
            <Pressable
              style={styles.bottomSheetOption}
              onPress={pickImage}
            >
              <Ionicons name="image-outline" size={24} color={Colors.primary} />
              <Text style={styles.bottomSheetOptionText}>Choose from Gallery</Text>
            </Pressable>

            <Pressable
              style={styles.bottomSheetOption}
              onPress={() => {
                setShowBottomSheet(false);
                setShowCoverSearch(true);
              }}
            >
              <Ionicons name="globe-outline" size={24} color={Colors.primary} />
              <Text style={styles.bottomSheetOptionText}>Search Web</Text>
            </Pressable>

            {/* Recent Art Section */}
            {recentArts.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.bottomSheetSubtitle, { textAlign: 'left', marginBottom: 12 }]}>
                  Recent Cover Art
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {recentArts.map((uri, index) => (
                    <Pressable 
                      key={index}
                      onPress={() => selectRecentArt(uri)}
                      style={{ marginRight: 12 }}
                    >
                      <Image 
                        source={{ uri }} 
                        style={{ width: 80, height: 80, borderRadius: 8, backgroundColor: '#333' }} 
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <Pressable
              style={styles.bottomSheetOption}
              onPress={async () => {
                setShowBottomSheet(false);
                if (selectedSongForArt) {
                  const updatedSong = {
                    ...selectedSongForArt,
                    coverImageUri: undefined,
                    dateModified: new Date().toISOString()
                  };
                  await updateSong(updatedSong);
                  await fetchSongs();
                  setToast({ visible: true, message: 'Cover art removed', type: 'success' });
                }
              }}
            >
              <Ionicons name="trash-outline" size={24} color="#FF4444" />
              <Text style={[styles.bottomSheetOptionText, { color: '#FF4444' }]}>Remove Cover Art</Text>
            </Pressable>

            <Pressable
              style={styles.bottomSheetOption}
              onPress={async () => {
                setShowBottomSheet(false);
                if (selectedSongForArt) {
                  await hideSong(selectedSongForArt.id, true);
                  setToast({ visible: true, message: 'Song hidden from library', type: 'success' });
                }
              }}
            >
              <Ionicons name="eye-off-outline" size={24} color="#FFA500" />
              <Text style={[styles.bottomSheetOptionText, { color: '#FFA500' }]}>Hide Song</Text>
            </Pressable>

            <Pressable
              style={[styles.bottomSheetOption, styles.bottomSheetCancel, { borderBottomWidth: 0, marginTop: 12, backgroundColor: '#2A2A2A' }]}
              onPress={() => {
                setShowBottomSheet(false);
                setTimeout(() => setShowDeleteConfirm(true), 300);
              }}
            >
              <Ionicons name="trash" size={20} color="#FF4444" style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#FF4444', marginLeft: 0 }}>Delete Song</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1A1A1A', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, alignItems: 'center' }}>
            <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255, 68, 68, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="trash" size={24} color="#FF4444" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 8, textAlign: 'center' }}>
              Delete Song?
            </Text>
            <Text style={{ fontSize: 16, color: '#aaa', marginBottom: 24, textAlign: 'center' }}>
              Are you sure you want to delete "{selectedSongForArt?.title}"? This action cannot be undone.
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <Pressable 
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' }}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Cancel</Text>
              </Pressable>
              
              <Pressable 
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#FF4444', alignItems: 'center' }}
                onPress={handleDeleteSong}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

          <CoverArtSearchScreen 
          visible={showCoverSearch}
          initialQuery={selectedSongForArt ? `${selectedSongForArt.title} ${selectedSongForArt.artist}` : ''}
          onClose={() => setShowCoverSearch(false)}
          onSelect={async (uri) => {
              console.log('[LibraryScreen] Cover art selected:', uri);
              setShowCoverSearch(false);
              if (selectedSongForArt) {
                  try {
                      console.log('[LibraryScreen] Updating song:', selectedSongForArt.id);
                      // Update the song's cover art in the database
                      const updatedSong = {
                          ...selectedSongForArt,
                          coverImageUri: uri,
                          dateModified: new Date().toISOString()
                      };
                      await updateSong(updatedSong);
                      console.log('[LibraryScreen] Cover art updated successfully');
                      
                      // Refresh the songs list to show the new cover
                      await fetchSongs();
                      
                      setToast({ visible: true, message: 'Cover art updated!', type: 'success' });
                      setSelectedSongForArt(null);
                  } catch (e) {
                      console.error('[LibraryScreen] Failed to save cover:', e);
                      setToast({ visible: true, message: 'Failed to save cover', type: 'error' });
                  }
              }
          }}
       />
      
       {/* Floating Action Bar for Download (Temporary Placement or use Header) */}
       {/* Actually, let's add it to the header actions we just unified */}
      

      
       {toast && (
           <Toast 
               visible={toast.visible} 
               message={toast.message} 
               type={toast.type} 
               onDismiss={() => setToast(null)} 
           />
       )}
       
       <DownloadQueueModal 
         visible={showQueueModal}
         onClose={() => setShowQueueModal(false)}
       />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  // scrollHeader & screenTitle removed
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 10,
  },
  brandHeader: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 8 : 4, // Adjusted for SafeArea + Island
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandName: {
    fontSize: 34,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1.5,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    maxWidth: '45%', // Ensure space for island
    paddingRight: 10, // Explicit gap
    marginLeft: 6, // +1px nudge
    marginTop: 5, // Moved slightly down per request
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 20,
  },
  headerButton: {
    padding: 4,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#000',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  topGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  horizontalScroll: {
    paddingRight: 16,
    gap: 12,
  },
  horizontalCard: {
    width: 160,
  },
  row: {
    gap: 16,
    marginBottom: 24,
  },
  cardWrapper: {
    flex: 1,
  },
  cardLeft: {
    marginRight: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  moreButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  moreButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 250,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  fab: {
    position: 'absolute',
    bottom: 180,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  listItemThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#2C2C2E',
  },
  defaultListThumbnail: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  listItemImage: {
    width: '100%',
    height: '100%',
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  listItemArtist: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  listItemDuration: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginRight: 8,
  },
  recentArtOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  recentArtContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  recentArtTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  recentArtScroll: {
    paddingHorizontal: 20,
  },
  recentArtItem: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  recentArtImage: {
    width: '100%',
    height: '100%',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 16,
    paddingRight: 16,
  },
  actionButton: {
    padding: 4,
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%', 
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderRadius: 12, 
    marginLeft: 8, // Add gap to separate from list item
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
  },
  bottomSheetSubtitle: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 24,
    textAlign: 'center',
  },
  bottomSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  bottomSheetOptionText: {
    fontSize: 16,
    color: '#fff',
    marginLeft: 12,
  },
  bottomSheetCancel: {
    borderBottomWidth: 0,
    marginTop: 10,
    justifyContent: 'center',
    backgroundColor: '#333',
    borderRadius: 12,
  },
  bottomSheetCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default LibraryScreen;
