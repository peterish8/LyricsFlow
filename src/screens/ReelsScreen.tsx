/**
 * Reels Screen - Full-screen immersive TikTok/Instagram-style feed
 * No nav bar, back button only, full-screen height
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  Dimensions,
  StyleSheet,
  Pressable,
  Text,
  StatusBar,
  Share,
  ActivityIndicator,
  ViewToken,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedScrollHandler, 
  useDerivedValue 
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useReelsFeedStore } from '../store/reelsFeedStore';
import { reelsBufferManager } from '../services/ReelsBufferManager';
import { ReelCard } from '../components/ReelCard';
import { reelsRecommendationEngine } from '../services/ReelsRecommendationEngine';
import { useReelsPreferencesStore } from '../store/reelsPreferencesStore';
import { UnifiedSong } from '../types/song';
import { ReelsVaultModal } from '../components/ReelsVaultModal';
import { PerformanceHUD } from '../components/PerformanceHUD';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Full screen - no tab bar deduction
const REEL_HEIGHT = SCREEN_HEIGHT;

const ReelsScreen: React.FC = () => {
  const navigation = useNavigation();

  const {
    feedSongs,
    currentIndex,
    vault,
    isLoading,
    setFeedSongs,
    appendFeedSongs,
    setCurrentIndex,
    addToVault,
    removeFromVault,
    isInVault,
    setIsLoading,
  } = useReelsFeedStore();
  
  const insets = useSafeAreaInsets();

  const activeIndexRef = useRef(-1);
  const flatListRef = useRef<FlatList>(null);
  const [showVault, setShowVault] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); // Start paused by default
  const viewStartTimeRef = useRef<number>(Date.now());

  const { recordInteraction, loadFromStorage } = useReelsPreferencesStore();

  const scrollY = useSharedValue(0);
  const currentIndexSV = useDerivedValue(() => {
    'worklet';
    return scrollY.value / REEL_HEIGHT;
  });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
    },
  });

  // Restore scroll position when screen becomes focused
  useFocusEffect(
    useCallback(() => {
      // Hide status bar for immersive experience
      StatusBar.setHidden(true);

      if (feedSongs.length > 0 && currentIndex > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: currentIndex,
            animated: false,
          });
        }, 100);
      }

      return () => {
        // Show status bar when leaving
        StatusBar.setHidden(false);
        // FORCE STOP ALL REEL AUDIO
        setIsPlaying(false);
        reelsBufferManager.stopAll();
      };
    }, [currentIndex, feedSongs.length])
  );

  // Load initial feed using recommendation engine
  const loadInitialFeed = useCallback(async () => {
    console.log('[Reels] 🎯 Loading personalized feed...');
    setIsLoading(true);
    try {
      const songs = await reelsRecommendationEngine.fetchPersonalizedFeed(6);

      if (songs.length > 0) {
        setFeedSongs(songs);
        console.log(`[Reels] ✅ Loaded ${songs.length} personalized songs into feed`);
      } else {
        console.warn('[Reels] ⚠️ No personalized songs found!');
      }
    } catch (error) {
      console.error('[Reels] ❌ Failed to load feed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [setFeedSongs, setIsLoading]);

  // Reload Feed Button Logic
  const handleReload = async () => {
    console.log('[Reels] 🔄 Reloading feed...');
    setIsPlaying(false);
    await reelsBufferManager.stopAll(); // Stop audio first
    
    setIsLoading(true);
    setFeedSongs([]); // Clear current feed
    setCurrentIndex(0);
    activeIndexRef.current = -1; // Reset ref
    
    // Slight delay to allow UI to clear
    setTimeout(async () => {
        await loadInitialFeed();
    }, 100);
  };

  // Initialize: Load preferences and enter reels mode
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Load saved preferences
      await loadFromStorage();
      
      // Engine now auto-seeds from song library on first query
      await reelsBufferManager.enterReelsMode();

      if (feedSongs.length === 0 && mounted) {
        await loadInitialFeed();
      }
    };

    init();

    return () => {
      mounted = false;
      reelsBufferManager.exitReelsMode();
    };
  }, [loadFromStorage, feedSongs.length, loadInitialFeed]);

  // Load more songs using recommendation engine
  const loadMoreSongs = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const songs = await reelsRecommendationEngine.loadMoreSongs(6);
      appendFeedSongs(songs);
      console.log(`[Reels] 🎯 Appended ${songs.length} more personalized songs`);
    } catch (error) {
      console.error('[Reels] Failed to load more:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, appendFeedSongs, setIsLoading]);

  // Handle viewable items change + track interactions
  const handleViewableChange = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!viewableItems || viewableItems.length === 0) return;

      const newIndex = viewableItems[0]?.index;
      if (newIndex != null && newIndex !== activeIndexRef.current) {
        // Record interaction for PREVIOUS song
        const prevIndex = activeIndexRef.current;
        const prevSong = feedSongs[prevIndex];
        if (prevSong) {
          const watchDuration = (Date.now() - viewStartTimeRef.current) / 1000;
          const skipped = watchDuration < 3; // < 3 seconds = skip
          
          recordInteraction({
            songId: prevSong.id,
            title: prevSong.title,
            artist: prevSong.artist || 'Unknown',
            timestamp: Date.now(),
            watchDuration,
            totalDuration: prevSong.duration || 180,
            liked: isInVault(prevSong.id),
            skipped,
          });

          if (skipped) {
            console.log(`[Reels] ⏭️ Skipped: ${prevSong.title} (${watchDuration.toFixed(1)}s)`);
          } else {
            console.log(`[Reels] 👀 Watched: ${prevSong.title} for ${watchDuration.toFixed(1)}s`);
          }
        }

        // Reset timer for new song
        viewStartTimeRef.current = Date.now();
        activeIndexRef.current = newIndex;
        setCurrentIndex(newIndex);
        // Keep current play/pause state when swiping
        reelsBufferManager.updateActiveIndex(newIndex, feedSongs);

        if (newIndex >= feedSongs.length - 2) {
          loadMoreSongs();
        }
      }
    },
    [feedSongs, isInVault, recordInteraction, loadMoreSongs, setCurrentIndex]
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const handleLikePress = useCallback((song: UnifiedSong) => {
    if (isInVault(song.id)) {
      removeFromVault(song.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      addToVault(song);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [isInVault, addToVault, removeFromVault]);

  const handleSharePress = useCallback(async (song: UnifiedSong) => {
    try {
      await Share.share({
        message: `🎵 Check out "${song.title}" by ${song.artist || 'Unknown Artist'}!`,
      });
    } catch {
      console.log('Share cancelled');
    }
  }, []);

  const handleDownloadPress = useCallback((song: UnifiedSong) => {
    // Also toggle vault status since "Save" is currently linked to Vault
    handleLikePress(song);
  }, [handleLikePress]);

  const handlePlayPause = useCallback(async () => {
    if (isPlaying) {
      await reelsBufferManager.pause();
      setIsPlaying(false);
    } else {
      await reelsBufferManager.resume();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedSong; index: number }) => {
      const isActive = index === currentIndex;
      return (
        <ReelCard
          song={item}
          isActive={isActive}
          isLiked={isInVault(item.id)}
          isPlaying={isActive && isPlaying}
          onLike={() => handleLikePress(item)}
          onShare={() => handleSharePress(item)}
          onDownload={() => handleDownloadPress(item)}
          onPlayPause={handlePlayPause}
          reelHeight={REEL_HEIGHT}
          index={index}
          currentIndex={currentIndexSV}
        />
      );
    },
    [currentIndex, isPlaying, isInVault, handleLikePress, handleSharePress, handleDownloadPress, handlePlayPause, currentIndexSV]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: REEL_HEIGHT,
      offset: REEL_HEIGHT * index,
      index,
    }),
    []
  );

  return (
    <View style={styles.container}>
      {feedSongs.length > 0 ? (
        <Animated.FlatList
          ref={flatListRef as any}
          data={feedSongs}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          pagingEnabled
          snapToInterval={REEL_HEIGHT}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={1}
          windowSize={5}
          maxToRenderPerBatch={2}
          removeClippedSubviews={true}
          initialNumToRender={3}
          updateCellsBatchingPeriod={16}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={handleViewableChange}
          getItemLayout={getItemLayout}
          extraData={vault} 
          onScrollToIndexFailed={(info) => {
            console.warn('[Reels] Scroll to index failed:', info.index);
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({
                 index: Math.min(info.index, feedSongs.length - 1),
                 animated: false,
              });
            }, 100);
          }}
        />
      ) : (
        !isLoading && (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={80} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>No reels available</Text>
            <Text style={styles.emptySubtext}>
              Pull down to refresh or check your connection
            </Text>
          </View>
        )
      )}

      {/* Back Button - Top Left */}
      <Pressable style={[styles.backButton, { top: insets.top + 16 }]} onPress={handleGoBack}>
        <Ionicons name="arrow-back" size={26} color="#fff" />
      </Pressable>

      {/* Vault Button - Top Right */}
      {vault.length > 0 && (
        <Pressable
          style={[styles.vaultButton, { top: insets.top + 16 }]}
          onPress={() => setShowVault(true)}
        >
          <Ionicons name="heart" size={22} color="#fff" />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{vault.length}</Text>
          </View>
        </Pressable>
      )}

      {/* Reload Button - Top Right (Below Vault) */}
      <Pressable
        style={[styles.reloadButton, { top: insets.top + 16 }]}
        onPress={handleReload}
      >
        <Ionicons name="refresh" size={24} color="#fff" />
      </Pressable>

      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.loadingText}>  Loading...</Text>
        </View>
      )}

      {/* Vault Modal */}
      <ReelsVaultModal visible={showVault} onClose={() => setShowVault(false)} />

      {/* Performance HUD (Dev only) */}
      <PerformanceHUD />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  vaultButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  reloadButton: {
    position: 'absolute',
    right: 70, // Positioned to the left of the vault button (or alone if vault is empty)
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF2D55',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  loadingContainer: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default ReelsScreen;
