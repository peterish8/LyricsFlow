import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Alert, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, useAnimatedReaction, withRepeat, Easing } from 'react-native-reanimated';
import { Gesture, GestureDetector, FlatList } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore } from '../store/playerStore';
import { useSongsStore } from '../store/songsStore';
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
import InstrumentalWaveform from '../components/InstrumentalWaveform';

const { width } = Dimensions.get('window');

type Props = RootStackScreenProps<'NowPlaying'>;

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const player = usePlayer();
  const { currentSong, loadSong, loadedAudioId, setLoadedAudioId, showTransliteration, toggleShowTransliteration, updateCurrentSong, setMiniPlayerHidden } = usePlayerStore();
  const toggleLike = useSongsStore(state => state.toggleLike);
  const { autoHideControls, setAutoHideControls, animateBackground, setAnimateBackground } = useSettingsStore();
  const { songId } = route.params;
  
  const flatListRef = useRef<FlatList>(null);
  const contentHeightRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number, y: number } | undefined>(undefined);
  const [showCoverSearch, setShowCoverSearch] = useState(false); // State for Cover Search Modal
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' } | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showLyrics, setShowLyrics] = useState(true); // Issue  5: Lyrics toggle state
  
  // Visibility Management: Hide MiniPlayer when NowPlaying is open
  useEffect(() => {
    setMiniPlayerHidden(true);
    return () => setMiniPlayerHidden(false);
  }, [setMiniPlayerHidden]);
  
  // Issue 6: Vinyl rotation
  const vinylRotation = useSharedValue(0);
  
  // Issue 1: Swipe-Down Gesture to Reveal Controls
  // Using simultaneousWithExternalGesture() allows this to work even when scrolling the FlatList
  const panGesture = Gesture.Pan()
    .activeOffsetY(20) // Activate if moved down 20px (swipe down)
    .failOffsetY(-20)  // Fail if moved up 20px (scrolling down lyrics)
    .simultaneousWithExternalGesture()
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

  // Issue: Intro Instrumental
  // If the first lyric starts after > 3 seconds, insert a dummy "Instrumental" line at 0:00
  const processedLyrics = React.useMemo(() => {
     const rawLyrics = (showTransliteration && currentSong?.transliteratedLyrics) 
        ? currentSong.transliteratedLyrics 
        : (currentSong?.lyrics || []);
     
     if (rawLyrics.length > 0) {
         // RUNTIME FALLBACK: Check for "collapsed" timestamps (all 0 or stuck)
         // If the last line has timestamp 0, it means we failed to parse timestamps originally.
         const lastTimestamp = rawLyrics[rawLyrics.length - 1].timestamp;
         const isCollapsed = lastTimestamp === 0 && rawLyrics.length > 1;

         if (isCollapsed) {
             const duration = (player?.duration && player.duration > 0) 
                ? player.duration 
                : (currentSong?.duration || 180);
             
             console.log(`[NowPlaying] ⚠️ Detected collapsed lyrics. Auto-generating timestamps for ${duration}s`);
             
             // Auto-distribute
             const newLyrics = rawLyrics.map((line, index) => ({
                 ...line,
                 timestamp: (index / rawLyrics.length) * duration
             }));
             return newLyrics;
         }

         const firstTimestamp = rawLyrics[0].timestamp;
         // If start is delayed by > 2s, pretend 0-first is instrumental
         if (firstTimestamp > 2) {
             return [{ timestamp: 0, text: '' }, ...rawLyrics];
         }
     }
     return rawLyrics;
  }, [currentSong?.lyrics, currentSong?.transliteratedLyrics, showTransliteration, player?.duration, currentSong?.duration]);

  // ✅ Determine if lyrics are "Linear" (Plain/Teleprompter)
  const isLinear = React.useMemo(() => {
     if (!processedLyrics || processedLyrics.length <= 10) return false;
     
     // Check gaps across multiple lines to avoid false positives (e.g. rhythmic intro)
     const firstGap = processedLyrics[1].timestamp - processedLyrics[0].timestamp;
     let isConstant = true;
     
     // Check first 8 gaps
     for (let i = 1; i < 9; i++) {
         const gap = processedLyrics[i+1].timestamp - processedLyrics[i].timestamp;
         if (Math.abs(gap - firstGap) > 0.05) { // Allow tiny variance
             isConstant = false;
             break;
         }
     }
     
     return isConstant;
  }, [processedLyrics]);

  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);
  const isUserScrolling = useRef(false); // ✅ Track user interaction
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null); // ✅ Track timeout to clear it

  // ✅ Auto-Scroll & Sync Logic
  useEffect(() => {
    if (!processedLyrics || processedLyrics.length === 0) return;

    // Standard Time-Based Index Calculation
    const index = processedLyrics.findIndex((line, i) => {
      const nextLine = processedLyrics[i + 1];
      return currentTime >= line.timestamp && (!nextLine || currentTime < nextLine.timestamp);
    });

    if (!isLinear) {
        // For Synced Lyrics, Time determines Highlight
        if (index !== activeLyricIndex) {
            setActiveLyricIndex(index);
        }
    }

    // SCROLL LOGIC
    // ✅ Skip auto-scroll if user is interacting
    if (isLinear && flatListRef.current && contentHeightRef.current > 0 && !isUserScrolling.current) {
        // SMOOTH SCROLL (Teleprompter Mode)
        // Calculate offset based on song progress %
        const duration = (player?.duration && player.duration > 0) 
            ? player.duration
            : (currentSong?.duration || 180);
            
        // Precise Layout Calculation
        const HEADER_HEIGHT = 420; // 300 (Spacer) + 20 (Margin) + 100 (PaddingTop)
        const FOOTER_HEIGHT = 450; // 250 (PaddingBottom) + 200 (ListFooter)
        const totalContentHeight = contentHeightRef.current;
        const textHeight = Math.max(0, totalContentHeight - HEADER_HEIGHT - FOOTER_HEIGHT);
        
        // Calculate Y position of the "Active Point" within the full content
        // We assume plain lyrics are distributed evenly across the text height
        const progress = Math.min(1, Math.max(0, currentTime / duration));
        const activeY = HEADER_HEIGHT + (textHeight * progress);
        
        // Calculate Target Scroll Offset to center activeY on screen
        const screenHeight = Dimensions.get('window').height;
        const targetOffset = activeY - (screenHeight * 0.4); // Position at 40% down from top
        
        flatListRef.current.scrollToOffset({
             offset: Math.max(0, targetOffset),
             animated: true // smooth interpolation
        });
        // Note: We do NOT set activeLyricIndex here. 
        // We let the onScroll event handle the highlighting based on visual position.
        return;
    }

    // STANDARD SYNCED SCROLL (Jump to line)
    if (!isLinear && index !== -1 && flatListRef.current && !isUserScrolling.current) {
      // Only scroll if significantly changed or user isn't scrolling?
      // Standard jump
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.3, // Position in upper third for better reading
      });
    }
  }, [currentTime, currentSong, processedLyrics, isLinear, activeLyricIndex]);

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

  // ✅ Scroll Handler for Linear Lyrics (Decouples Highlight from Time)
  const handleScroll = (event: any) => {
      if (!isLinear || !processedLyrics || processedLyrics.length === 0) return;

      const offsetY = event.nativeEvent.contentOffset.y;
      const screenHeight = Dimensions.get('window').height;
      const HEADER_HEIGHT = 420;
      
      // Calculate which line is currently "Centered" (at 40% height)
      const centerPoint = offsetY + (screenHeight * 0.4);
      
      // Map centerPoint back to an index
      // We know: centerPoint = HEADER + (index / total) * textHeight
      // So: index = (centerPoint - HEADER) / textHeight * total
      
      const totalContentHeight = contentHeightRef.current;
      const FOOTER_HEIGHT = 450;
      const textHeight = Math.max(1, totalContentHeight - HEADER_HEIGHT - FOOTER_HEIGHT);
      
      let progress = (centerPoint - HEADER_HEIGHT) / textHeight;
      progress = Math.max(0, Math.min(1, progress));
      
      const newIndex = Math.floor(progress * processedLyrics.length);
      
      if (newIndex !== activeLyricIndex) {
          setActiveLyricIndex(newIndex);
      }
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
                      label: showLyrics ? 'Hide Lyrics' : 'Show Lyrics',
                      icon: showLyrics ? 'eye-off-outline' : 'eye-outline',
                      onPress: () => {
                        setMenuVisible(false);
                        setShowLyrics(!showLyrics);
                        setToast({ visible: true, message: `Lyrics ${!showLyrics ? 'Shown' : 'Hidden'}`, type: 'success' });
                      }
                    },
                    {
                      label: 'Go to Current Lyric',
                      icon: 'locate-outline',
                      onPress: () => {
                        setMenuVisible(false);
                        if (flatListRef.current && activeLyricIndex !== -1 && !isLinear) {
                          // Scroll to active lyric for synced lyrics
                          flatListRef.current.scrollToIndex({
                            index: activeLyricIndex,
                            animated: true,
                            viewPosition: 0.3,
                          });
                          setToast({ visible: true, message: 'Jumped to current lyric', type: 'success' });
                        } else if (isLinear) {
                          setToast({ visible: true, message: 'Auto-scroll active for teleprompter', type: 'success' });
                        } else {
                          setToast({ visible: true, message: 'No active lyric', type: 'success' });
                        }
                      }
                    },
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
             data={processedLyrics}
             keyExtractor={(item, index) => `${item.timestamp}-${index}`}
             contentContainerStyle={styles.lyricsContainer}
             showsVerticalScrollIndicator={false}
             // Issue 1: Removed scroll triggers so auto-scroll doesn't wake controls
             scrollEventThrottle={16} 
             onScroll={handleScroll}
             // ✅ Handle Manual Scroll Interaction (Pause Auto-Scroll)
             // Enabled for BOTH Linear and Synced to prevent fighting
             onScrollBeginDrag={() => { 
                isUserScrolling.current = true;
                if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
             }}
             onScrollEndDrag={() => { 
                // Only start timer if NO momentum is expected
                scrollTimeoutRef.current = setTimeout(() => { 
                    isUserScrolling.current = false; 
                }, 4000); 
             }}
             onMomentumScrollBegin={() => { 
                isUserScrolling.current = true; 
                if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
             }}
             onMomentumScrollEnd={() => { 
                scrollTimeoutRef.current = setTimeout(() => { 
                    isUserScrolling.current = false; 
                }, 4000); 
             }}
             renderItem={({ item, index }) => {
               const activeIndex = activeLyricIndex;
               const distance = Math.abs(index - activeIndex);
               const isGlowing = distance === 0;
               let opacity = 1.0;

               // --- SPLIT LOGIC STATES ---
               if (isLinear) {
                  // [LINEAR STATE] - Teleprompter Mode
                  // Focus purely on the center line
                  if (activeIndex !== -1) {
                      if (distance === 0) opacity = 1.0;
                      else opacity = 0.5; 
                  }
               } else {
                  // [SYNCED STATE] - Karaoke Mode
                  // Focus on active line, but maybe keep it distinct?
                  // User requested "only currently active... highlighted" (active=1.0, others=0.5)
                  if (activeIndex !== -1) {
                      if (distance === 0) opacity = 1.0;
                      else opacity = 0.5; // Single line focus
                  }
               }

               // Hide completely if opacity is 0 
               if (opacity === 0) {
                   // Optimization
               }
     
               return (
                 <Pressable 
                   onPress={() => !isLinear && handleLyricTap(item.timestamp)}
                   style={[
                       styles.lyricLine, 
                       isGlowing && styles.activeLyricLine,
                       { opacity } // Dynamic Opacity
                      ]}
                      disabled={isLoading || isLinear}
                    >
                      <View style={[
                          styles.lyricTextContainer, 
                          !item.text.trim() && styles.instrumentalContainer 
                      ]}>
                         {!item.text.trim() ? (
                            <View style={styles.instrumentalContent}>
                               <InstrumentalWaveform active={isGlowing} />
                            </View>
                         ) : (
                            <Text style={[
                              styles.lyricText,
                              isGlowing && styles.activeLyric
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
            onContentSizeChange={(w, h) => {
                contentHeightRef.current = h;
            }}
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
          {/* 3-Layer Background Stack (Dynamic Island Style) - Replaced with Real BlurView */}
          <View style={[styles.bottomControlsPill, { backgroundColor: '#181818' }]}>

             
             {/* Dynamic Island Body - Blurred Album Art Color */}
             {currentSong?.coverImageUri && (
                <Image 
                  source={{ uri: currentSong.coverImageUri }} 
                  style={[StyleSheet.absoluteFill, { opacity: 0.5 }]} 
                  blurRadius={50}
                />
             )}

             {/* Dark Gradient Overlay for readability & depth */}
             <LinearGradient
              colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
              style={StyleSheet.absoluteFill}
             />
            
          {/* Content */}
             {/* Content */}
             <View style={styles.bottomControlsContent}>
               
               {/* 0. Top Right Menu (Three Dots) - Absolute Positioned */}
               <View style={{ position: 'absolute', top: 15, right: 20, zIndex: 10 }}>
                  <Pressable onPress={() => setShowLyrics(!showLyrics)} style={{ padding: 4 }}>
                    <Ionicons name="ellipsis-horizontal" size={24} color="rgba(255,255,255,0.6)" />
                  </Pressable>
               </View>

               {/* 1. Main Controls - Top */}
               <View style={styles.controls}>
                  <Pressable onPress={skipBackward} style={styles.controlBtn}>
                    <Ionicons name="play-back" size={24} color="#fff" /> 
                  </Pressable>
                  
                  <Pressable onPress={togglePlay} style={styles.playBtnLarge}>
                    <Ionicons 
                      name={player?.playing ? 'pause' : 'play'} 
                      size={40} 
                      color="#000"
                    />
                  </Pressable>
                  
                  <Pressable onPress={skipForward} style={styles.controlBtn}>
                    <Ionicons name="play-forward" size={24} color="#fff" /> 
                  </Pressable>
               </View>

               {/* 2. Scrubber - Middle */}
               <View style={{ marginVertical: 8 }}> 
                  <Scrubber 
                     currentTime={currentTime}
                     duration={player?.duration || 0}
                     onSeek={handleScrub}
                  />
               </View>

               {/* 3. Mini Info (Title + Artist) - Bottom & Centered (No Cover) */}
                <View style={[styles.miniInfo, { paddingHorizontal: 40 }]}>
                   <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative' }}>
                       <View style={{ flex: 1, alignItems: 'center' }}>
                           <Text style={styles.miniTitle} numberOfLines={1}>{currentSong?.title}</Text>
                           <Text style={styles.miniArtist} numberOfLines={1}>{currentSong?.artist}</Text>
                       </View>
                       
                       <Pressable 
                         onPress={() => currentSong && toggleLike(currentSong.id)}
                         style={({ pressed }) => [
                           { position: 'absolute', right: -25 },
                           pressed && { transform: [{ scale: 1.4 }] }
                         ]}
                         hitSlop={15}
                       >
                         <View style={[
                           styles.heartGlow,
                           {
                             shadowColor: (isDynamicTheme && currentSong?.coverImageUri) 
                               ? '#FFD700' // Vibrant Dynamic Fallback (Gold)
                               : getGradientColors(currentSong?.gradientId || 'aurora')[1],
                             shadowOpacity: currentSong?.isLiked ? 1 : 0.4,
                             shadowRadius: currentSong?.isLiked ? 20 : 5,
                             elevation: currentSong?.isLiked ? 12 : 2,
                             backgroundColor: currentSong?.isLiked 
                               ? (isDynamicTheme && currentSong?.coverImageUri ? 'rgba(255, 215, 0, 0.2)' : `${getGradientColors(currentSong?.gradientId || 'aurora')[1]}33`)
                               : 'transparent',
                             borderRadius: 22,
                             padding: 6,
                           }
                         ]}>
                           <Ionicons 
                             name={currentSong?.isLiked ? "heart" : "heart-outline"} 
                             size={30} 
                             color={currentSong?.isLiked 
                               ? ((isDynamicTheme && currentSong?.coverImageUri) ? '#FFD700' : getGradientColors(currentSong?.gradientId || 'aurora')[1])
                               : "rgba(255,255,255,0.7)"} 
                           />
                         </View>
                       </Pressable>
                   </View>
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
    textShadowColor: 'rgba(255, 255, 255, 0.9)', // Stronger glow
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20, // Wider glow
  },


  miniInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6, // Lift text up a bit
    marginTop: 5,    
  },
  miniCover: {
    width: 40, // Smaller cover
    height: 40,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  miniTitle: {
    fontSize: 16, // Smaller text
    fontWeight: '700',
    color: '#fff',
  },
  miniArtist: {
    fontSize: 12, // Smaller text
    color: '#888',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', 
    paddingHorizontal: 20,
    marginTop: 5,   // Reduced top margin
    gap: 25,        // Tighter gap
  },
  heartGlow: {
    padding: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  controlBtn: {
     padding: 8,    // Smaller padding
  },
  playBtnLarge: {
     width: 65,     // Slightly smaller but still prominent
     height: 65,
     borderRadius: 35,
     backgroundColor: '#fff',
     justifyContent: 'center',
     alignItems: 'center',
  },
  instrumentalContainer: {
    paddingVertical: 10,
    alignItems: 'flex-start', 
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
    color: '#FFD700', 
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
    marginHorizontal: 0, 
    marginBottom: 0,     
    borderTopLeftRadius: 25, // Slightly sharper
    borderTopRightRadius: 25,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0, 
  },
  bottomControlsContent: {
    paddingHorizontal: 20,
    paddingVertical: 15, // Reduced vertical padding
  },
  // Issue 6: Vinyl container
  vinylContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 200, // Adjusted for smaller controls
  },
});

export default NowPlayingScreen;
