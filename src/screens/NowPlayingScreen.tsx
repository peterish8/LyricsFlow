/**
 * LyricFlow - Now Playing Screen
 * Core lyrics reader experience with animated gradient
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  Dimensions,
  GestureResponderEvent,
  Image,
} from 'react-native';
import Animated, { 
  FadeInDown, 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring 
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { RootStackScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import {
  GradientBackground,
  LyricsLine,
  Scrubber,
  PlayerControls,
  CustomMenu,
} from '../components';
import { getGradientById, GRADIENTS } from '../constants/gradients';
import { calculateDuration } from '../utils/timestampParser';
import { Alert } from 'react-native';

type Props = RootStackScreenProps<'NowPlaying'>;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const LyricItem = React.memo<{
  item: any;
  index: number;
  displayLineIndex: number;
  align: 'left' | 'center' | 'right';
  onPress: () => void;
}>(({ item, index, displayLineIndex, align, onPress }) => {
  const isActive = index === displayLineIndex;
  const isPast = index < displayLineIndex;
  
  const scale = useSharedValue(1);
  const bar1Height = useSharedValue(24);
  const bar2Height = useSharedValue(40);
  const bar3Height = useSharedValue(16);
  
  useEffect(() => {
    if (isActive && item.text.toUpperCase().includes('[INSTRUMENTAL]')) {
      const animate = () => {
        bar1Height.value = withSpring(Math.random() * 20 + 20, { damping: 10 });
        bar2Height.value = withSpring(Math.random() * 20 + 30, { damping: 10 });
        bar3Height.value = withSpring(Math.random() * 15 + 10, { damping: 10 });
      };
      const interval = setInterval(animate, 400);
      return () => clearInterval(interval);
    } else {
      bar1Height.value = 24;
      bar2Height.value = 40;
      bar3Height.value = 16;
    }
  }, [isActive]);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 }],
  }));
  
  const bar1Style = useAnimatedStyle(() => ({ height: bar1Height.value }));
  const bar2Style = useAnimatedStyle(() => ({ height: bar2Height.value }));
  const bar3Style = useAnimatedStyle(() => ({ height: bar3Height.value }));
  
  return (
    <Animated.View
      entering={FadeInDown.duration(300).springify()}
      style={[
        styles.lyricLine,
        align === 'center' && styles.lyricLineCenter,
      ]}
    >
      <Pressable onPress={onPress} style={{ width: '100%' }}>
        {item.text.toUpperCase().includes('[INSTRUMENTAL]') ? (
          <View style={[
            styles.instrumentalContainer,
            align === 'left' && { alignItems: 'flex-start' },
            align === 'center' && { alignItems: 'center' },
            align === 'right' && { alignItems: 'flex-end' },
          ]}>
            <View style={styles.instrumentalBars}>
              <Animated.View style={[styles.bar, styles.bar1, bar1Style, isActive && styles.barActive]} />
              <Animated.View style={[styles.bar, styles.bar2, bar2Style, isActive && styles.barActive]} />
              <Animated.View style={[styles.bar, styles.bar3, bar3Style, isActive && styles.barActive]} />
            </View>
          </View>
        ) : (
          <Animated.Text
            style={[
              styles.lyricText,
              animatedStyle,
              isActive && styles.lyricActive,
              isPast && styles.lyricPast,
              align === 'left' && styles.lyricLeft,
              align === 'center' && styles.lyricCenter,
              align === 'right' && styles.lyricRight,
            ]}
          >
            {item.text}
          </Animated.Text>
        )}
      </Pressable>
    </Animated.View>
  );
});

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { songId } = route.params;
  const { currentSong, getSong, updateSong, setCurrentSong } = useSongsStore();
  const { recentArts, addRecentArt } = useArtHistoryStore();
  const {
    isPlaying,
    currentTime,
    currentLineIndex,
    lyrics,
    duration,
    setLyrics,
    play,
    pause,
    togglePlay,
    seek,
    skipPrevious,
    skipNext,
    tick,
    reset,
    enqueueSong,
    dequeueNextSong,
    shouldAutoPlayOnLoad,
    setShouldAutoPlayOnLoad,
  } = usePlayerStore();

  const flatListRef = useRef<FlatList>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const autoScrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const hasTimestamps = useRef(false);
  const transitionInProgressRef = useRef(false);
  const userScrollingRef = useRef(false);
  const scrollYRef = useRef(0);
  const displayLineIndexRef = useRef(0);
  const [displayLineIndex, setDisplayLineIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const controlsOpacity = useSharedValue(1);
  const controlsTranslateY = useSharedValue(0);
  
  // Menus state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
  
  const [artMenuVisible, setArtMenuVisible] = useState(false);
  const [artMenuAnchor, setArtMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
  
  const [textCaseMenuVisible, setTextCaseMenuVisible] = useState(false);
  const [textCaseMenuAnchor, setTextCaseMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);

  // Auto-hide controls after 3.5 seconds only when playing
  useEffect(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    
    controlsOpacity.value = withSpring(1);
    controlsTranslateY.value = withSpring(0);
    setControlsVisible(true);
    
    if (!isPlaying) return;
    
    hideControlsTimerRef.current = setTimeout(() => {
      controlsOpacity.value = withSpring(0);
      controlsTranslateY.value = withSpring(100);
      setTimeout(() => setControlsVisible(false), 300);
    }, 3500);
    
    return () => {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, [isPlaying]);

  const handleScreenTap = () => {
    if (!isPlaying) return;
    
    controlsOpacity.value = withSpring(1);
    controlsTranslateY.value = withSpring(0);
    setControlsVisible(true);
    
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    
    hideControlsTimerRef.current = setTimeout(() => {
      controlsOpacity.value = withSpring(0);
      controlsTranslateY.value = withSpring(100);
      setTimeout(() => setControlsVisible(false), 300);
    }, 3500);
  };

  // Update hasTimestamps ref when lyrics change
  useEffect(() => {
    hasTimestamps.current = lyrics.some(l => l.timestamp > 0);
    autoScrollOffsetRef.current = 0; // Reset scroll on song change
  }, [lyrics]);

  // Load song and lyrics
  useEffect(() => {
    const loadSong = async () => {
      const song = await getSong(songId);
      if (song) {
        const finalDuration = song.duration > 0 ? song.duration : calculateDuration(song.lyrics);
        setLyrics(song.lyrics, finalDuration);
        setCurrentSong(song);
        if (shouldAutoPlayOnLoad) {
          play();
          setShouldAutoPlayOnLoad(false);
        }
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        });
      }
    };
    loadSong();

    return () => {
      reset();
    };
  }, [songId, shouldAutoPlayOnLoad]);

  // Auto-scroll animation loop (requestAnimationFrame)
  useEffect(() => {
    const cancelLoop = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameTimeRef.current = null;
    };

    if (!isPlaying) {
      cancelLoop();
      return;
    }

    const animate = (frameTime: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = frameTime;
      }

      const dt = Math.max(0, (frameTime - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = frameTime;

      if (hasTimestamps.current) {
        tick(dt);
      } else if (flatListRef.current && contentHeightRef.current > 0 && duration > 0) {
        const visibleHeight = SCREEN_HEIGHT * 0.6;
        const scrollDistance = Math.max(0, contentHeightRef.current - visibleHeight + 200);
        const speed = duration > 0 ? (scrollDistance / duration) : (currentSong?.scrollSpeed ?? 50);
        autoScrollOffsetRef.current += speed * dt;

        flatListRef.current.scrollToOffset({
          offset: autoScrollOffsetRef.current,
          animated: false,
        });

        tick(dt);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelLoop();
    };
  }, [isPlaying, duration, currentSong?.scrollSpeed]);

  // Transition to queued song when current one completes
  useEffect(() => {
    if (transitionInProgressRef.current) return;
    if (duration <= 0 || currentTime < duration) return;

    let nextSongId = dequeueNextSong();
    while (nextSongId && nextSongId === songId) {
      nextSongId = dequeueNextSong();
    }
    if (!nextSongId) return;

    transitionInProgressRef.current = true;
    autoScrollOffsetRef.current = 0;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    setShouldAutoPlayOnLoad(true);
    navigation.replace('NowPlaying', { songId: nextSongId });

    setTimeout(() => {
      transitionInProgressRef.current = false;
    }, 0);
  }, [currentTime, duration, isPlaying, songId]);

  // Scroll first, then highlight after animation
  useEffect(() => {
    if (userScrollingRef.current) return;
    if (!hasTimestamps.current) return;
    if (lyrics.length === 0) return;
    if (currentLineIndex < 0 || currentLineIndex >= lyrics.length) return;
    
    // Highlight immediately
    setDisplayLineIndex(currentLineIndex);
    
    // Always scroll to keep active line at fixed position
    if (flatListRef.current) {
      try {
        flatListRef.current.scrollToIndex({
          index: currentLineIndex,
          viewPosition: 0.3,
          animated: true,
        });
      } catch (e) {
        // Ignore scroll errors
      }
    }
  }, [currentLineIndex, lyrics.length]);

  const handleDismiss = () => {
    navigation.goBack();
  };

  const handleLineTap = (index: number) => {
    if (lyrics[index] && hasTimestamps.current) {
      seek(lyrics[index].timestamp);
      if (!isPlaying) {
        play();
      }
    }
  };

  const handleSeek = (time: number) => {
    seek(time);
  };

  const handleSkipBackward = () => {
    seek(Math.max(0, currentTime - 10));
  };

  const handleSkipForward = () => {
    seek(Math.min(duration, currentTime + 10));
  };

  const handleMorePress = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    setMenuAnchor({ x: pageX, y: pageY });
    setMenuVisible(true);
  };

  const handleMenuAction = async (action: 'edit' | 'replay' | 'queue' | 'textmenu') => {
    setMenuVisible(false);
    if (!currentSong) return;

    switch (action) {
      case 'edit':
        pause();
        navigation.navigate('AddEditLyrics', { songId: currentSong.id });
        break;
      case 'replay':
        autoScrollOffsetRef.current = 0;
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        seek(0);
        play();
        break;
      case 'queue':
        enqueueSong(currentSong.id);
        Alert.alert('Added to Queue', `${currentSong.title} will play after the current song.`);
        break;
    }
  };
  
  const handleTextMenuPress = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    setTextCaseMenuAnchor({ x: pageX, y: pageY });
    setTextCaseMenuVisible(true);
  };
  
  const handleTextCaseSelect = async (textCase: 'normal' | 'uppercase' | 'titlecase' | 'sentencecase') => {
    setTextCaseMenuVisible(false);
    if (!currentSong) return;
    
    const updatedSong = {
      ...currentSong,
      textCase,
      dateModified: new Date().toISOString(),
    };
    await updateSong(updatedSong);
    setCurrentSong(updatedSong);
  };

  const handleArtLongPress = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    setArtMenuAnchor({ x: pageX, y: pageY });
    setArtMenuVisible(true);
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0].uri && currentSong) {
        const uri = result.assets[0].uri;
        const updatedSong = {
          ...currentSong,
          coverImageUri: uri,
          dateModified: new Date().toISOString(),
        };
        await updateSong(updatedSong);
        setCurrentSong(updatedSong);
        addRecentArt(uri);
        setArtMenuVisible(false);
      }
    } catch (error) {
      console.error('Cover art save failed:', error);
      Alert.alert('Save failed', 'Failed to save cover art. Please try again.');
    }
  };

  const selectRecentArt = async (uri: string) => {
    if (currentSong) {
      try {
        const updatedSong = {
          ...currentSong,
          coverImageUri: uri,
          dateModified: new Date().toISOString(),
        };
        await updateSong(updatedSong);
        setCurrentSong(updatedSong);
        setArtMenuVisible(false);
      } catch (error) {
        console.error('Recent art apply failed:', error);
        Alert.alert('Save failed', 'Failed to save cover art. Please try again.');
      }
    }
  };

  const controlsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: controlsTranslateY.value }],
  }));

  const gradient = currentSong
    ? getGradientById(currentSong.gradientId) ?? GRADIENTS[0]
    : GRADIENTS[0];

  const transformText = (text: string, textCase?: 'normal' | 'uppercase' | 'titlecase' | 'sentencecase') => {
    if (!textCase || textCase === 'normal') return text;
    if (textCase === 'uppercase') return text.toUpperCase();
    if (textCase === 'titlecase') {
      return text.toLowerCase().split(' ').map(word => {
        if (word.length === 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join(' ');
    }
    if (textCase === 'sentencecase') return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    return text;
  };

  const renderLyric = useCallback(({ item, index }: { item: typeof lyrics[0]; index: number }) => (
    <LyricItem
      item={{ ...item, text: transformText(item.text, currentSong?.textCase) }}
      index={index}
      displayLineIndex={displayLineIndex}
      align={currentSong?.lyricsAlign || 'left'}
      onPress={() => handleLineTap(index)}
    />
  ), [displayLineIndex, currentSong?.lyricsAlign, currentSong?.textCase]);

  const artOptions = [
    {
      label: 'Choose from Gallery',
      icon: 'image-outline' as const,
      onPress: pickImage,
    },
    ...recentArts.map(uri => ({
      label: 'Reuse Recent Art',
      icon: 'time-outline' as const,
      onPress: () => selectRecentArt(uri),
    })),
  ];

  return (
    <View style={styles.container}>
      <GradientBackground gradientId={currentSong?.gradientId ?? 'aurora'} />
      <View style={styles.overlay} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={handleDismiss}>
            <Ionicons name="chevron-down" size={28} color="rgba(255,255,255,0.6)" />
          </Pressable>
          <Pressable style={styles.headerButton} onPress={handleMorePress}>
            <Ionicons name="ellipsis-horizontal" size={24} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>

        <View style={styles.lyricsContainer}>
          <FlatList
            ref={flatListRef}
            data={lyrics}
            keyExtractor={(item, index) => `${item.timestamp}-${index}`}
            renderItem={renderLyric}
            contentContainerStyle={styles.lyricsContent}
            showsVerticalScrollIndicator={false}
            onScroll={(e) => {
              if (!isPlaying) return;
              
              const currentY = e.nativeEvent.contentOffset.y;
              const scrollingDown = currentY < scrollYRef.current;
              scrollYRef.current = currentY;
              
              if (scrollingDown) {
                handleScreenTap();
              }
            }}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => {
              userScrollingRef.current = true;
            }}
            onMomentumScrollEnd={() => {
              setTimeout(() => {
                userScrollingRef.current = false;
              }, 1000);
            }}
            onScrollToIndexFailed={(info) => {
              // Silently ignore scroll failures
            }}
            onContentSizeChange={(_, h) => {
              contentHeightRef.current = h;
            }}
            ListHeaderComponent={<View style={{ height: SCREEN_HEIGHT * 0.3 }} />}
            ListFooterComponent={<View style={{ height: SCREEN_HEIGHT * 0.6 }} />}
          />
          <Pressable 
            onPress={handleScreenTap} 
            style={StyleSheet.absoluteFill}
            pointerEvents="box-none"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            style={styles.bottomFade}
            pointerEvents="none"
          />
        </View>

        {controlsVisible && (
          <Animated.View style={[styles.controlsContainer, controlsAnimatedStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.95)', '#000']}
              locations={[0, 0.3, 1]}
              style={[StyleSheet.absoluteFill, { bottom: -100, height: 400 }]}
              pointerEvents="none"
            />

            <View style={styles.songInfo}>
            <Pressable 
              style={styles.songThumbnail} 
              onLongPress={handleArtLongPress}
              delayLongPress={1500}
            >
              {currentSong?.coverImageUri ? (
                <Image 
                  source={{ uri: currentSong.coverImageUri }} 
                  style={StyleSheet.absoluteFill} 
                />
              ) : (
                <LinearGradient
                  colors={gradient.colors as [string, string, ...string[]]}
                  style={StyleSheet.absoluteFill}
                />
              )}
            </Pressable>
            <View style={styles.songDetails}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {currentSong?.title ?? 'Unknown Song'}
              </Text>
              <Text style={styles.songArtist} numberOfLines={1}>
                {currentSong?.artist ?? 'Unknown Artist'}
                {currentSong?.album && (
                  <Text style={styles.songAlbum}> • {currentSong.album}</Text>
                )}
              </Text>
            </View>
            <Pressable style={styles.moreButton} onPress={handleMorePress}>
              <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          <Scrubber
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
          />

          <PlayerControls
            isPlaying={isPlaying}
            onPlayPause={togglePlay}
            onSkipPrevious={handleSkipBackward}
            onSkipNext={handleSkipForward}
          />

          <View style={styles.actionButtons}>
            <Pressable style={styles.actionButton}>
              <Ionicons name="chatbubble-outline" size={22} color="rgba(255,255,255,0.5)" />
            </Pressable>
            <Pressable style={styles.actionButton}>
              <Ionicons name="share-outline" size={22} color="rgba(255,255,255,0.5)" />
            </Pressable>
            <Pressable style={styles.actionButton}>
              <Ionicons name="list-outline" size={22} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
        </Animated.View>
        )}
      </SafeAreaView>

      <CustomMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title={`${currentSong?.title} • ${currentSong?.artist}`}
        anchorPosition={menuAnchor}
        options={[
          {
            label: 'Edit Lyrics',
            icon: 'create-outline',
            onPress: () => handleMenuAction('edit'),
          },
          {
            label: 'Text Format',
            icon: 'text-outline',
            onPress: () => {
              setTextCaseMenuAnchor(menuAnchor);
              setTextCaseMenuVisible(true);
            },
          },
          {
            label: 'Replay Song',
            icon: 'refresh-outline',
            onPress: () => handleMenuAction('replay'),
          },
          {
            label: 'Add to Queue',
            icon: 'list-outline',
            onPress: () => handleMenuAction('queue'),
          }
        ]}
      />

      <CustomMenu
        visible={artMenuVisible}
        onClose={() => setArtMenuVisible(false)}
        title="Cover Art Options"
        anchorPosition={artMenuAnchor}
        options={artOptions}
      />
      
      <CustomMenu
        visible={textCaseMenuVisible}
        onClose={() => setTextCaseMenuVisible(false)}
        title="Text Format"
        anchorPosition={textCaseMenuAnchor}
        options={[
          {
            label: 'Normal',
            icon: 'text-outline',
            onPress: () => handleTextCaseSelect('normal'),
          },
          {
            label: 'ALL CAPS',
            icon: 'text-outline',
            onPress: () => handleTextCaseSelect('uppercase'),
          },
          {
            label: 'Title Case',
            icon: 'text-outline',
            onPress: () => handleTextCaseSelect('titlecase'),
          },
          {
            label: 'Sentence case',
            icon: 'text-outline',
            onPress: () => handleTextCaseSelect('sentencecase'),
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  lyricsContainer: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
  lyricsContent: {
    paddingHorizontal: 20,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 24,
    zIndex: 10,
  },
  songInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  songThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
  },
  songDetails: {
    flex: 1,
  },
  songTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  songArtist: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  songAlbum: {
    color: 'rgba(255,255,255,0.5)',
  },
  moreButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 8,
  },
  actionButton: {
    padding: 8,
  },
  lyricLine: {
    paddingVertical: 10,
    width: '100%',
    paddingHorizontal: 16,
  },
  lyricLineCenter: {
    alignItems: 'center',
  },
  lyricText: {
    fontSize: 26,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 38,
  },
  lyricLeft: {
    textAlign: 'left',
    width: '100%',
  },
  lyricCenter: {
    textAlign: 'center',
    width: '100%',
  },
  lyricRight: {
    textAlign: 'right',
    width: '100%',
  },
  lyricActive: {
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    maxWidth: '100%',
  },
  lyricPast: {
    color: 'rgba(255,255,255,0.25)',
  },
  instrumentalContainer: {
    width: '100%',
    paddingVertical: 12,
  },
  instrumentalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 40,
  },
  bar: {
    width: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  barActive: {
    backgroundColor: '#fff',
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  bar1: {
    height: 24,
  },
  bar2: {
    height: 40,
  },
  bar3: {
    height: 16,
  },
});

export default NowPlayingScreen;
