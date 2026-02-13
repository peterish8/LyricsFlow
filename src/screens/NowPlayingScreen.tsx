import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image, Alert, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, useAnimatedReaction, withRepeat, Easing } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore } from '../store/playerStore';
import Scrubber from '../components/Scrubber';
import CustomMenu from '../components/CustomMenu';
import { RootStackScreenProps } from '../types/navigation';
import * as queries from '../database/queries';
import { getGradientColors } from '../constants/gradients';
import { AuroraHeader } from '../components/AuroraHeader';
import { CoverArtSearchScreen } from './CoverArtSearchScreen'; // Import the new screen (as a component/modal)
import { Toast } from '../components/Toast';
import { useSettingsStore } from '../store/settingsStore';
import VinylRecord from '../components/VinylRecord';

const { width } = Dimensions.get('window');

type Props = RootStackScreenProps<'NowPlaying'>;

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const player = usePlayer();
  const { currentSong, loadSong, loadedAudioId, setLoadedAudioId, showTransliteration, toggleShowTransliteration, updateCurrentSong } = usePlayerStore();
  const { autoHideControls, setAutoHideControls, animateBackground, setAnimateBackground } = useSettingsStore();
  const { songId } = route.params;
  
  const flatListRef = useRef<FlatList>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
  const [showCoverSearch, setShowCoverSearch] = useState(false); // State for Cover Search Modal
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' } | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showLyrics, setShowLyrics] = useState(true); // Issue  5: Lyrics toggle state
  
  // Issue 6: Vinyl rotation
  const vinylRotation = useSharedValue(0);
  
  // Issue 1: Swipe-Down Gesture to Reveal Controls
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // If swiping down significantly (>50) and controls are hidden, show them
      if (e.translationY > 50 && controlsOpacity.value < 0.5) {
        runOnJS(resetHideTimer)();
      }
    });
  
  // Animation for Auto-Hide
  const controlsOpacity = useSharedValue(1);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetHideTimer = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    controlsOpacity.value = withTiming(1, { duration: 200 });
    // Ensure controls are interactive immediately when showing
    setControlsVisible(true);
    
    if (autoHideControls && player?.playing) {
      hideTimerRef.current = setTimeout(() => {
        controlsOpacity.value = withTiming(0, { duration: 500 }); // Fade out
      }, 3500);
    }
  };

  // Monitor opacity to disable interactions when hidden
  useAnimatedReaction(
    () => controlsOpacity.value,
    (opacity) => {
      if (opacity < 0.1 && controlsVisible) {
        runOnJS(setControlsVisible)(false);
      } else if (opacity > 0.1 && !controlsVisible) {
        runOnJS(setControlsVisible)(true);
      }
    },
    [controlsVisible]
  );

  useEffect(() => {
     resetHideTimer();
     return () => {
         if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
     };
  }, [player?.playing, autoHideControls]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const handleMenuPress = (event: any) => {
    const { nativeEvent } = event;
    const anchor = { x: nativeEvent.pageX, y: nativeEvent.pageY };
    setMenuAnchor(anchor);
    setMenuVisible(true);
  };

  const bgRotation = useSharedValue(0);
  const bgScale = useSharedValue(1.2); 

  useEffect(() => {
    if (animateBackground) {
        // Slowing down significantly: 20s -> 60s
        bgRotation.value = withRepeat(withTiming(10, { duration: 60000, easing: Easing.inOut(Easing.ease) }), -1, true); 
        // 15s -> 45s for scale breathing
        bgScale.value = withRepeat(withTiming(1.5, { duration: 45000, easing: Easing.inOut(Easing.ease) }), -1, true); 
    } else {
        bgRotation.value = withTiming(0);
        bgScale.value = withTiming(1.2);
    }
  }, [animateBackground]);

  const bgAnimatedStyle = useAnimatedStyle(() => ({
       transform: [{ scale: bgScale.value }, { rotate: `${bgRotation.value}deg` }]
  }));
  
  // Issue 6: Vinyl rotation animation (spins when playing, stops when paused)
  useEffect(() => {
    if (player?.playing) {
      vinylRotation.value = withRepeat(
        withTiming(360, { duration: 8000, easing: Easing.linear }),
        -1, // infinite
        false // no reverse
      );
    } else {
      // Pause rotation at current position
      // We grab the current value and set it to stop animation
      const currentRotation = vinylRotation.value % 360;
      vinylRotation.value = currentRotation; 
    }
  }, [player?.playing]);
  
  const vinylAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${vinylRotation.value}deg` }]
  }));
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        // Always load metadata first
        await loadSong(songId); 
        const song = await queries.getSongById(songId);
        
        if (!song?.audioUri) {
          Alert.alert('No Audio', 'This song has no audio file attached');
          setIsLoading(false);
          return;
        }

        // ✅ Check if the PLAYER already has this audio loaded
        // We also check if player.duration > 0 to ensure it's not a stale/empty player instance
        if (loadedAudioId === songId && player?.duration && player.duration > 0) {
           console.log('[NowPlaying] Audio already loaded & valid for', songId);
           setIsLoading(false);
           // Ensure it plays if we tapped it (Auto-resume)
           if (!player.playing) {
             player.play();
           }
           return;
        }
        
        // ✅ Load new audio
        await player?.replace(song.audioUri);
        setLoadedAudioId(songId); // Mark as loaded
        player?.play();
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load song:', error);
        Alert.alert('Error', 'Could not load audio file.');
        setIsLoading(false);
      }
    };
    load();
  }, [songId]);

  // ✅ Sync Time & Playback State
  useEffect(() => {
    if (!player) return;

    // Initial sync
    setCurrentTime(player.currentTime);

    const interval = setInterval(() => {
      if (player) {
        setCurrentTime(player.currentTime);
      }
    }, 200); 

    return () => clearInterval(interval);
  }, [player]);

  // ✅ Auto-Scroll to Active Lyric
  useEffect(() => {
    if (!currentSong?.lyrics || currentSong.lyrics.length === 0) return;

    // Find active index
    const index = currentSong.lyrics.findIndex((line, i) => {
      const nextLine = currentSong.lyrics[i + 1];
      return currentTime >= line.timestamp && (!nextLine || currentTime < nextLine.timestamp);
    });

    if (index !== -1 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.3, // Position in upper third for better reading
      });
    }
  }, [currentTime, currentSong]);

  // ✅ Playback Controls
  const togglePlay = async () => {
    resetHideTimer();
    if (!player) return;
    if (player.playing) {
      await player.pause();
    } else {
      await player.play();
    }
  };

  const skipForward = async () => {
    resetHideTimer();
    if (!player || !player.duration) return;
    const newTime = Math.min(player.currentTime + 10000, player.duration);
    await player.seekTo(newTime);
  };

  const skipBackward = async () => {
    resetHideTimer();
    if (!player) return;
    const newTime = Math.max(0, player.currentTime - 10000);
    await player.seekTo(newTime);
  };

  const handleScrub = async (value: number) => {
    resetHideTimer();
    if (!player) return;
    await player.seekTo(value); // Scrubber returns seconds, player likely needs seconds too? 
  };

  const handleLyricTap = async (timestamp: number) => {
      resetHideTimer();
      if (!player) return;
      await player.seekTo(timestamp); // Timestamp is in seconds. If seekTo takes seconds, this is correct.
      player.play(); // Ensure playback continues
  };

  // ✅ Use Loaded Audio ID
  useEffect(() => {
    // Already implemented in previous step, ensuring it persists
  }, []);

  // Dynamic Theme Logic
  // Dynamic Theme Logic
  const isDynamicTheme = currentSong?.gradientId === 'dynamic';
  
  // If dynamic but NO cover art, fallback to a default gradient (e.g. Aurora)
  const effectiveGradientId = (isDynamicTheme && !currentSong?.coverImageUri) 
      ? 'aurora' 
      : (currentSong?.gradientId || 'aurora');

  const gradientColors = !isDynamicTheme || !currentSong?.coverImageUri
    ? getGradientColors(effectiveGradientId) 
    : ['#000', '#000'];

  // ... imports moved to top

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
         {/* Background: Dynamic Blur or Black */}
         <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
       
       {isDynamicTheme && currentSong?.coverImageUri ? (
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
            {/* Animated.View wrapper - Animated.Image with blurRadius doesn't animate on Android */}
            <Animated.View style={[{ position: 'absolute', top: '-25%', left: '-25%', width: '150%', height: '150%' }, bgAnimatedStyle]}>
               <Image 
                 source={{ uri: currentSong.coverImageUri }} 
                 style={{ width: '100%', height: '100%', opacity: 0.6 }} 
                 blurRadius={100} 
                 resizeMode="cover"
               />
               <Image 
                 source={{ uri: currentSong.coverImageUri }} 
                 style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.3 }} 
                 blurRadius={50} 
                 resizeMode="cover"
               />
            </Animated.View>
            <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)', '#000']}
                locations={[0.2, 0.7, 1.0]}
                style={StyleSheet.absoluteFill}
            />
          </View>
       ) : (
          <AuroraHeader colors={gradientColors} animated={animateBackground} />
       )}
       
       {/* Ensure AuroraHeader is NOT shown if dynamic to avoid clashing, or maybe show it with low opacity? 
           User wants "Dynamic Theme", usually means the blur IS the theme. 
           So we replace AuroraHeader with the blur. 
       */}
       


      {/* Header with Blur for "Opaque" look that matches theme */}
      <Animated.View style={[styles.headerContainer, animatedStyle]} pointerEvents={controlsVisible ? 'auto' : 'none'}>
        <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
          <SafeAreaView edges={['top']} style={styles.headerContent}>
             <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
               <Ionicons name="chevron-down" size={28} color="#fff" />
             </Pressable>
             
             <View style={{ alignItems: 'center', flex: 1 }}>
               <Text style={styles.headerTitle} numberOfLines={1}>NOW PLAYING</Text>
               <Text style={styles.headerSubtitle} numberOfLines={1}>{currentSong?.title}</Text>
             </View>
             
             <View style={styles.headerRight}>
               <CustomMenu 
                 visible={menuVisible}
                 onClose={() => setMenuVisible(false)}
                 anchorPosition={menuAnchor}
                 options={[
                   {
                     label: 'Edit Lyrics',
                     icon: 'create-outline',
                     onPress: () => {
                       setMenuVisible(false);
                       navigation.navigate('AddEditLyrics', { songId: currentSong?.id });
                     }
                   },
                   {
                     label: 'Sync Lyrics',
                     icon: 'timer-outline',
                     onPress: () => {
                        setMenuVisible(false);
                        // Is this just edit mode? Or Sync mode? 
                        // The user has a sync mode in AddEditLyrics.
                        navigation.navigate('AddEditLyrics', { songId: currentSong?.id });
                     }
                   },
                   {
                      label: autoHideControls ? 'Disable Auto-Hide' : 'Enable Auto-Hide',
                      icon: autoHideControls ? 'eye-outline' : 'eye-off-outline',
                      onPress: () => {
                          setMenuVisible(false);
                          setAutoHideControls(!autoHideControls);
                          setToast({ visible: true, message: `Auto-Hide ${!autoHideControls ? 'Enabled' : 'Disabled'}`, type: 'success' });
                      }
                   },
                   {
                      label: animateBackground ? 'Disable Animation' : 'Enable Animation',
                      icon: animateBackground ? 'contrast-outline' : 'contrast',
                      onPress: () => {
                          setMenuVisible(false);
                          setAnimateBackground(!animateBackground);
                          setToast({ visible: true, message: `Animation ${!animateBackground ? 'Enabled' : 'Disabled'}`, type: 'success' });
                      }
                   }
                 ]}
               />
               <Pressable onPress={handleMenuPress} style={styles.headerButton}>
                 <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
               </Pressable>
             </View>
          </SafeAreaView>
        </BlurView>
      </Animated.View>

       <CoverArtSearchScreen 
          visible={showCoverSearch}
          initialQuery={`${currentSong?.title} ${currentSong?.artist}`}
          onClose={() => setShowCoverSearch(false)}
          onSelect={async (uri) => {
              setShowCoverSearch(false);
              if (currentSong) {
                  // Update Store
                  const updatedSong = { ...currentSong, coverImageUri: uri };
                  
                  // Optimistic update
                  updateCurrentSong({ coverImageUri: uri }); 
                  
                  try {
                       // Corrected: Pass the full updated song object
                       await queries.updateSong(updatedSong);
                       setTimeout(() => {
                           setToast({ visible: true, message: 'Cover Updated', type: 'success' });
                       }, 1000); // Increased delay to ensure smooth transition
                  } catch (e) {
                      console.error('[NowPlaying] Failed to save cover:', e);
                      // Revert optimistic update if needed, but user just sees error
                      setToast({ visible: true, message: 'Failed to save cover', type: 'error' });
                  }
              }
          }}
       />

      {/* Main Content Area - Lyrics take priority */}
      <View style={styles.contentArea}>
          {showLyrics ? (
            // Lyrics List
            <FlatList
            ref={flatListRef}
            data={(showTransliteration && currentSong?.transliteratedLyrics) ? currentSong.transliteratedLyrics : (currentSong?.lyrics || [])}
            keyExtractor={(item, index) => `${item.timestamp}-${index}`}
            contentContainerStyle={styles.lyricsContainer}
            showsVerticalScrollIndicator={false}
            // Issue 1: Removed scroll triggers so auto-scroll doesn't wake controls
            scrollEventThrottle={16} 
            renderItem={({ item, index }) => {
              // Calculate active state and distance
              const isActive = currentTime >= item.timestamp && 
                              (!currentSong?.lyrics[index + 1] || 
                               currentTime < currentSong.lyrics[index + 1].timestamp);

              // Find the index of the currently active line (inefficient to do meaningful search in renderItem, 
              // but list is small. Better optimization: pass activeIndex as extraData).
              // For now, let's use the layout we know:
              // We need the *actual* active index to calculate distance.
              // Let's compute it once in the parent scope or use a simpler heuristics.
              
              // Actually, we can use the `activeLyricIndex` state if we add it. 
              // But let's look at `index` vs `currentSong.lyrics.findIndex(...)`.
              // We already calculate `index` in the useEffect for auto-scroll. 
              // Let's store that in a state `activeLyricIndex`.
              
              // Wait, I can't easily add state here without re-writing the component.
              // Let's do a quick find inside here (safe for < 100 items).
              const activeIndex = currentSong?.lyrics.findIndex((line, i) => {
                  const nextLine = currentSong?.lyrics[i + 1];
                  return currentTime >= line.timestamp && (!nextLine || currentTime < nextLine.timestamp);
              }) ?? -1;

              const distance = Math.abs(index - activeIndex);
              
              // Define opacity based on distance
              // Active: 1.0 (Brightest)
              // Others: 0.5 (Translucent but visible)
              // This ensures context is always visible while keeping focus on the active line.
              let opacity = 1.0;
              if (activeIndex !== -1) {
                  if (distance === 0) opacity = 1.0;
                  else if (distance <= 1) opacity = 0.8; // Smooth transition
                  else opacity = 0.5; // Minimum visibility for all other lines
              }

              // Hide completely if opacity is 0 to avoid taps/layout shifts if needed?
              // No, keep layout but hide text
              if (opacity === 0) {
                 // Optimization: Don't render text if invisible, but keep height for scroll consistency?
                 // Or just opacity 0 is fine.
              }

              return (
                <Pressable 
                  onPress={() => handleLyricTap(item.timestamp)}
                  style={[
                      styles.lyricLine, 
                      isActive && styles.activeLyricLine,
                      { opacity } // Dynamic Opacity
                  ]}
                  disabled={isLoading}
                >
                  <View style={[
                      styles.lyricTextContainer, 
                      !item.text.trim() && styles.instrumentalContainer 
                  ]}>
                     {!item.text.trim() ? (
                        <View style={styles.instrumentalContent}>
                           <Ionicons name="musical-notes" size={24} color={isActive ? "#FFD700" : "rgba(255,255,255,0.6)"} />
                           <Text style={[styles.instrumentalText, isActive && styles.activeInstrumentalText]}>
                              • Instrumental •
                           </Text>
                        </View>
                     ) : (
                        <Text style={[
                          styles.lyricText,
                          isActive && styles.activeLyric
                        ]}>
                          {item.text}
                        </Text>
                     )}
                  </View>
                </Pressable>
              );
            }}
            ListHeaderComponent={
                <View style={styles.topSpacer}>
                    {/* Main Cover Art Header - Interactive */}
                    <Pressable 
                        onLongPress={() => setShowCoverSearch(true)}
                        style={({ pressed }) => [
                            styles.mainCoverContainer,
                            pressed && { opacity: 0.8 }
                        ]}
                    >
                        {currentSong?.coverImageUri ? (
                            <Image source={{ uri: currentSong.coverImageUri }} style={styles.mainCover} />
                        ) : (
                             <View style={[styles.mainCover, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                                 <Ionicons name="musical-note" size={60} color="#666" />
                             </View>
                        )}
                    </Pressable>
                </View>
            }
            ListFooterComponent={<View style={{ height: 200 }} />} // Space at bottom
            onScrollToIndexFailed={() => {}}
          />
          ) : (
            // Issue 6: Vinyl Record Display (when lyrics are hidden)
            <View style={styles.vinylContainer}>
              <Animated.View style={vinylAnimatedStyle}>
                <VinylRecord 
                  imageUri={currentSong?.coverImageUri} 
                  size={width * 0.75} 
                />
              </Animated.View>
            </View>
          )}
      </View>

      {/* Issue 4: Dynamic Island Bottom Controls */}
      <Animated.View style={[styles.bottomControlsContainer, animatedStyle]} pointerEvents={controlsVisible ? 'auto' : 'none'}>
          {/* 3-Layer Background Stack (Dynamic Island Style) */}
          <View style={styles.bottomControlsPill}>
            {/* Layer 1: Blurred Cover Art */}
            {currentSong?.coverImageUri &&  (
              <Image 
                source={{ uri: currentSong.coverImageUri }} 
                style={StyleSheet.absoluteFill}
                blurRadius={40}
              />
            )}
            
            {/* Layer 2: Vignette Gradient */}
            <LinearGradient
              colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']}
              start={{x: 0, y: 0}}
              end={{x: 0, y: 1}}
              style={StyleSheet.absoluteFill}
            />
            
            {/* Layer 3: Dark Overlay */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
            
          {/* Content */}
            <View style={styles.bottomControlsContent}>
              {/* Mini Info (Art + Title) */}
              <View style={styles.miniInfo}>
                 <Pressable onLongPress={() => setShowCoverSearch(true)}>
                     {currentSong?.coverImageUri ? (
                        <Image source={{ uri: currentSong.coverImageUri }} style={styles.miniCover} />
                     ) : (
                        <View style={[styles.miniCover, { backgroundColor: '#333' }]} />
                     )}
                 </Pressable>
                 <View style={{flex: 1, marginLeft: 12}}>
                     <Text style={styles.miniTitle} numberOfLines={1}>{currentSong?.title}</Text>
                     <Text style={styles.miniArtist} numberOfLines={1}>{currentSong?.artist}</Text>
                 </View>

                 {/* Issue 5: Eye Icon Toggle - Moved here */}
                 <Pressable onPress={() => setShowLyrics(!showLyrics)} style={{ padding: 8 }}>
                   <Ionicons name={showLyrics ? 'eye-outline' : 'eye-off-outline'} size={24} color="rgba(255,255,255,0.7)" />
                 </Pressable>
              </View>
    
              {/* Scrubber */}
              <View style={{ marginVertical: 10 }}>
                 <Scrubber 
                    currentTime={currentTime}
                    duration={player?.duration || 0}
                    onSeek={handleScrub}
                 />
              </View>
              
              {/* Main Controls - Centered */}
              <View style={styles.controls}>
                 <Pressable onPress={skipBackward} style={styles.controlBtn}>
                   <Ionicons name="play-back" size={30} color="#fff" />
                 </Pressable>
                 
                 <Pressable onPress={togglePlay} style={styles.playBtnLarge}>
                   <Ionicons 
                     name={player?.playing ? 'pause' : 'play'} 
                     size={40} 
                     color="#000"
                   />
                 </Pressable>
                 
                 <Pressable onPress={skipForward} style={styles.controlBtn}>
                   <Ionicons name="play-forward" size={30} color="#fff" />
                 </Pressable>
              </View>
            </View>
          </View>
      </Animated.View>
    </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden', // Ensure blur respects bounds
    // No background color, BlurView handles it
  },
  blurContainer: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.3)', // Added semi-transparent dark background for "More Solid" look
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: Platform.OS === 'android' ? 20 : 0, 
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  headerRight: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 8
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    maxWidth: '60%',
    textAlign: 'center',
  },
  headerButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  contentArea: {
    flex: 1, // Takes up remaining space above controls
  },
  lyricsContainer: {
    paddingHorizontal: 24,
    paddingTop: 100, // Adjusted for Header
    paddingBottom: 250, // Adjusted for Bottom Controls
  },
  topSpacer: {
    height: 300, // Allocate space for cover art
    justifyContent: 'center', // Center vertically within the spacer if needed
    alignItems: 'center',
    marginBottom: 20,
  },
  mainCoverContainer: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  mainCover: {
    width: 250,
    height: 250,
    borderRadius: 12,
  },
  lyricLine: {
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,
  },
  activeLyricLine: {
     // Optional background highlight
  },
  lyricText: {
    fontSize: 24, // Large text as requested
    color: '#ffffff', // White base, opacity controls dimming
    fontWeight: '700',
    lineHeight: 34,
  },
  activeLyric: {
    color: '#fff',
    fontSize: 28, // Pop out
    textShadowColor: 'rgba(255, 255, 255, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },


  miniInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  miniCover: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  miniTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  miniArtist: {
    fontSize: 14,
    color: '#888',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Changed for center alignment
    paddingHorizontal: 20,
    marginTop: 10,
    gap: 40, // Space out controls
  },
  controlBtn: {
     padding: 10,
  },
  playBtnLarge: {
     width: 70,
     height: 70,
     borderRadius: 35,
     backgroundColor: '#fff',
     justifyContent: 'center',
     alignItems: 'center',
  },
  instrumentalContainer: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instrumentalContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.8,
  },
  instrumentalText: {
    fontSize: 18,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  activeInstrumentalText: {
    color: '#FFD700', // Gold for active
    opacity: 1,
    textShadowColor: 'rgba(255, 215, 0, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  lyricTextContainer: {
    minHeight: 40,
    justifyContent: 'center',
  },
  // Issue 4: Dynamic Island-style bottom controls
  bottomControlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 15,
  },
  bottomControlsPill: {
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 40,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomControlsContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  // Issue 6: Vinyl container
  vinylContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 240, // Shift center point upwards to avoid overlap with bottom controls
  },
});

export default NowPlayingScreen;
