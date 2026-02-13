import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Image, Dimensions, Platform, LayoutAnimation, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  withSequence,
  Easing, 
  cancelAnimation
} from 'react-native-reanimated';

import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { getGradientColors } from '../constants/gradients';
import Scrubber from './Scrubber';
import VinylRecord from './VinylRecord';
import { getCurrentLineIndex } from '../utils/timestampParser';

const { width } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MiniPlayer: React.FC = () => {
  const player = usePlayer();
  const { currentSong } = usePlayerStore();
  const { miniPlayerStyle } = useSettingsStore();
  const navigation = useNavigation();
  
  const [expanded, setExpanded] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  
  // Animation value for rotation
  const rotation = useSharedValue(0);
  
  const isIsland = miniPlayerStyle === 'island';
  
  const gradientColors = currentSong?.gradientId 
    ? getGradientColors(currentSong.gradientId) 
    : ['#222', '#111'];
    
  // Create a "vignette" theme for island: Black -> Color -> Black
  const mainColor = gradientColors[1] || gradientColors[0];

  // Update time & Rotation Logic
  useEffect(() => {
    const interval = setInterval(() => {
      if (player) {
        setCurrentTime(player.currentTime);
        setDuration(player.duration);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [player]);

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
  const currentLyricIndex = currentSong?.lyrics 
    ? getCurrentLineIndex(currentSong.lyrics, currentTime) 
    : -1;
  const currentLyricText = (currentLyricIndex !== -1 && currentSong?.lyrics?.[currentLyricIndex]) 
    ? currentSong.lyrics[currentLyricIndex].text 
    : '';

  const togglePlay = (e?: any) => {
    e?.stopPropagation();
    if (!player) return;
    player.playing ? player.pause() : player.play();
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

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const openNowPlaying = () => {
    if (currentSong) {
      (navigation as any).navigate('NowPlaying', { songId: currentSong.id });
      setExpanded(false); // Collapse on navigate
    }
  };
  
  if (!currentSong) return null;
  
  return (
    <View style={[
      styles.container, 
      isIsland ? styles.islandContainer : styles.barContainer,
      isIsland && { marginHorizontal: expanded ? 10 : 40 } // Dynamic Width
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
      
      <Pressable 
        onPress={isIsland ? toggleExpand : openNowPlaying} 
        style={({ pressed }) => [
          styles.content, 
          isIsland && styles.islandContent,
          isIsland && expanded && styles.islandExpanded,
          pressed && { opacity: 0.95 }
        ]}
      >
        {isIsland && (
           <View style={[StyleSheet.absoluteFill, { borderRadius: expanded ? 40 : 30, overflow: 'hidden' }]}>
              {/* 1. Blurred Background Image */}
               {currentSong.coverImageUri ? (
                  <Image 
                    source={{ uri: currentSong.coverImageUri }} 
                    style={StyleSheet.absoluteFill}
                    blurRadius={40} // Heavy blur
                  />
               ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#222' }]} />
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
        {isIsland && expanded ? (
            <View style={{ flex: 1, width: '100%', paddingHorizontal: 10, paddingVertical: 10 }}>
                {/* Top Row: Vinyl + Info + Controls */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
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
                         <Pressable onPress={togglePlay} hitSlop={10}>
                             <Ionicons name={player?.playing ? 'pause' : 'play'} size={32} color="#fff" />
                         </Pressable>
                         <Pressable onPress={skipForward} hitSlop={10}>
                             <Ionicons name="play-skip-forward" size={24} color="#fff" />
                         </Pressable>
                    </View>
                </View>
                
                {/* Bottom Row: Lyrics */}
                <View style={{ 
                    flex: 1, 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    minHeight: 40,
                    paddingHorizontal: 8 
                }}>
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
                        {currentLyricText || ''}
                    </Text>
                </View>
                
                {/* Tiny progress bar at very bottom (optional, but good for visual anchoring if user wants "timings" implicit) -> User said remove timelines. Keeping meaningful silence here. */}
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
                      <Pressable onPress={togglePlay} hitSlop={10}>
                        <Ionicons 
                          name={player?.playing ? 'pause' : 'play'} 
                          size={24} 
                          color="#fff" 
                        />
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
                    <Pressable onPress={togglePlay} style={styles.playButton}>
                      <Ionicons name={player?.playing ? 'pause' : 'play'} size={24} color="#fff" />
                    </Pressable>
                    <Pressable onPress={skipForward} style={styles.controlButton}>
                      <Ionicons name="play-forward" size={20} color="#fff" />
                    </Pressable>
                  </>
                )}
            </>
        )}
      </Pressable>
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
    top: Platform.OS === 'ios' ? 48 : 30, 
    marginHorizontal: 12,
    alignItems: 'center',
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  islandExpanded: {
    height: 180, // Increased height for lyrics
    marginTop: 10,
    paddingVertical: 0, // Padding handled in inner view
    borderRadius: 40,
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
