import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  RefreshControl,
  Image,
  Modal,
  ScrollView,
  Platform,
  Vibration,
  TextInput,
  LayoutAnimation,
  UIManager,
  Keyboard,
  Animated,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TabScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import { useDailyStatsStore } from '../store/dailyStatsStore';
import { 
  AuroraHeader, SongCard, CustomMenu, Toast, DownloadQueueModal, ModernDeleteModal 
} from '../components';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { CoverArtSearchScreen } from './CoverArtSearchScreen';
import { Colors } from '../constants/colors';
import { getGradientColors } from '../constants/gradients';
import { Song } from '../types/song';
import { PerformanceHUD } from '../components/PerformanceHUD';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import { useLyricsScanQueueStore } from '../store/lyricsScanQueueStore';
import AnimatedReanimated, { 
  FadeInLeft, 
  useSharedValue, 
  useAnimatedScrollHandler, 
  runOnJS,
  withSpring,
  useAnimatedStyle
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedFlatList = AnimatedReanimated.createAnimatedComponent(FlatList);

// ============================================
// ADAPTIVE PERFORMANCE DETECTION
// ============================================
const DEVICE_REFRESH_RATE = Platform.select({
  ios: 120,
  android: 60,
  default: 60,
});

const IS_HIGH_REFRESH = DEVICE_REFRESH_RATE >= 90;

type Props = TabScreenProps<'Library'>;

const SongListItem = React.memo(({ 
  song, 
  onPress, 
  onLongPress, 
  scanQueue, 
  addToScanQueue 
}: { 
  song: Song, 
  onPress: (song: Song) => void, 
  onLongPress: (song: Song) => void,
  scanQueue: any[],
  addToScanQueue: (song: Song) => void
}) => {
    const scanJob = scanQueue.find(j => j.songId === song.id);
    const isScanning = scanJob?.status === 'scanning' || scanJob?.status === 'pending';
    const isCompleted = scanJob?.status === 'completed';
    const scale = useSharedValue(1);

    const handlePressIn = () => {
        scale.value = withSpring(0.96, { damping: 20, stiffness: 150 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 20, stiffness: 150 });
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    const renderRightActions = (_progress: any, dragX: any) => {
        const swipeScale = dragX.interpolate({
            inputRange: [-60, 0],
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
                        transform: [{ scale: swipeScale }],
                        borderRadius: 12, 
                        overflow: 'hidden',
                        backgroundColor: '#222'
                    }
                ]}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="sparkles" size={26} color={Colors.primary} />
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
              onLongPress={() => onLongPress(song)}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
            >
                <AnimatedReanimated.View style={[styles.listItem, animatedStyle]}>
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
                        {(song.lyrics && song.lyrics.length > 0) || isCompleted ? (
                            <Ionicons name="checkmark-circle" size={12} color={Colors.primary} style={{ marginLeft: 4 }} />
                        ) : scanJob?.status === 'failed' ? (
                            <Ionicons name="alert-circle" size={12} color={Colors.error} style={{ marginLeft: 4 }} />
                        ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                      <Text style={styles.listItemDuration}>
                        {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, '0')}
                      </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                </AnimatedReanimated.View>
            </Pressable>
        </Swipeable>
    );
});

const LibraryScreen: React.FC<Props> = ({ navigation }) => {
  const songs = useSongsStore(state => state.songs);
  const fetchSongs = useSongsStore(state => state.fetchSongs);
  const setCurrentSong = useSongsStore(state => state.setCurrentSong);
  const updateSong = useSongsStore(state => state.updateSong);
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
  
  useFocusEffect(useCallback(() => { setMiniPlayerHidden(false); }, [setMiniPlayerHidden]));
  
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [libraryFocusMode, setLibraryFocusMode] = useState(false);
  const setLibraryFocusModeStore = useSettingsStore(state => state.setLibraryFocusMode);
  const [activeThemeColors, setActiveThemeColors] = useState<string[] | undefined>(undefined);
  const [activeImageUri, setActiveImageUri] = useState<string | null>(null);
  const [artMenuVisible, setArtMenuVisible] = useState(false);
  const [selectedSongForArt, setSelectedSongForArt] = useState<Song | null>(null);
  const [recentArtVisible, setRecentArtVisible] = useState(false);
  const [showCoverSearch, setShowCoverSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showEditInfoModal, setShowEditInfoModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  
  const scrollY = useSharedValue(0);
  const lastSentFocusMode = useSharedValue(false);
  const headerAnimatedStyle = useAnimatedStyle(() => ({ opacity: scrollY.value < 50 ? 1 : 0 }));

  const updateFocusMode = useCallback((shouldFocus: boolean) => {
    if (shouldFocus !== libraryFocusMode) {
      setLibraryFocusMode(shouldFocus);
      setLibraryFocusModeStore(shouldFocus);
    }
  }, [libraryFocusMode, setLibraryFocusModeStore]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      scrollY.value = y;
      const isFocusZone = y > 150;
      if (isFocusZone !== lastSentFocusMode.value) {
        lastSentFocusMode.value = isFocusZone;
        runOnJS(updateFocusMode)(isFocusZone);
      }
    },
  });

  const handleSimpleScroll = useCallback((event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    updateFocusMode(y > 150);
  }, [updateFocusMode]);

  const getItemLayout = useCallback((_: any, index: number) => ({ length: 74, offset: 74 * index, index }), []);

  const recentlyPlayed = useMemo(() => {
    return songs
      .filter(song => song.lastPlayed)
      .sort((a, b) => (new Date(b.lastPlayed || 0).getTime() - new Date(a.lastPlayed || 0).getTime()))
      .slice(0, 16);
  }, [songs]);
  
  const activeDownloadsCount = useDownloadQueueStore(state => state.queue.filter(i => i.status === 'downloading' || i.status === 'pending' || i.status === 'staging').length);
  const scanQueue = useLyricsScanQueueStore(state => state.queue);
  const addToScanQueue = useLyricsScanQueueStore(state => state.addToQueue);

  const filteredSongs = useMemo(() => {
     if (!searchQuery.trim()) return songs;
     const query = searchQuery.toLowerCase().trim();
     return songs.filter(song =>
       song.title.toLowerCase().includes(query) ||
       song.artist?.toLowerCase().includes(query) ||
       song.album?.toLowerCase().includes(query)
     );
  }, [songs, searchQuery]);

  const handleAddToQueue = useCallback((song: Song) => {
      const existing = scanQueue.find(j => j.songId === song.id);
      const isPlainResult = existing?.status === 'completed' && existing?.resultType === 'plain';
      if (existing) {
         if (existing.status === 'failed' || isPlainResult) {
            addToScanQueue(song, isPlainResult);
            Vibration.vibrate(50);
            setToast({ visible: true, message: isPlainResult ? `Retrying for synced lyrics: "${song.title}"` : `Retrying: "${song.title}"`, type: 'info' });
         } else {
            setToast({ visible: true, message: `Already searching for "${song.title}"`, type: 'info' });
         }
      } else {
         addToScanQueue(song);
         Vibration.vibrate(50);
         setToast({ visible: true, message: `Searching lyrics for "${song.title}"...`, type: 'success' });
      }
  }, [addToScanQueue, scanQueue]);

  const handleSearchFocus = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsSearchFocused(true);
  };

  const handleSearchCancel = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsSearchFocused(false);
    setSearchQuery('');
    Keyboard.dismiss();
  };

  const handleSongPress = useCallback((song: Song) => {
    const currentId = usePlayerStore.getState().currentSongId;
    const isCurrentlyPlaying = currentId === song.id;
    setTimeout(() => {
        if (playInMiniPlayerOnly) {
          if (isCurrentlyPlaying) {
              setMiniPlayerHidden(true);
              navigation.navigate('NowPlaying', { songId: song.id });
          } else {
              setCurrentSong(song);
              usePlayerStore.getState().setInitialSong(song);
              usePlayerStore.getState().loadSong(song.id);
          }
        } else {
          setMiniPlayerHidden(true);
          if (isCurrentlyPlaying) {
               navigation.navigate('NowPlaying', { songId: song.id });
          } else {
               usePlayerStore.getState().setInitialSong(song);
               usePlayerStore.getState().loadSong(song.id);
               navigation.navigate('NowPlaying', { songId: song.id });
          }
        }
    }, 75);
  }, [navigation, setCurrentSong, playInMiniPlayerOnly, setMiniPlayerHidden]);

  const handleSongLongPress = useCallback((song: Song) => {
    setSelectedSongForArt(song);
    setShowBottomSheet(true);
  }, []);

  const handleAddPress = () => navigation.navigate('AddEditLyrics', {});

  const renderHeader = () => (
    <View>
      {filteredSongs.length > 0 ? (
        <>
          {!isSearchFocused && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll} decelerationRate="fast" snapToInterval={172}>
                {recentlyPlayed.map((song) => (
                  <AnimatedReanimated.View key={song.id} style={styles.horizontalCard} entering={FadeInLeft.duration(300)}>
                    <SongCard
                      id={song.id} title={song.title} artist={song.artist} album={song.album} gradientId={song.gradientId}
                      coverImageUri={song.coverImageUri} duration={song.duration} isLiked={song.isLiked}
                      onPress={() => handleSongPress(song)} onLongPress={() => handleSongLongPress(song)}
                      onLikePress={() => toggleLike(song.id)} onMagicPress={() => handleAddToQueue(song)}
                    />
                  </AnimatedReanimated.View>
                ))}
              </ScrollView>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>All Songs</Text>
                <View style={styles.headerActions}>
                  <Pressable style={styles.actionButton} onPress={() => setShowQueueModal(true)}>
                    <Ionicons name="list" size={22} color={Colors.textSecondary} />
                    {activeDownloadsCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{activeDownloadsCount}</Text></View>}
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => (navigation as any).navigate('AudioDownloader')}>
                    <Ionicons name="cloud-download-outline" size={22} color={Colors.textSecondary} />
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={handleAddPress}>
                    <Ionicons name="add" size={24} color={Colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
            </>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 20 }}>
              <View style={[styles.searchBarContainer, { flex: 1, marginHorizontal: 0, marginBottom: 0, backgroundColor: isSearchFocused ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)' }]}>
                 <Ionicons name="search" size={20} color="#FFF" style={{marginLeft: 12}} />
                 <TextInput
                    style={styles.searchInput} placeholder="Filter local library..." placeholderTextColor="#FFF"
                    value={searchQuery} onFocus={handleSearchFocus} returnKeyType="search"
                    onChangeText={(text) => {
                        setSearchQuery(text);
                        if (!isSearchFocused && text.length > 0) {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setIsSearchFocused(true);
                        }
                    }}
                 />
                 {searchQuery ? (<Pressable onPress={() => setSearchQuery('')} style={{padding: 8}}><Ionicons name="close-circle" size={18} color="#666" /></Pressable>) : null}
              </View>
              {isSearchFocused && (<Pressable onPress={handleSearchCancel} style={{marginLeft: 12}}><Text style={{color: Colors.primary, fontSize: 16, fontWeight: '600'}}>Cancel</Text></Pressable>)}
          </View>
        </>
      ) : null}
    </View>
  );

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    const updateTheme = async () => {
      let colors: string[] | undefined;
      let image: string | null = null;
      if (libraryBackgroundMode === 'current') {
         if (playerCurrentSong) {
             image = playerCurrentSong.coverImageUri || null;
             if (!image && playerCurrentSong.gradientId) {
                colors = playerCurrentSong.gradientId === 'dynamic' ? ['#f7971e', '#ffd200', '#ff6b35'] : getGradientColors(playerCurrentSong.gradientId);
             }
         }
      } else if (libraryBackgroundMode === 'daily') {
         const topId = useDailyStatsStore.getState().getTopSongOfYesterday() || useDailyStatsStore.getState().getTopSongOfToday();
         if (topId) {
            const song = songs.find(s => s.id === topId) || await getSong(topId);
            if (song) {
                 image = song.coverImageUri || null;
                 if (!image && song.gradientId) {
                    colors = song.gradientId === 'dynamic' ? ['#f7971e', '#ffd200', '#ff6b35'] : getGradientColors(song.gradientId);
                 }
            }
         }
      }
      setActiveThemeColors(colors); setActiveImageUri(image);
    };
    updateTheme();
  }, [libraryBackgroundMode, playerCurrentSong?.id, playerCurrentSong?.coverImageUri, songs.length, getSong]);
  
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchSongs);
    return unsubscribe;
  }, [navigation, fetchSongs]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true); await fetchSongs(); setRefreshing(false);
  }, [fetchSongs]);
  
  const handleDeleteSong = async () => {
    if (!selectedSongForArt) return;
    try {
        await deleteSong(selectedSongForArt.id);
        setShowDeleteConfirm(false); setShowBottomSheet(false);
        setToast({ visible: true, message: 'Song deleted', type: 'success' });
    } catch {
        setToast({ visible: true, message: 'Failed to delete song', type: 'error' });
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled && result.assets[0].uri && selectedSongForArt) {
        const uri = result.assets[0].uri;
        await updateSong({ ...selectedSongForArt, coverImageUri: uri, dateModified: new Date().toISOString() });
        addRecentArt(uri); setShowBottomSheet(false); fetchSongs();
      }
    } catch {
      setToast({ visible: true, message: 'Failed to save cover', type: 'error' });
    }
  };

  const selectRecentArt = async (uri: string) => {
    if (selectedSongForArt) {
      try {
        await updateSong({ ...selectedSongForArt, coverImageUri: uri, dateModified: new Date().toISOString() });
        setShowBottomSheet(false); fetchSongs();
      } catch {
        setToast({ visible: true, message: 'Failed to save cover', type: 'error' });
      }
    }
  };

  const handleSaveInfo = async () => {
      if (selectedSongForArt && editTitle.trim()) {
          try {
              await updateSong({ ...selectedSongForArt, title: editTitle.trim(), artist: editArtist.trim(), dateModified: new Date().toISOString() });
              await fetchSongs(); setToast({ visible: true, message: 'Song info updated', type: 'success' }); setShowEditInfoModal(false);
          } catch {
              setToast({ visible: true, message: 'Failed to update song', type: 'error' });
          }
      }
  };

  const artOptions = [
    { label: 'Choose from Gallery', icon: 'image-outline' as const, onPress: pickImage },
    { label: 'Search Web', icon: 'globe-outline' as const, onPress: () => { setArtMenuVisible(false); setShowCoverSearch(true); } },
    ...(recentArts.length > 0 ? [{ label: 'Recent Art', icon: 'time-outline' as const, onPress: () => { setArtMenuVisible(false); setTimeout(() => setRecentArtVisible(true), 100); } }] : []),
    { label: 'Delete Song', icon: 'trash-outline' as const, onPress: () => { setArtMenuVisible(false); if (selectedSongForArt) setShowDeleteConfirm(true); } },
  ];

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="musical-notes-outline" size={80} color={Colors.textSecondary} />
      <Text style={styles.emptyTitle}>No songs yet</Text>
      <Text style={styles.emptySubtitle}>Add your first song with timestamped lyrics</Text>
      <Pressable style={styles.addButton} onPress={handleAddPress}>
        <Ionicons name="add" size={20} color="#000" /><Text style={styles.addButtonText}>Add Lyrics</Text>
      </Pressable>
    </View>
  );

  const renderItem = useCallback(({ item }: any) => (
    <SongListItem song={item} onPress={handleSongPress} onLongPress={handleSongLongPress} scanQueue={scanQueue} addToScanQueue={handleAddToQueue} />
  ), [handleSongPress, handleSongLongPress, scanQueue, handleAddToQueue]);

  return (
    <View style={styles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
      <View style={[StyleSheet.absoluteFill, IS_HIGH_REFRESH ? headerAnimatedStyle : { opacity: libraryFocusMode ? 0 : 1 }]}>
        <AuroraHeader palette="library" colors={activeThemeColors} imageUri={activeImageUri} />
      </View>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {!isSearchFocused && (<View style={styles.brandHeader}><Text style={styles.brandName}>LuvLyrics</Text></View>)}
        {IS_HIGH_REFRESH ? (
          <AnimatedFlatList
            key="library-list-120" data={filteredSongs} keyExtractor={(item: any) => item.id}
            renderItem={renderItem} ListHeaderComponent={renderHeader}
            contentContainerStyle={[styles.listContent, { paddingTop: isIsland ? 20 : 25 }]}
            ListEmptyComponent={songs.length === 0 ? renderEmpty : null}
            ListFooterComponent={<View style={{ height: 100 }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.textSecondary} progressViewOffset={isIsland ? 160 : 0} />}
            onScroll={scrollHandler} scrollEventThrottle={1} getItemLayout={getItemLayout}
            initialNumToRender={10} maxToRenderPerBatch={5} windowSize={5} removeClippedSubviews={Platform.OS === 'android'} updateCellsBatchingPeriod={30}
          />
        ) : (
          <FlatList
            key="library-list-60" data={filteredSongs} keyExtractor={(item: any) => item.id}
            renderItem={renderItem} ListHeaderComponent={renderHeader}
            contentContainerStyle={[styles.listContent, { paddingTop: isIsland ? 20 : 25 }]}
            ListEmptyComponent={songs.length === 0 ? renderEmpty : null}
            ListFooterComponent={<View style={{ height: 100 }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.textSecondary} progressViewOffset={isIsland ? 160 : 0} />}
            onScroll={handleSimpleScroll} scrollEventThrottle={16} getItemLayout={getItemLayout}
            initialNumToRender={15} maxToRenderPerBatch={10} windowSize={7} removeClippedSubviews={true}
          />
        )}
      </SafeAreaView>
      <CustomMenu visible={artMenuVisible} onClose={() => setArtMenuVisible(false)} title="Cover Art Options" options={artOptions} />
      <Modal visible={recentArtVisible} transparent animationType="slide" onRequestClose={() => setRecentArtVisible(false)}>
        <Pressable style={styles.recentArtOverlay} onPress={() => setRecentArtVisible(false)}>
          <View style={styles.recentArtContainer}><Text style={styles.recentArtTitle}>Recent Art</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentArtScroll}>
              {recentArts.map((uri, index) => (
                <Pressable key={index} style={styles.recentArtItem} onPress={() => { selectRecentArt(uri); setRecentArtVisible(false); }}>
                  <Image source={{ uri }} style={styles.recentArtImage} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
      <ModernDeleteModal
        visible={showDeleteConfirm} title="Delete Song" message={`Delete "${selectedSongForArt?.title}"? This cannot be undone.`}
        onConfirm={handleDeleteSong} onCancel={() => setShowDeleteConfirm(false)}
      />
      <Modal visible={showBottomSheet} transparent animationType="slide" onRequestClose={() => setShowBottomSheet(false)}>
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setShowBottomSheet(false)}>
          <Pressable style={styles.bottomSheetContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.bottomSheetHandle} /><Text style={styles.bottomSheetTitle}>{selectedSongForArt?.title}</Text><Text style={styles.bottomSheetSubtitle}>{selectedSongForArt?.artist}</Text>
            <Pressable style={styles.bottomSheetOption} onPress={pickImage}><Ionicons name="image-outline" size={24} color={Colors.primary} /><Text style={styles.bottomSheetOptionText}>Choose from Gallery</Text></Pressable>
            <Pressable style={styles.bottomSheetOption} onPress={() => { setShowBottomSheet(false); setShowCoverSearch(true); }}><Ionicons name="globe-outline" size={24} color={Colors.primary} /><Text style={styles.bottomSheetOptionText}>Search Web</Text></Pressable>
            {recentArts.length > 0 && (
              <View style={{ marginTop: 16 }}><Text style={[styles.bottomSheetSubtitle, { textAlign: 'left', marginBottom: 12 }]}>Recent Cover Art</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {recentArts.map((uri, index) => (
                    <Pressable key={index} onPress={() => selectRecentArt(uri)} style={{ marginRight: 12 }}><Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8, backgroundColor: '#333' }} /></Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            <Pressable style={styles.bottomSheetOption} onPress={async () => {
                setShowBottomSheet(false); if (selectedSongForArt) {
                  await updateSong({ ...selectedSongForArt, coverImageUri: undefined, dateModified: new Date().toISOString() });
                  await fetchSongs(); setToast({ visible: true, message: 'Cover art removed', type: 'success' });
                }
              }}><Ionicons name="trash-outline" size={24} color="#FF4444" /><Text style={[styles.bottomSheetOptionText, { color: '#FF4444' }]}>Remove Cover Art</Text></Pressable>
            <Pressable style={styles.bottomSheetOption} onPress={async () => {
                setShowBottomSheet(false); if (selectedSongForArt) {
                  await hideSong(selectedSongForArt.id, true); setToast({ visible: true, message: 'Song hidden from library', type: 'success' });
                }
              }}><Ionicons name="eye-off-outline" size={24} color="#FFA500" /><Text style={[styles.bottomSheetOptionText, { color: '#FFA500' }]}>Hide Song</Text></Pressable>
            <Pressable style={styles.bottomSheetOption} onPress={() => { setShowBottomSheet(false); setEditTitle(selectedSongForArt?.title || ''); setEditArtist(selectedSongForArt?.artist || ''); setTimeout(() => setShowEditInfoModal(true), 300); }}><Ionicons name="create-outline" size={24} color={Colors.primary} /><Text style={styles.bottomSheetOptionText}>Edit Song Info</Text></Pressable>
            <Pressable style={[styles.bottomSheetOption, styles.bottomSheetCancel, { borderBottomWidth: 0, marginTop: 12, backgroundColor: '#2A2A2A' }]} onPress={() => { setShowBottomSheet(false); setTimeout(() => setShowDeleteConfirm(true), 300); }}><Ionicons name="trash" size={20} color="#FF4444" style={{ marginRight: 8 }} /><Text style={{ fontSize: 16, fontWeight: '700', color: '#FF4444', marginLeft: 0 }}>Delete Song</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <CoverArtSearchScreen visible={showCoverSearch} initialQuery={selectedSongForArt ? `${selectedSongForArt.title} ${selectedSongForArt.artist}` : ''} onClose={() => setShowCoverSearch(false)} onSelect={async (uri) => { setShowCoverSearch(false); if (selectedSongForArt) { try { await updateSong({ ...selectedSongForArt, coverImageUri: uri, dateModified: new Date().toISOString() }); await fetchSongs(); setToast({ visible: true, message: 'Cover art updated!', type: 'success' }); setSelectedSongForArt(null); } catch { setToast({ visible: true, message: 'Failed to save cover', type: 'error' }); } } }} />
      {toast && (<Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />)}
      <DownloadQueueModal visible={showQueueModal} onClose={() => setShowQueueModal(false)} />
      <Modal visible={showEditInfoModal} transparent animationType="fade" onRequestClose={() => setShowEditInfoModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#1E1E1E', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 }}><Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' }}>Edit Song Info</Text>
            <Text style={{ color: '#aaa', marginBottom: 8, fontSize: 12, textTransform: 'uppercase' }}>Title</Text>
            <TextInput value={editTitle} onChangeText={setEditTitle} style={{ backgroundColor: '#333', color: '#fff', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 16 }} placeholder="Song Title" placeholderTextColor="#666" />
            <Text style={{ color: '#aaa', marginBottom: 8, fontSize: 12, textTransform: 'uppercase' }}>Artist</Text>
            <TextInput value={editArtist} onChangeText={setEditArtist} style={{ backgroundColor: '#333', color: '#fff', borderRadius: 12, padding: 12, marginBottom: 24, fontSize: 16 }} placeholder="Artist Name" placeholderTextColor="#666" />
            <View style={{ flexDirection: 'row', gap: 12 }}><Pressable style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#333', alignItems: 'center' }} onPress={() => setShowEditInfoModal(false)}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Cancel</Text></Pressable><Pressable style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center' }} onPress={handleSaveInfo}><Text style={{ color: '#000', fontWeight: 'bold', fontSize: 16 }}>Save</Text></Pressable></View>
          </View>
        </View>
      </Modal>
      <PerformanceHUD />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, zIndex: 10 },
  brandHeader: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 8 : 4, paddingBottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandName: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1.5, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4, maxWidth: '45%', paddingRight: 10, marginLeft: 6, marginTop: 5 },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', gap: 20 },
  headerButton: { padding: 4, position: 'relative' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#007AFF', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1, borderColor: '#000' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, flexGrow: 1 },
  topGrid: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  horizontalScroll: { paddingRight: 16, gap: 12 },
  horizontalCard: { width: 160 },
  row: { gap: 16, marginBottom: 24 },
  cardWrapper: { flex: 1 },
  cardLeft: { marginRight: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, height: 48, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, height: '100%', paddingHorizontal: 12 },
  sectionTitle: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.5 },
  moreButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  moreButtonText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, gap: 12 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', maxWidth: 250 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginTop: 20 },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#000' },
  fab: { position: 'absolute', bottom: 180, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 8, gap: 12 },
  listItemThumbnail: { width: 50, height: 50, borderRadius: 6, overflow: 'hidden', backgroundColor: '#2C2C2E' },
  defaultListThumbnail: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C2C2E' },
  listItemImage: { width: '100%', height: '100%' },
  listItemContent: { flex: 1 },
  listItemTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  listItemArtist: { fontSize: 14, color: Colors.textSecondary },
  listItemDuration: { fontSize: 14, color: Colors.textSecondary, marginRight: 8 },
  recentArtOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  recentArtContainer: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 20, paddingBottom: 40 },
  recentArtTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, paddingHorizontal: 20, marginBottom: 16 },
  recentArtScroll: { paddingHorizontal: 20 },
  recentArtItem: { width: 120, height: 120, borderRadius: 12, overflow: 'hidden', marginRight: 12 },
  recentArtImage: { width: '100%', height: '100%' },
  headerActions: { flexDirection: 'row', gap: 16, paddingRight: 16 },
  actionButton: { padding: 4 },
  swipeAction: { justifyContent: 'center', alignItems: 'center', width: 60, height: '100%', borderRadius: 12, marginLeft: 8 },
  scanningOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  bottomSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  bottomSheetContainer: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  bottomSheetHandle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  bottomSheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4, textAlign: 'center' },
  bottomSheetSubtitle: { fontSize: 14, color: '#aaa', marginBottom: 24, textAlign: 'center' },
  bottomSheetOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
  bottomSheetOptionText: { fontSize: 16, color: '#fff', marginLeft: 12 },
  bottomSheetCancel: { borderBottomWidth: 0, marginTop: 10, justifyContent: 'center', backgroundColor: '#333', borderRadius: 12 },
  bottomSheetCancelText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});

export default LibraryScreen;
