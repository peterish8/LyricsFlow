import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Dimensions, Platform, LayoutAnimation, UIManager, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { useNavigation } from '@react-navigation/native';
import * as GestureHandler from 'react-native-gesture-handler';
import SynchronizedLyrics from './SynchronizedLyrics';
import IslandScrubber from './IslandScrubber';
const { Gesture, GestureDetector } = GestureHandler;
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  withSequence,
  withSpring,
  Easing, 
  cancelAnimation,
  interpolate,
  Extrapolation,
  runOnJS
} from 'react-native-reanimated';

import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { getGradientColors } from '../constants/gradients';
import Scrubber from './Scrubber';
import VinylRecord from './VinylRecord';
import { getCurrentLineIndex } from '../utils/timestampParser';

const { width } = Dimensions.get('window');

// Create Animated Pressable
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MiniPlayer: React.FC = () => {
  const player = usePlayer();
  const { currentSong, showTransliteration, loadedAudioId, setLoadedAudioId, hideMiniPlayer, setMiniPlayerHidden } = usePlayerStore();
  const { miniPlayerStyle, libraryFocusMode } = useSettingsStore();
  const navigation = useNavigation();
  
  // Use store instead of navigation state to avoid root-level crashes
  const isNowPlaying = hideMiniPlayer;

  // Optimistic Playback State
  const [optimisticPlaying, setOptimisticPlaying] = useState(false);
  
  // Animation for Play/Pause Button
  const playButtonScale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }]
  }));

  // Sync optimistic state with real source of truth
  useEffect(() => {
    if (player) {
      setOptimisticPlaying(player.playing);
    }
  }, [player?.playing]);

  const togglePlay = (e?: any) => {
      e?.stopPropagation();
      if (!player) return;

      // 1. Optimistic Update
      const nextState = !optimisticPlaying;
      setOptimisticPlaying(nextState);

      // 2. Button Animation (Bounce In -> Out)
      playButtonScale.value = withSequence(
          withTiming(0.8, { duration: 100 }),
          withSpring(1, { damping: 10, stiffness: 200 })
      );

      // 3. Actual Action
      if (nextState) {
          player.play();
      } else {
          player.pause();
      }
  };

  
  const [expanded, setExpanded] = useState(false);
  const [lyricExpanded, setLyricExpanded] = useState(false);
  const [fullLyricExpanded, setFullLyricExpanded] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  
  const flatListRef = useRef<FlatList>(null);
  const isUserScrolling = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Animation values
  const rotation = useSharedValue(0);
  const expansionProgress = useSharedValue(0); // 0 = collapsed, 1 = tray (190px)
  const lyricExpansionProgress = useSharedValue(0); // 0 = tray, 1 = half screen
  const fullExpansionProgress = useSharedValue(0); // 0 = half screen, 1 = full screen (nav-bar level)
  
  const isIsland = miniPlayerStyle === 'island';
  
  const screenHeight = Dimensions.get('window').height;
  
  const gradientColors = currentSong?.gradientId 
    ? getGradientColors(currentSong.gradientId) 
    : ['#222', '#111'];
    
  // Create a "vignette" theme for island: Black -> Color -> Black
  const mainColor = gradientColors[1] || gradientColors[0];

  // Seek Lock to prevent visual glitch
  const isSeekingRef = useRef(false);
  const seekLockTimeout = useRef<NodeJS.Timeout | null>(null);

  // Update time & Rotation Logic
  useEffect(() => {
    const interval = setInterval(() => {
      if (player && !isSeekingRef.current) {
        setCurrentTime(player.currentTime);
        setDuration(player.duration);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [player]);

  // Track if this is the first song loore)
  const isInitialLoad = useRef(true);

  // Audio Sync Logic: Auto-load song if it changes in the store
  useEffect(() => {
    const syncAudio = async () => {
      if (!currentSong || !player) return;
      
      // If the player doesn't have this audio loaded, load it
      if (loadedAudioId !== currentSong.id && currentSong.audioUri) {
        try {
          console.log('[MiniPlayer] Syncing audio for:', currentSong.title);
          await player.replace(currentSong.audioUri);
          setLoadedAudioId(currentSong.id);
          
          // On app startup (first load), don't auto-play
          // On user-initiated song change, auto-play
          if (isInitialLoad.current) {
            isInitialLoad.current = false;
            console.log('[MiniPlayer] Initial load - staying paused');
          } else {
            player.play();
            console.log('[MiniPlayer] User selected song - auto-playing');
          }
        } catch (error) {
          console.error('[MiniPlayer] Failed to sync audio:', error);
        }
      }
    };
    
    syncAudio();
  }, [currentSong?.id, player]);

  // Handle Rotation
  useEffect(() => {
    if (!player) return;
    
    if (player.playing) {
      // Calculate remaining rotation for current cycle
      // Normalize current rotation to 0-360 range
      const currentRotation = rotation.value % 360;
      // Calculate duration needed for the remaining part of the turn (assuming 3000ms per full turn)
      const remainingDuration = 3000 * ((360 - currentRotation) / 360);
      
      rotation.value = withSequence(
        // 1. Finish the current rotation to 360
        withTiming(360, { duration: remainingDuration, easing: Easing.linear }),
        // 2. Loop 0 -> 360 forever
        withRepeat(
          withSequence(
            withTiming(0, { duration: 0 }), // Reset to 0 instantly
            withTiming(360, { duration: 3000, easing: Easing.linear }) // Full rotation
          ),
          -1,
          false
        )
      );
    } else {
      // Pause rotation at current angle
      cancelAnimation(rotation);
    }
  }, [player?.playing]);

  const animatedVinylStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });
  
  // Dynamic Island Spring Animation
  const animatedIslandStyle = useAnimatedStyle(() => {
    if (!isIsland) return {};

    const currentWidth = interpolate(
      expansionProgress.value,
      [0, 1],
      [width * 0.52, width - 24], // Expand to full width minus margin * 2 (12 + 12)
      Extrapolation.CLAMP
    );

    const trayHeight = interpolate(expansionProgress.value, [0, 1], [50, 190], Extrapolation.CLAMP);
    const halfHeight = screenHeight * 0.5;
    const fullHeight = screenHeight * 0.9; // Final stage (90% height)

    const currentHeight = interpolate(
      fullExpansionProgress.value,
      [0, 1],
      [
        interpolate(lyricExpansionProgress.value, [0, 1], [trayHeight, halfHeight], Extrapolation.CLAMP),
        fullHeight
      ],
      Extrapolation.CLAMP
    );
    
    const currentRadius = interpolate(
      fullExpansionProgress.value,
      [0, 1],
      [
        interpolate(lyricExpansionProgress.value, [0, 1], 
          [interpolate(expansionProgress.value, [0, 1], [30, 44], Extrapolation.CLAMP), 24], 
          Extrapolation.CLAMP
        ),
        28 // Slightly more rounded again at full screen for aesthetics
      ],
      Extrapolation.CLAMP
    );

    return {
      width: currentWidth,
      height: currentHeight,
      borderRadius: currentRadius,
    };
  });
  
  // Safe progress calculation
  const progress = duration > 0 && !isNaN(currentTime) 
    ? Math.min(currentTime / duration, 1) 
    : 0;
  
  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Get Current Lyric
  const lyricsToUse = (showTransliteration && currentSong?.transliteratedLyrics)
    ? currentSong.transliteratedLyrics
    : currentSong?.lyrics;

  const currentLyricIndex = lyricsToUse
    ? getCurrentLineIndex(lyricsToUse, currentTime) 
    : -1;
  const currentLyricText = (currentLyricIndex !== -1 && lyricsToUse?.[currentLyricIndex]) 
    ? lyricsToUse[currentLyricIndex].text 
    : '';

  /* 
     VISUAL HIGHLIGHT LAG 
     User wants text to "come up" before highlighting.
     - currentLyricIndex: Logic source (time based).
     - visualLyricIndex: Render source (delayed to match scroll).
  */
  const [visualLyricIndex, setVisualLyricIndex] = useState(-1);

  // Sync Visual Index + Scroll
  useEffect(() => {
    // If not expanded, just sync immediately
    if (!lyricExpanded && !fullLyricExpanded) {
        setVisualLyricIndex(currentLyricIndex);
        return;
    }

    // 1. Manual Scrolling? Instant Update.
    if (isUserScrolling.current) {
        setVisualLyricIndex(currentLyricIndex);
        return;
    }

    if (currentLyricIndex !== -1 && flatListRef.current && lyricsToUse?.length) {
        // 2. Trigger Scroll (Logic Index)
        // Debounce slightly to ensure layout readiness
        const scrollTimer = setTimeout(() => {
             try {
                flatListRef.current?.scrollToIndex({
                    index: currentLyricIndex,
                    animated: true,
                    viewPosition: fullLyricExpanded ? 0.35 : 0.5 
                });
            } catch (e) { }
        }, 50);

        // 3. Delay Visual Update (Wait for Scroll)
        // Standard scroll animation is ~300ms. We wait 400ms to be safe.
        // This ensures the line moves UP while gray, then turns white at the destination.
        const highlightTimer = setTimeout(() => {
            setVisualLyricIndex(currentLyricIndex);
        }, 400); 

        return () => {
            clearTimeout(scrollTimer);
            clearTimeout(highlightTimer);
        };
    }
  }, [currentLyricIndex, lyricExpanded, fullLyricExpanded]);

  // FORCE scroll on mount/expand to fix "starts at top" bug
  useEffect(() => {
      if ((lyricExpanded || fullLyricExpanded) && flatListRef.current && currentLyricIndex !== -1) {
          setTimeout(() => {
             try {
                flatListRef.current?.scrollToIndex({
                    index: currentLyricIndex,
                    animated: false, // Instant jump for initial open
                    viewPosition: fullLyricExpanded ? 0.35 : 0.5
                });
            } catch (e) {}
          }, 50); // Small delay for mount
      }
  }, [lyricExpanded, fullLyricExpanded]);

  const handleScrollBegin = () => {
    isUserScrolling.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
  };

  const handleScrollEnd = () => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 3000);
  };


  
  const skipForward = (e?: any) => {
    e?.stopPropagation();
    if (!player) return;
    const newTime = Math.min(player.currentTime + 10, duration);
    player.seekTo(newTime);
  };
  
  const skipBackward = (e?: any) => {
    e?.stopPropagation();
    if (!player) return;
    const newTime = Math.max(0, player.currentTime - 10);
    player.seekTo(newTime);
  };

  const handleSeekPress = (e: any) => {
      e.stopPropagation();
      if (!player || duration <= 0 || progressBarWidth <= 0) return;
      const { locationX } = e.nativeEvent;
      const percentage = locationX / progressBarWidth;
      const seekTime = percentage * duration;
      player.seekTo(seekTime);
  };

  const panGesture = Gesture.Pan()
    .activeOffsetY([-5, 5]) // Increased sensitivity (was 20)
    .simultaneousWithExternalGesture()
    .onUpdate((event: any) => {
      if (expanded) {
        if (!lyricExpanded && !fullLyricExpanded) {
          // Stage 1 (Tray) -> Stage 2 (Half)
          if (event.translationY > 0) {
            lyricExpansionProgress.value = Math.min(event.translationY / 200, 1);
          }
        } else if (lyricExpanded && !fullLyricExpanded) {
           // Stage 2 (Half) -> Stage 3 (Full)
           // If dragging DOWN (positive), go to Full. 
           // If dragging UP (negative), go back to Tray.
           console.log('[PAN] Half mode - translationY:', event.translationY);
           if (event.translationY > 0) {
             fullExpansionProgress.value = Math.min(event.translationY / 200, 1);
             console.log('[PAN] Expanding to full:', fullExpansionProgress.value);
           } else {
             // Dragging UP - return to Tray
             lyricExpansionProgress.value = 1 - Math.min(Math.abs(event.translationY) / 200, 1);
           }
        } else if (fullLyricExpanded) {
          // Stage 3 (Full) -> Stage 2 (Half)
          // Only allow dragging UP to collapse
          if (event.translationY < 0) {
            fullExpansionProgress.value = 1 - Math.min(Math.abs(event.translationY) / 200, 1);
          }
        }
      }
    })
    .onEnd((event: any) => {
      if (expanded) {
        const velocity = event.velocityY;
        const translation = event.translationY;

        if (!lyricExpanded && !fullLyricExpanded) {
          // Transition Tray -> Half
          if (translation > 50 || velocity > 500) {
            lyricExpansionProgress.value = withSpring(1);
            runOnJS(setLyricExpanded)(true);
          } else {
            lyricExpansionProgress.value = withSpring(0);
          }
        } else if (lyricExpanded && !fullLyricExpanded) {
          // From Half: Go Full or back to Tray
          console.log('[PAN END] Half mode - translation:', translation, 'velocity:', velocity);
          if (translation > 50 || velocity > 500) {
            // Dragged DOWN -> Go Full
            console.log('[PAN END] Triggering full expansion!');
            fullExpansionProgress.value = withSpring(1);
            runOnJS(setFullLyricExpanded)(true);
          } else if (translation < -50 || velocity < -500) {
            // Dragged UP -> Go Tray
            lyricExpansionProgress.value = withSpring(0);
            runOnJS(setLyricExpanded)(false);
            runOnJS(setFullLyricExpanded)(false);
          } else {
            // Snap back to Half
            lyricExpansionProgress.value = withSpring(1);
            fullExpansionProgress.value = withSpring(0);
          }
        } else if (fullLyricExpanded) {
          // From Full: Go back to Half
          if (translation < -50 || velocity < -500) {
            fullExpansionProgress.value = withSpring(0);
            runOnJS(setFullLyricExpanded)(false);
          } else {
            fullExpansionProgress.value = withSpring(1);
          }
        }
      }
    });

  const toggleExpand = () => {
    // ✅ FIX: Tapping should collapse from ANY state, not open NowPlaying
    if (expanded) {
      // Collapse everything back to closed
      expansionProgress.value = withSpring(0);
      lyricExpansionProgress.value = withSpring(0);
      fullExpansionProgress.value = withSpring(0);
      setExpanded(false);
      setLyricExpanded(false);
      setFullLyricExpanded(false);
      return;
    }
    
    // Expand to opened (tray) state
    expansionProgress.value = withSpring(1, {
      damping: 14,
      stiffness: 150,
      mass: 0.6
    });
    setExpanded(true);
  };

  const openNowPlaying = () => {
    if (currentSong) {
      setMiniPlayerHidden(true); // Immediate hide to prevent flicker
      (navigation as any).navigate('NowPlaying', { songId: currentSong.id });
      // Collapse with spring
      expansionProgress.value = withSpring(0);
      lyricExpansionProgress.value = withSpring(0);
      fullExpansionProgress.value = withSpring(0);
      setExpanded(false);
      setLyricExpanded(false);
      setFullLyricExpanded(false);
    }
  };

  const handleLyricPress = useCallback((timestamp: number) => {
      // Allow tapping specific line to expand too -> AND seek?
      if (!fullLyricExpanded) {
          runOnJS(setFullLyricExpanded)(true);
          fullExpansionProgress.value = withSpring(1);
      } else {
          // Ensure seek works if fully expanded
          usePlayerStore.getState().seekTo(timestamp);
      }
  }, [fullLyricExpanded, fullExpansionProgress]);
  
  if (!currentSong || isNowPlaying) return null;
  
  return (
    <View style={[
      styles.container, 
      isIsland ? styles.islandContainer : styles.barContainer,
      isIsland && expanded && { alignItems: 'center', marginHorizontal: 12, marginRight: 12 } // Expanded: Force Center & Symmetry. Override container margins.
    ]}>
      {/* ... (Progress Bar for Classic Mode Only) ... */}
      {!isIsland && (
        <View style={styles.progressBarContainer}>
          <Pressable 
            style={styles.progressBarTouchable}
            onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
            onPress={handleSeekPress}
            hitSlop={{ top: 15, bottom: 15 }}
          >
            <View style={styles.progressBarTrack}>
               <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </Pressable>
        </View>
      )}
      
      <AnimatedPressable 
        onPress={isIsland ? toggleExpand : openNowPlaying} 
        style={[
          styles.content, 
          isIsland && styles.islandContent,
          isIsland && animatedIslandStyle, // Apply Reanimated style
          // Remove static conditional styles that conflict
          // isIsland && { maxWidth: expanded ? width - 20 : width * 0.5 },
          // isIsland && expanded && styles.islandExpanded,
        ]}
      >
        {isIsland && (
           <View style={[StyleSheet.absoluteFill, { borderRadius: expanded ? 40 : 30, overflow: 'hidden' }]}>
              {/* 1. Blurred Background Image */}
               {!libraryFocusMode && currentSong.coverImageUri ? (
                  <Image 
                    source={{ uri: currentSong.coverImageUri }} 
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover" // Ensure colors spread to edges
                    blurRadius={22} // Reduced slightly for clearer center
                  />
               ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
               )}

              {/* 2. Vignette / Dark Overlay to make text pop */}
              <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']}
                start={{x: 0, y: 0}}
                end={{x: 0, y: 1}}
                style={StyleSheet.absoluteFill}
              />
              
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
           </View>
        )}
        
        {/* Expanded View Content */}
        {/* Expanded View Content */}
        {isIsland && expanded ? (
            <View style={{ flex: 1, width: '100%', paddingHorizontal: 10, paddingVertical: 10 }}>
                {/* Top Row: Vinyl + Info + Controls */}
                <GestureDetector gesture={panGesture}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15, paddingBottom: 5, backgroundColor: 'transparent' }}>
                        {/* Rotating Vinyl */}
                        <Animated.View style={[animatedVinylStyle, { marginRight: 12 }]}>
                            <Pressable onPress={openNowPlaying}>
                                 <VinylRecord imageUri={currentSong.coverImageUri} size={64} />
                            </Pressable>
                        </Animated.View>

                        {/* Info */}
                        <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={[styles.title, { fontSize: 16, marginBottom: 2 }]} numberOfLines={1}>
                                {currentSong.title}
                            </Text>
                            <Text style={styles.artist} numberOfLines={1}>
                                {currentSong.artist}
                            </Text>
                        </View>

                        {/* Controls Grouped */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                             <Pressable onPress={skipBackward} hitSlop={10}>
                                 <Ionicons name="play-skip-back" size={24} color="#fff" />
                             </Pressable>
                             <Pressable onPress={togglePlay} hitSlop={20}>
                                 <Animated.View style={animatedButtonStyle}>
                                     <Ionicons name={optimisticPlaying ? 'pause' : 'play'} size={32} color="#fff" />
                                 </Animated.View>
                             </Pressable>
                             <Pressable onPress={skipForward} hitSlop={10}>
                                 <Ionicons name="play-forward" size={24} color="#fff" />
                             </Pressable>
                        </View>

                        
                        {/* Drag Handle Overlay for Stage 1/2 */}
                        {(!fullLyricExpanded) && (
                            <View style={{
                                position: 'absolute',
                                bottom: -10,
                                left: '50%',
                                marginLeft: -20,
                                width: 40,
                                height: 4,
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                borderRadius: 2
                            }} />
                        )}
                    </View>
                </GestureDetector>
                
                {/* Unified Lyrics Block with GestureDetector */}
                <GestureDetector gesture={panGesture}>
                    <Pressable 
                        onPress={(e) => {
                            e.stopPropagation();
                            // If in Half Mode (and not Full), tap to expand
                            if ((lyricExpanded || fullLyricExpanded) && !fullLyricExpanded) {
                                runOnJS(setFullLyricExpanded)(true);
                                fullExpansionProgress.value = withSpring(1);
                            }
                        }}
                        style={{ 
                            flex: 1, 
                            width: '100%',
                            justifyContent: 'center', 
                            alignItems: 'center',
                            minHeight: 40,
                            paddingHorizontal: 8,
                            marginTop: (lyricExpanded || fullLyricExpanded) ? 10 : 0
                        }}
                    >
                        <View style={{ flex: 1, width: '100%' }}>
                        {(!lyricExpanded && !fullLyricExpanded) ? (
                            /* 1. TRAY MODE (Collapsed) - Single Line */
                            <View style={{ width: '100%' }}>
                                <Text 
                                    style={{ 
                                        color: '#fff', 
                                        fontSize: 18, 
                                        fontWeight: '700', 
                                        textAlign: 'center',
                                        textShadowColor: 'rgba(0,0,0,0.5)',
                                        textShadowOffset: { width: 0, height: 1 },
                                        textShadowRadius: 2
                                    }}
                                    numberOfLines={2}
                                >
                                    {!!currentLyricText ? currentLyricText : ''}
                                </Text>
                            </View>
                        ) : (
                            /* 2. EXPANDED MODE (Half & Full) - Unified FlatList */
                            <View style={{ flex: 1, width: '100%', paddingBottom: 20 }}>
                                <SynchronizedLyrics 
                                    lyrics={lyricsToUse || []}
                                    currentTime={currentTime}
                                    onLyricPress={handleLyricPress}
                                    isUserScrolling={false} // Dynamic Island usually auto-scrolls.
                                    // If user drags, SynchronizedLyrics handles it via internal refs if we didn't pass external ref logic.
                                    // But here we want to allow scrolling ONLY if fullLyricExpanded.
                                    scrollEnabled={fullLyricExpanded}
                                    textStyle={{ 
                                        color: '#fff', 
                                        fontSize: 23, 
                                        fontWeight: '800', 
                                        textAlign: 'center',
                                        textShadowColor: 'rgba(0,0,0,0.5)',
                                        textShadowOffset: { width: 0, height: 1 },
                                        textShadowRadius: 2
                                    }}
                                    activeLinePosition={0.35} // Slightly above mid area as requested
                                    songTitle={currentSong?.title}
                                    highlightColor={mainColor}
                                    topSpacerHeight={120} // Reduced for miniplayer (was ~350+)
                                    bottomSpacerHeight={120}
                                />
                            </View>
                        )}
                        </View>

                        {/* Smooth Time Scrubber - Bottom of Island */}
                        {isIsland && expanded && (
                             <View style={{ width: '100%', paddingHorizontal: 24, paddingBottom: 12 }}>
                                <IslandScrubber 
                                    currentTime={currentTime}
                                    duration={duration > 0 ? duration : 1}
                                    onSeek={(time) => {
                                        if(player) {
                                            // Lock updates
                                            isSeekingRef.current = true;
                                            setCurrentTime(time); // Optimistic

                                            player.seekTo(time);
                                            
                                            // Unlock after delay
                                            if (seekLockTimeout.current) clearTimeout(seekLockTimeout.current);
                                            seekLockTimeout.current = setTimeout(() => {
                                                isSeekingRef.current = false;
                                            }, 1000);
                                        }
                                    }}
                                    onScrubStart={() => {
                                        // Optional: Pause updates or visuals
                                        isUserScrolling.current = true; // Hijack scroll flag to pause lyrics?
                                    }}
                                    onScrubEnd={() => {
                                        isUserScrolling.current = false;
                                    }}
                                />
                             </View>
                        )}
                    </Pressable>
                </GestureDetector>
            </View>
        ) : (
            // COLLAPSED / CLASSIC VIEW
            <>
                {/* Cover Art (Rotating or Static?) - User asked for rotating in expanded. Collapsed usually static or small. */}
                {currentSong.coverImageUri ? (
                  <Animated.Image 
                    source={{ uri: currentSong.coverImageUri }} 
                    style={[styles.coverThumbnail, isIsland && styles.islandCover]}
                  />
                ) : (
                  <View style={[styles.placeholderThumbnail, isIsland && styles.islandCover]}>
                    <Ionicons name="musical-notes" size={20} color="#666" />
                  </View>
                )}
                
                {/* Song Info */}
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={1}>
                    {currentSong.title}
                  </Text>
                  <Text style={[styles.artist, isIsland && { display: 'none' }]} numberOfLines={1}>
                    {currentSong.artist || 'Unknown Artist'}
                  </Text>
                </View>
                
                {/* Controls */}
                {isIsland ? (
                   <View style={[styles.islandControls, { zIndex: 10 }]}>
                       <Pressable onPress={togglePlay} hitSlop={20}>
                         <Animated.View style={animatedButtonStyle}>
                             <Ionicons 
                               name={optimisticPlaying ? 'pause' : 'play'} 
                               size={24} 
                               color="#fff" 
                             />
                         </Animated.View>
                       </Pressable>
                   </View>
                ) : (
                  /* Bar Mode Controls */
                  <>
                    <Text style={styles.time}>
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </Text>
                    <Pressable onPress={skipBackward} style={styles.controlButton}>
                      <Ionicons name="play-back" size={20} color="#fff" />
                    </Pressable>
                    <Pressable onPress={togglePlay} style={styles.playButton} hitSlop={20}>
                      <Animated.View style={animatedButtonStyle}>
                         <Ionicons name={optimisticPlaying ? 'pause' : 'play'} size={24} color="#fff" />
                      </Animated.View>
                    </Pressable>
                    <Pressable onPress={skipForward} style={styles.controlButton}>
                      <Ionicons name="play-forward" size={20} color="#fff" />
                    </Pressable>
                  </>
                )}
            </>
        )}
      </AnimatedPressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
  barContainer: {
    bottom: 0, 
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  islandContainer: {
    top: Platform.OS === 'ios' ? 58 : 40, 
    marginLeft: 12,
    marginRight: 8,
    alignItems: 'flex-end', // Right-aligned
  },
  islandContent: {
    backgroundColor: 'transparent', 
    borderRadius: 30,
    height: 50, 
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: "#000", // Deep black shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 12,
  },
  islandExpanded: {
    height: 190, 
    marginTop: 10,
    paddingVertical: 0,
    borderRadius: 40,
    maxWidth: width - 24, // Expand to almost full width
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  progressBarTouchable: {
    height: 20,
    marginTop: -10,
    justifyContent: 'center',
  },
  progressBarTrack: {
    height: 3,
    backgroundColor: '#333',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  coverThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
  },
  islandCover: {
    width: 34,
    height: 34,
    borderRadius: 17, // Circle in collapsed
    marginRight: 10,
  },
  placeholderThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
    marginRight: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  artist: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  time: {
    fontSize: 11,
    color: '#666',
    marginRight: 8,
  },
  controlButton: {
    padding: 8,
  },
  playButton: {
    padding: 8,
    marginHorizontal: 4,
  },
  islandControls: {
    flexDirection: 'row',
    alignItems: 'center',
  }
});

export default MiniPlayer;
