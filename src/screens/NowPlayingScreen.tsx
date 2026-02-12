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
  Modal,
  ScrollView,
  Animated as RNAnimated,
  PanResponder,
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
  // LyricsLine,
  Scrubber,
  PlayerControls,
  CustomMenu,
  VinylRecord,
  LrcSearchModal,
} from '../components';
import { SearchResult } from '../services/LyricsRepository';
import { LrcLibService } from '../services/LrcLibService';
import { GeniusService } from '../services/GeniusService';
import { getGradientById, GRADIENTS } from '../constants/gradients';
import { Colors } from '../constants/colors';
import { calculateDuration } from '../utils/timestampParser';
import { useIsFocused } from '@react-navigation/native';
import { Alert } from 'react-native';
// import { MagicModeModal } from '../components/MagicModeModal';
// import { ProcessingOverlay } from '../components/ProcessingOverlay';
// import { getAutoTimestampService, AutoTimestampResult } from '../services/autoTimestampServiceV2';
// import { lyricsToRawText } from '../utils/timestampParser';
// import { formatTime, generateId } from '../utils/formatters';
// import { audioService } from '../services/audioService';

type Props = RootStackScreenProps<'NowPlaying'>;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const LyricItem = React.memo<{
  item: any;
  index: number;
  displayLineIndex: number;
  align: 'left' | 'center' | 'right';
  onPress: () => void;
  hasTimestamps: boolean;
  isPlaying: boolean;
}>(({ item, index, displayLineIndex, align, onPress, hasTimestamps, isPlaying }) => {
  const isActive = index === displayLineIndex;
  const isPast = index < displayLineIndex;
  
  // const scale = useSharedValue(1);
  const bar1Height = useSharedValue(24);
  const bar2Height = useSharedValue(40);
  const bar3Height = useSharedValue(16);
  
  useEffect(() => {
    if (isActive && isPlaying && item.text.toUpperCase().includes('[INSTRUMENTAL]')) {
      const animate = () => {
        bar1Height.value = withSpring(Math.random() * 20 + 20, { damping: 10 });
        bar2Height.value = withSpring(Math.random() * 20 + 30, { damping: 10 });
        bar3Height.value = withSpring(Math.random() * 15 + 10, { damping: 10 });
      };
      const interval = setInterval(animate, 400);
      return () => {
        clearInterval(interval);
        bar3Height.value = 16;
      };
    }
  }, [isActive, isPlaying]);
  
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
              !hasTimestamps && styles.lyricNoTimestamp,
              hasTimestamps && isActive && styles.lyricActive,
              hasTimestamps && isPast && styles.lyricPast,
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

const ConnectedScrubber = React.memo(({ onSeek }: { onSeek: (time: number) => void }) => {
  const currentTime = usePlayerStore(state => state.currentTime);
  const duration = usePlayerStore(state => state.duration);

  return (
    <Scrubber
      currentTime={currentTime}
      duration={duration}
      onSeek={onSeek}
    />
  );
});

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { songId } = route.params;
  const isFocused = useIsFocused();
  const { currentSong, getSong, updateSong, setCurrentSong, songs } = useSongsStore();
  const { recentArts, addRecentArt } = useArtHistoryStore();
  // Player is now managed by PlayerProvider
  const {
    isPlaying,
    // currentTime, // REMOVED: Caused full re-renders
    currentLineIndex,
    lyrics,
    duration,
    setLyrics,
    play,
    pause,
    togglePlay,
    seek,
    // skipPrevious,
    // skipNext,
    tick,
    // reset,
    enqueueSong,
    dequeueNextSong,
    shouldAutoPlayOnLoad,
    setShouldAutoPlayOnLoad,
    queueSongIds,
    clearQueue,
  } = usePlayerStore();

  // Player registration and sync now handled by PlayerProvider

  const flatListRef = useRef<FlatList>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const autoScrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const hasTimestamps = useRef(false);
  const transitionInProgressRef = useRef(false);
  const userScrollingRef = useRef(false);
  const scrollYRef = useRef(0);
  // const displayLineIndexRef = useRef(0);
  const [displayLineIndex, setDisplayLineIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const controlsOpacity = useSharedValue(1);
  const controlsTranslateY = useSharedValue(0);
  const vinylSpinValue = useRef(new RNAnimated.Value(0)).current;
  const titleScrollAnim = useRef(new RNAnimated.Value(0)).current;
  const [titleWidth, setTitleWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  
  // Pan responder for swipe down on vinyl screen
  const vinylPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // More permissible gesture detection
        return gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 50) {
          handleDismiss();
        }
      },
      onPanResponderTerminate: () => {
        // Handle termination if needed
      }
    })
  ).current;
  
  // Menus state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
  
  const [artMenuVisible, setArtMenuVisible] = useState(false);
  const [artMenuAnchor, setArtMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
  
  const [textCaseMenuVisible, setTextCaseMenuVisible] = useState(false);
  const [textCaseMenuAnchor, setTextCaseMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
  const [showLyrics, setShowLyrics] = useState(true);
  const [queueVisible, setQueueVisible] = useState(false);
  
  // Magic Mode State
  const [showSearchModal, setShowSearchModal] = useState(false);


  // Tasks Store
  // const { addTask, updateTask, tasks } = useTasksStore();
  // const activeTasksCount = tasks.filter(t => t.status === 'queued' || t.status === 'processing').length;
  // const activeTasksCount = 0;

  // Magic Mode Handler (REMOVED)

  // Title scrolling animation
  useEffect(() => {
    const shouldScroll = isFocused && isPlaying && titleWidth > 0 && containerWidth > 0 && titleWidth > containerWidth;
    
    if (shouldScroll) {
      titleScrollAnim.setValue(0);
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(1000),
          RNAnimated.timing(titleScrollAnim, {
            toValue: -(titleWidth - containerWidth + 20),
            duration: (titleWidth - containerWidth + 20) * 30,
            useNativeDriver: true,
          }),
          RNAnimated.delay(1000),
          RNAnimated.timing(titleScrollAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      titleScrollAnim.stopAnimation();
      titleScrollAnim.setValue(0);
    }
  }, [isPlaying, titleWidth, containerWidth, currentSong?.title]);

  // Vinyl rotation animation
  useEffect(() => {
    if (isPlaying && (!showLyrics || lyrics.length === 0)) {
      vinylSpinValue.setValue(0);
      RNAnimated.timing(vinylSpinValue, {
        toValue: 100,
        duration: 600000,
        useNativeDriver: true,
      }).start();
    } else {
      vinylSpinValue.stopAnimation();
    }
  }, [isPlaying, showLyrics, lyrics.length]);

  const vinylSpin = vinylSpinValue.interpolate({
    inputRange: [0, 100],
    outputRange: ['0deg', '36000deg'],
  });

  // Auto-hide controls after 3.5 seconds only when playing AND has lyrics
  useEffect(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    
    controlsOpacity.value = withSpring(1);
    controlsTranslateY.value = withSpring(0);
    setControlsVisible(true);
    
    // Don't auto-hide if no lyrics or not playing
    if (!isPlaying || lyrics.length === 0) return;
    
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
  }, [isPlaying, lyrics.length]);

  const handleScreenTap = () => {
    // Show controls on tap/scroll regardless of play state
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
        
        // Audio loading now handled by PlayerProvider
        
        // Auto-fill queue with remaining songs if empty
        if (queueSongIds.length === 0) {
          const remainingSongs = songs.filter(s => s.id !== songId).map(s => s.id);
          remainingSongs.forEach(id => enqueueSong(id));
        }
        
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
      // No cleanup needed - let audio play in background and update store
    };
    // FIXED: Don't re-run when shouldAutoPlayOnLoad changes (it flips to false after load)
  }, [songId]);

  // Auto-scroll animation loop (requestAnimationFrame)
  useEffect(() => {
    const cancelLoop = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameTimeRef.current = null;
    };

    if (!isPlaying || !showLyrics || !isFocused) {
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
        // Tick to update time even without audio
        // FIXED: Only tick if NO audio is driving the time to prevent jitter/glitches
        if (!currentSong?.audioUri) {
          tick(dt);
        }
      } else if (flatListRef.current && contentHeightRef.current > 0) {
        // Calculate max scrollable distance (total content - viewport)
        // We use SCREEN_HEIGHT as approx viewport height
        const viewportHeight = SCREEN_HEIGHT;
        const maxScrollOffset = Math.max(0, contentHeightRef.current - viewportHeight);
        
        // Use exact audio duration if available, else fallback
        const effectiveDuration = duration > 0 ? duration : 60;
        
        // Speed = Total Distance / Total Time
        // This ensures scanning finishes exactly when audio ends
        const speed = (maxScrollOffset / effectiveDuration);
        
        autoScrollOffsetRef.current += speed * dt;

        flatListRef.current.scrollToOffset({
          offset: autoScrollOffsetRef.current,
          animated: false,
        });

        if (!currentSong?.audioUri) {
          tick(dt);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelLoop();
    };
  }, [isPlaying, duration, currentSong?.scrollSpeed, showLyrics, currentSong?.audioUri]);

  // Transition to queued song when current one completes
  // Optimized: Uses subscription to avoid re-rendering on every second
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      const { currentTime, duration: storeDuration, isPlaying: storeIsPlaying } = state;
      
      if (transitionInProgressRef.current) return;
      if (storeDuration <= 0 || currentTime < storeDuration) return;
      if (!storeIsPlaying) return;

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
    });

    return () => unsub();
  }, [songId, navigation]);

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

  // Initial sync when screen mounts or returns from background
  useEffect(() => {
    if (lyrics.length > 0 && hasTimestamps.current) {
      // Sync display with current playback position
      setDisplayLineIndex(currentLineIndex);
      
      // Scroll to current position without animation on mount
      if (flatListRef.current && currentLineIndex >= 0 && currentLineIndex < lyrics.length) {
        setTimeout(() => {
          try {
            flatListRef.current?.scrollToIndex({
              index: currentLineIndex,
              viewPosition: 0.3,
              animated: false, // No animation on initial sync
            });
          } catch (e) {
            // Ignore scroll errors
          }
        }, 100); // Small delay to ensure FlatList is ready
      }
    }
  }, [lyrics.length]); // Only run when lyrics are loaded

  const handleDismiss = () => {
    navigation.goBack();
  };

  const handleLineTap = (index: number) => {
    if (lyrics[index] && hasTimestamps.current) {
      const seekTime = lyrics[index].timestamp;
      seek(seekTime); // PlayerProvider handles audio seeking
      
      if (!isPlaying) {
        play();
      }
    }
  };

  const handleSeek = (time: number) => {
    seek(time); // PlayerProvider handles audio seeking
  };

  const handleSkipBackward = () => {
    const { currentTime } = usePlayerStore.getState();
    const newTime = Math.max(0, currentTime - 10);
    seek(newTime); // PlayerProvider handles audio seeking
  };

  const handleSkipForward = () => {
    const { currentTime, duration: storeDuration } = usePlayerStore.getState();
    const newTime = Math.min(storeDuration, currentTime + 10);
    seek(newTime); // PlayerProvider handles audio seeking
  };

  const handleMorePress = (event: GestureResponderEvent) => {
    if (!event?.nativeEvent) {
      setMenuVisible(true);
      return;
    }
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
    if (!event?.nativeEvent) {
      setTextCaseMenuVisible(true);
      return;
    }
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

  const handleSearchResult = async (result: SearchResult) => {
    setShowSearchModal(false);
    
    let finalLyrics = result.syncedLyrics || result.plainLyrics;
    
    // If from Genius, scrape if needed
    if (result.source === 'Genius' && !finalLyrics && result.url) {
       const scraped = await GeniusService.scrapeGeniusLyrics(result.url);
       if (scraped) finalLyrics = scraped;
    }

    if (!finalLyrics) {
      Alert.alert('Error', 'No lyrics text found in this result.');
      return;
    }

    // Parse
    let parsedLines = LrcLibService.parseLrc(finalLyrics);
    if (result.source === 'Genius' || result.type === 'plain') {
       if (!finalLyrics.includes('[')) {
          parsedLines = GeniusService.convertToLyricLines(finalLyrics);
       }
    }

    // Update Song
    if (currentSong) {
      const newDuration = (result.duration && result.duration > 0) ? result.duration : currentSong.duration;
      
      const updatedSong = {
        ...currentSong,
        lyrics: parsedLines,
        duration: newDuration,
        lyricSource: result.source,
        dateModified: new Date().toISOString(),
      };
      
      await updateSong(updatedSong);
      setCurrentSong(updatedSong);
      setLyrics(parsedLines, newDuration);
      
      Alert.alert('Success', `Lyrics updated from ${result.source}`);
    }
  };

  const handleArtLongPress = (event: GestureResponderEvent) => {
    if (!event?.nativeEvent) {
      setArtMenuVisible(true);
      return;
    }
    const { pageX, pageY } = event.nativeEvent;
    setArtMenuAnchor({ x: pageX, y: pageY });
    setArtMenuVisible(true);
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0].uri && currentSong) {
        const uri = result.assets[0].uri;
        // Get full song with lyrics from database
        const fullSong = await getSong(currentSong.id);
        if (!fullSong) return;
        
        const updatedSong = {
          ...fullSong,
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
        // Get full song with lyrics from database
        const fullSong = await getSong(currentSong.id);
        if (!fullSong) return;
        
        const updatedSong = {
          ...fullSong,
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

  // const gradient = currentSong
  //   ? getGradientById(currentSong.gradientId) ?? GRADIENTS[0]
  //   : GRADIENTS[0];

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
      hasTimestamps={hasTimestamps.current}
      isPlaying={isPlaying}
    />
  ), [displayLineIndex, currentSong?.lyricsAlign, currentSong?.textCase, handleLineTap, isPlaying]);

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
      {showLyrics && lyrics.length > 0 && (
        <>
          <GradientBackground gradientId={currentSong?.gradientId ?? 'aurora'} />
          <View style={styles.overlay} />
        </>
      )}

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Pressable 
              style={styles.headerButton} 
              onPress={() => {
                // Ensure we just go back, triggering the native slide-down animation
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  // Fallback if somehow no history (unlikely in modal)
                  navigation.navigate('Main' as never);
                }
              }}
              hitSlop={20} // Make touch area larger
            >
              <Ionicons name="chevron-down" size={28} color="rgba(255,255,255,0.6)" />
            </Pressable>
            <View style={styles.headerRight}>
              <Pressable 
                style={styles.headerButton} 
                onPress={() => navigation.navigate('Search')}
              >
                <Ionicons name="search" size={24} color="rgba(255,255,255,0.6)" />
              </Pressable>
              {/* <Pressable style={styles.headerButton} onPress={() => setShowTasksModal(true)}>
                <View>
                  <Ionicons name="notifications-outline" size={24} color="rgba(255,255,255,0.6)" />
                  {activeTasksCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{activeTasksCount}</Text>
                    </View>
                  )}
                </View>
              </Pressable> */}
              <Pressable style={styles.headerButton} onPress={async () => {
                if (currentSong) {
                  const fullSong = await getSong(currentSong.id);
                  if (fullSong) {
                    await updateSong({ ...fullSong, isLiked: !fullSong.isLiked });
                    setCurrentSong({ ...fullSong, isLiked: !fullSong.isLiked });
                  }
                }
              }}>
                <Ionicons 
                  name={currentSong?.isLiked ? "heart" : "heart-outline"} 
                  size={24} 
                  color={currentSong?.isLiked ? "#FF3B30" : "rgba(255,255,255,0.6)"} 
                />
              </Pressable>
              <Pressable style={styles.headerButton} onPress={handleMorePress}>
                <Ionicons name="ellipsis-horizontal" size={24} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
          </View>

        <View style={styles.lyricsContainer}>
          {showLyrics && lyrics.length > 0 ? (
            <View style={{ flex: 1 }}>
              <FlatList
                ref={flatListRef}
                data={lyrics}
                keyExtractor={(item, index) => `${item.timestamp}-${index}`}
                renderItem={renderLyric}
                contentContainerStyle={styles.lyricsContent}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                maxToRenderPerBatch={5}
                updateCellsBatchingPeriod={100}
                windowSize={11}
                initialNumToRender={10}
                onScroll={(e) => {
                  // Show controls when scrolling up to see previous lyrics
                  if (lyrics.length === 0) return;
                  
                  const currentY = e.nativeEvent.contentOffset.y;
                  const scrollingUp = currentY < scrollYRef.current; // Scrolling up = seeing previous text
                  scrollYRef.current = currentY;
                  
                  if (scrollingUp) {
                    handleScreenTap();
                  }
                }}
                scrollEventThrottle={8}
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
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.5)']}
                style={styles.bottomFade}
                pointerEvents="none"
              />
            </View>
          ) : (
            <View style={styles.noLyricsContainer} {...vinylPanResponder.panHandlers}>
              <RNAnimated.View style={{ transform: [{ rotate: vinylSpin }] }}>
                 <VinylRecord 
                    imageUri={currentSong?.coverImageUri} 
                    size={300} 
                  />
              </RNAnimated.View>
            </View>
          )}
        </View>

        {controlsVisible && (
          <Animated.View style={[styles.controlsContainer, controlsAnimatedStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.95)', '#000']}
              locations={[0, 0.3, 1]}
              style={[StyleSheet.absoluteFill, { bottom: -100, height: 400 }]}
              pointerEvents="none"
            />

            <View style={[styles.songInfo, (!hasTimestamps.current || !showLyrics) && styles.songInfoBlackBg]}>
            <Pressable 
              style={styles.songThumbnail} 
              onLongPress={handleArtLongPress}
              delayLongPress={1500}
            >
              <RNAnimated.View style={{ transform: [{ rotate: vinylSpin }] }}>
                 <VinylRecord 
                    imageUri={currentSong?.coverImageUri} 
                    size={56} 
                  />
              </RNAnimated.View>
            </Pressable>
            <View style={styles.songDetails} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
              <View style={{ overflow: 'hidden', width: '100%' }}>
                <RNAnimated.Text
                  style={[
                    styles.songTitle,
                    { transform: [{ translateX: titleScrollAnim }] }
                  ]}
                  numberOfLines={1}
                  onTextLayout={(e) => {
                    if (e.nativeEvent.lines[0]) {
                      setTitleWidth(e.nativeEvent.lines[0].width);
                    }
                  }}
                >
                  {currentSong?.title ?? 'Unknown Song'}
                </RNAnimated.Text>
              </View>
              <Text style={styles.songArtist} numberOfLines={1}>
                {currentSong?.artist ?? 'Unknown Artist'}
                {currentSong?.album && (
                  <Text style={styles.songAlbum}> • {currentSong.album}</Text>
                )}
              </Text>
            </View>
            {/* Magic Button (Dynamic Gradient) */}
            <Pressable 
              style={styles.magicButton} 
              onPress={() => setShowSearchModal(true)}
            >
              <LinearGradient
                colors={(getGradientById(currentSong?.gradientId ?? 'aurora')?.colors ?? ['#FF0080', '#7928CA']) as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.magicGradient}
              >
                <Ionicons name="sparkles" size={20} color="#fff" />
              </LinearGradient>
            </Pressable>
            <Pressable style={styles.moreButton} onPress={handleMorePress}>
              <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          <ConnectedScrubber onSeek={handleSeek} />

          <PlayerControls
            isPlaying={isPlaying}
            onPlayPause={togglePlay}
            onSkipPrevious={handleSkipBackward}
            onSkipNext={handleSkipForward}
          />

          <View style={styles.actionButtons}>
            <Pressable 
              style={styles.actionButton} 
              onPress={lyrics.length > 0 ? () => setShowLyrics(!showLyrics) : undefined}
              disabled={lyrics.length === 0}
            >
              <Ionicons 
                name={showLyrics ? "eye-off-outline" : "eye-outline"} 
                size={22} 
                color={lyrics.length === 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)"} 
              />
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => setQueueVisible(true)}>
              <Ionicons name="list-outline" size={22} color="rgba(255,255,255,0.8)" />
              {queueSongIds.length > 0 && (
                <View style={styles.queueBadge}>
                  <Text style={styles.queueBadgeText}>{queueSongIds.length}</Text>
                </View>
              )}
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
          },
        ]}
      />

      <LrcSearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelect={handleSearchResult}
        initialQuery={{
          title: currentSong?.title || '',
          artist: currentSong?.artist || '',
          duration: currentSong?.duration || 0,
        }}
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
      
      <Modal
        visible={queueVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQueueVisible(false)}
      >
        <Pressable 
          style={styles.queueOverlay} 
          onPress={() => setQueueVisible(false)}
        >
          <View style={styles.queueContainer}>
            <View style={styles.queueHeader}>
              <Text style={styles.queueTitle}>Queue ({queueSongIds.length})</Text>
              {queueSongIds.length > 0 && (
                <Pressable onPress={() => { clearQueue(); setQueueVisible(false); }}>
                  <Text style={styles.queueClear}>Clear</Text>
                </Pressable>
              )}
            </View>
            <ScrollView style={styles.queueScroll}>
              {queueSongIds.length === 0 ? (
                <View style={styles.queueEmpty}>
                  <Ionicons name="musical-notes-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.queueEmptyText}>Queue is empty</Text>
                </View>
              ) : (
                queueSongIds.map((id, index) => {
                  const queueSong = songs.find(s => s.id === id);
                  if (!queueSong) return null;
                  // const queueGradient = getGradientById(queueSong.gradientId) || GRADIENTS[0];
                  return (
                    <View key={id} style={styles.queueItem}>
                      <Text style={styles.queueNumber}>{index + 1}</Text>
                      <View style={styles.queueThumbnail}>
                        {queueSong.coverImageUri ? (
                          <Image source={{ uri: queueSong.coverImageUri }} style={styles.queueImage} />
                        ) : (
                          <View style={styles.defaultQueueThumbnail}>
                            <Ionicons name="disc" size={20} color="rgba(255,255,255,0.3)" />
                          </View>
                        )}
                      </View>
                      <View style={styles.queueInfo}>
                        <Text style={styles.queueSongTitle} numberOfLines={1}>{queueSong.title}</Text>
                        <Text style={styles.queueSongArtist} numberOfLines={1}>{queueSong.artist || 'Unknown'}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
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
    gap: 12,
  },
  songInfoBlackBg: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginHorizontal: -16,
    paddingLeft: 16,
    paddingRight: 16,
  },
  songThumbnail: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylRing1: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  vinylRing2: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  vinylCenter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  defaultThumbnail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  songDetails: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
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
    position: 'relative',
  },
  queueBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  queueBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  queueOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  queueContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 40,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  queueTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  queueClear: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
  queueScroll: {
    paddingHorizontal: 20,
  },
  queueEmpty: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  queueEmptyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 12,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  queueNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    width: 24,
  },
  queueThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#2C2C2E',
  },
  queueImage: {
    width: '100%',
    height: '100%',
  },
  defaultQueueThumbnail: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  queueInfo: {
    flex: 1,
  },
  queueSongTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  queueSongArtist: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  noLyricsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 280,
  },
  vinylCover: {
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  vinylDisc: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
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
  lyricNoTimestamp: {
    color: '#fff',
    fontWeight: '600',
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
  magicButton: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  magicGradient: {
    padding: 8,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NowPlayingScreen;
