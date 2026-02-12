/**
 * LyricFlow - Mini Player Component
 * Bottom bar showing current playing song
 */

import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Pressable, Image, Animated, PanResponder, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { getGradientById, GRADIENTS } from '../constants/gradients';
import { Colors } from '../constants/colors';
import { Scrubber } from './Scrubber';

export const MiniPlayer: React.FC = () => {
  // const navigation = useNavigation();
  const { currentSong } = useSongsStore();
  const { isPlaying, togglePlay, lyrics, tick } = usePlayerStore();
  // const duration = usePlayerStore(state => state.duration); // Removed to prevent re-renders
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExpandedContent, setShowExpandedContent] = useState(false);
  const compactOpacity = useRef(new Animated.Value(1)).current;
  const expandedOpacity = useRef(new Animated.Value(0)).current;
  const collapseTranslateY = useRef(new Animated.Value(0)).current;
  const containerWidthAnim = useRef(new Animated.Value(180)).current;
  const containerHeightAnim = useRef(new Animated.Value(48)).current;
  const [titleWidth, setTitleWidth] = useState(0);
  // Fixed container width for scrolling text (180 - padding/icons ~ 120)
  const containerWidth = 120;
  const titleScrollAnim = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const vinylSpinValue = useRef(new Animated.Value(0)).current;
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const panResponderRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return showExpandedContent && Math.abs(gestureState.dy) > 5;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gestureState) => {
        if (showExpandedContent) {
          const clampedDy = Math.max(0, gestureState.dy);
          collapseTranslateY.setValue(clampedDy);
          expandedOpacity.setValue(Math.max(0, 1 - clampedDy / 150));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (showExpandedContent && gestureState.dy > 100) {
          // 1. Fade out expanded content
          Animated.timing(expandedOpacity, {
            toValue: 0,
            duration: 100,
            useNativeDriver: true,
          }).start(() => {
            // 2. Hide content & Reset state
            setIsExpanded(false);
            setShowExpandedContent(false);
            
            // Reset translateY immediately
            collapseTranslateY.setValue(0);
            
            // 3. Shrink Container
            Animated.timing(containerWidthAnim, {
              toValue: 180,
              duration: 400,
              easing: Easing.out(Easing.back(0.8)),
              useNativeDriver: false,
            }).start();
            
            Animated.timing(containerHeightAnim, {
              toValue: 48,
              duration: 400,
              easing: Easing.out(Easing.back(0.8)),
              useNativeDriver: false,
            }).start();
            
            // 4. Fade in compact
            Animated.timing(compactOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }).start();
          });
        } else if (showExpandedContent) {
          Animated.spring(collapseTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          
          Animated.spring(expandedOpacity, {
            toValue: 1,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Spinning animation for no song state
  useEffect(() => {
    if (!currentSong) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [currentSong]);



  // Animation loop for lyrics without audio
  useEffect(() => {
    const hasTimestamps = lyrics.some(l => l.timestamp > 0);
    
    if (!isPlaying || !hasTimestamps || currentSong?.audioUri) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameTimeRef.current = null;
      return;
    }

    const animate = (frameTime: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = frameTime;
      }

      const dt = Math.max(0, (frameTime - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = frameTime;

      tick(dt);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, lyrics, currentSong?.audioUri]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const vinylSpin = vinylSpinValue.interpolate({
    inputRange: [0, 10000], // Increased range for continuous rotation
    outputRange: ['0deg', '3600000deg'], // 10,000 rotations
  });

  const compactVinylSpin = vinylSpinValue.interpolate({
    inputRange: [0, 10000],
    outputRange: ['0deg', '3600000deg'],
  });

  // Reset rotation on song change
  useEffect(() => {
    vinylSpinValue.setValue(0);
  }, [currentSong?.id]);

  // Handle play/pause rotation without resetting
  useEffect(() => {
    if (isPlaying) {
      Animated.timing(vinylSpinValue, {
        toValue: 10000, // Very large value
        duration: 60000000, // ~16 hours (constant speed)
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    } else {
      vinylSpinValue.stopAnimation();
      // Do NOT reset to 0 here to allow resuming
    }
  }, [isPlaying]);

  // Title scrolling animation
  useEffect(() => {
    const shouldScroll = isPlaying && titleWidth > 0 && containerWidth > 0 && titleWidth > containerWidth;
    
    if (shouldScroll) {
      titleScrollAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.delay(1000),
          Animated.timing(titleScrollAnim, {
            toValue: -(titleWidth - containerWidth + 20),
            duration: (titleWidth - containerWidth + 20) * 30,
            useNativeDriver: true,
          }),
          Animated.delay(1000),
          Animated.timing(titleScrollAnim, {
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
  }, [isPlaying, titleWidth, currentSong?.title]);

  // Show spinning vinyl when no song
  if (!currentSong) {
    return (
      <Animated.View style={[styles.emptyContainer, { transform: [{ rotate: spin }] }]}>
        <Ionicons name="disc" size={28} color="rgba(255,255,255,0.4)" />
      </Animated.View>
    );
  }

  // const gradient = getGradientById(currentSong.gradientId) || GRADIENTS[0];
  
  
  const hasTimestamps = lyrics.some(l => l.timestamp > 0);
  
  // currentLyric moved to ConnectedLyricText

  const handleLongPress = () => {
    const targetHeight = hasTimestamps ? 240 : 140;
    setIsExpanded(true);
    // Don't render heavy content immediately - let animation start first
    // This prevents the "frame skip" or "instant jump" glitch
    setTimeout(() => {
      setShowExpandedContent(true);
      
      // Fade in expanded view after it mounts
      Animated.timing(expandedOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, 100); // Increased delay to 100ms for safer render

    // Smooth apple-style bounce using standard back easing
    // This is mathematically smoother than custom bezier
    Animated.timing(containerWidthAnim, {
      toValue: 380,
      duration: 400,
      easing: Easing.out(Easing.back(0.8)),
      useNativeDriver: false, // Layout props must be false
    }).start();
    
    Animated.timing(containerHeightAnim, {
      toValue: targetHeight,
      duration: 400,
      easing: Easing.out(Easing.back(0.8)),
      useNativeDriver: false,
    }).start();
    
    // Quick fade out compact view
    Animated.timing(compactOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handleCollapse = () => {
    // 1. Fade out expanded content FIRST
    Animated.timing(expandedOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      // 2. Hide content & Reset state (prevents layout thrashing)
      setShowExpandedContent(false);
      setIsExpanded(false);
      
      // Reset translateY
      collapseTranslateY.setValue(0);
      
      // 3. Shrink Container
      Animated.timing(containerWidthAnim, {
        toValue: 180,
        duration: 400,
        easing: Easing.out(Easing.back(0.8)),
        useNativeDriver: false,
      }).start();
      
      Animated.timing(containerHeightAnim, {
        toValue: 48,
        duration: 400,
        easing: Easing.out(Easing.back(0.8)),
        useNativeDriver: false,
      }).start();

      // 4. Fade in compact
      Animated.timing(compactOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleSeek = (time: number) => {
    const player = usePlayerStore.getState();
    player.seek(time);
  };

  const handlePress = () => {
    if (showExpandedContent) {
      // Currently expanded, collapse it
      handleCollapse();
    } else if (isExpanded && !showExpandedContent) {
      // In transition or stuck state, reset and expand
      setIsExpanded(false);
      setShowExpandedContent(false);
      setTimeout(() => handleLongPress(), 50);
    } else {
      // Fully collapsed, expand it
      handleLongPress();
    }
  };

  // const expandedHeight = hasTimestamps ? 240 : 140;

  // Determine lyric font size based on length
  // Moved to ConnectedLyricText

  return (
    <View 
      style={[
        styles.container,
      ]}
    >
      <Animated.View
        style={{
          width: containerWidthAnim,
          height: containerHeightAnim,
        }}
      >
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateY: collapseTranslateY }, { rotate: '0deg' }]
        }}
        {...panResponderRef.panHandlers}
      >
      <Pressable 
        style={styles.pressable} 
        onPress={handlePress}
      >
      {currentSong.coverImageUri ? (
        <>
          <Image 
            source={{ uri: currentSong.coverImageUri }} 
            style={StyleSheet.absoluteFill} 
            blurRadius={20}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.8)', 'transparent', 'rgba(0,0,0,0.8)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : null}
        <Animated.View style={[styles.compactContent, { opacity: compactOpacity }]}>
          <View style={styles.vinylContainer}>
            <Animated.View style={[styles.thumbnail, { transform: [{ rotate: compactVinylSpin }] }]}>
              {currentSong.coverImageUri ? (
                <Image source={{ uri: currentSong.coverImageUri }} style={styles.image} />
              ) : (
                <View style={styles.defaultThumbnail}>
                  <Ionicons name="disc" size={18} color="rgba(255,255,255,0.3)" />
                </View>
              )}
            </Animated.View>
            <Pressable style={styles.compactPlayButton} onPress={togglePlay}>
              <Ionicons 
                name={isPlaying ? 'pause' : 'play'} 
                size={16} 
                color="#fff" 
              />
            </Pressable>
          </View>
          
          <View style={styles.info}>
            <View style={{ overflow: 'hidden', flex: 1, width: '100%' }}>
              <Animated.Text
                style={[
                  styles.title,
                  { transform: [{ translateX: titleScrollAnim }] }
                ]}
                numberOfLines={1}
                onTextLayout={(e) => {
                  // Only update if significantly different to prevent micro-fluctuation loops
                  if (e.nativeEvent.lines[0]) {
                    const width = e.nativeEvent.lines[0].width;
                    if (Math.abs(width - titleWidth) > 1) {
                      setTitleWidth(width);
                    }
                  }
                }}
              >
                {currentSong.title}
              </Animated.Text>
            </View>
            <Text style={styles.artist} numberOfLines={1}>
              {currentSong.artist || 'Unknown Artist'}
            </Text>
          </View>
        </Animated.View>

        {showExpandedContent && (
          <Animated.View style={[styles.expandedContent, { opacity: expandedOpacity }]}>
            <View style={styles.expandedHeader}>
              <Animated.View style={[styles.expandedThumbnail, { transform: [{ rotate: vinylSpin }] }]}>
                {currentSong.coverImageUri ? (
                  <Image source={{ uri: currentSong.coverImageUri }} style={styles.image} />
                ) : (
                  <View style={styles.defaultThumbnail}>
                    <Ionicons name="disc" size={32} color="rgba(255,255,255,0.3)" />
                  </View>
                )}
              </Animated.View>
              <View style={styles.expandedInfo}>
                <Text style={styles.expandedTitle} numberOfLines={1}>
                  {currentSong.title}
                </Text>
                <Text style={styles.expandedArtist} numberOfLines={1}>
                  {currentSong.artist || 'Unknown Artist'}
                </Text>
              </View>
              <Pressable style={styles.expandedPlayButton} onPress={togglePlay}>
                <Ionicons 
                  name={isPlaying ? 'pause' : 'play'} 
                  size={24} 
                  color="#fff" 
                />
              </Pressable>
            </View>
            {isExpanded && hasTimestamps && (
              <ConnectedLyricText />
            )}
            <View style={styles.scrubberContainer}>
              <ConnectedMiniScrubber onSeek={handleSeek} />
            </View>
          </Animated.View>
        )}
      </Pressable>
      </Animated.View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 32,
    left: 16,
    backgroundColor: '#000',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  pressable: {
    flex: 1,
  },
  compactContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4, // Reduced horizontal padding
    paddingVertical: 3,   // 48 - 42 = 6 / 2 = 3px padding
    gap: 8,
  },
  thumbnail: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: '#2C2C2E',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  defaultThumbnail: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  vinylContainer: {
    position: 'relative',
    width: 42,
    height: 42,
  },
  compactPlayButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 21,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 16,
  },
  artist: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
    lineHeight: 13,
  },
  playButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  expandedContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    justifyContent: 'flex-start',
    gap: 8,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expandedThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#2C2C2E',
  },
  expandedInfo: {
    flex: 1,
  },
  expandedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  expandedArtist: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  expandedPlayButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  lyricContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    minHeight: 66,
    justifyContent: 'center',
  },
  currentLyric: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 22,
  },
  scrubberContainer: {
    marginTop: 8,
  },
  emptyContainer: {
    position: 'absolute',
    top: 32,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
});

const ConnectedMiniScrubber = React.memo(({ onSeek }: { onSeek: (time: number) => void }) => {
  const currentTime = usePlayerStore(state => state.currentTime);
  const duration = usePlayerStore(state => state.duration);
  
  return (
    <Scrubber
      currentTime={currentTime}
      duration={duration > 0 ? duration : 1}
      onSeek={onSeek}
    />
  );
});

const ConnectedLyricText = React.memo(() => {
  const currentTime = usePlayerStore(state => state.currentTime);
  const lyrics = usePlayerStore(state => state.lyrics);
  
  const currentLyric = lyrics.length > 0
    ? lyrics.find((l, i) => {
        const nextLyric = lyrics[i + 1];
        return l.timestamp <= currentTime && (!nextLyric || currentTime < nextLyric.timestamp);
      }) || lyrics[0]
    : null;

  if (!currentLyric) return null;

  const getLyricFontSize = () => {
    const len = currentLyric.text.length;
    if (len < 40) return 17;
    if (len < 80) return 15;
    return 14;
  };

  return (
    <View style={styles.lyricContainer}>
      <Text style={[styles.currentLyric, { fontSize: getLyricFontSize() }]} numberOfLines={3}>
        {currentLyric.text}
      </Text>
    </View>
  );
});

export default MiniPlayer;
// Fixed syntax errors
