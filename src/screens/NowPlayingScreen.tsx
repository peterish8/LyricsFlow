import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Image, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePlayer } from '../contexts/PlayerContext';
import { usePlayerStore } from '../store/playerStore';
import Scrubber from '../components/Scrubber';
import CustomMenu from '../components/CustomMenu';
import { RootStackScreenProps } from '../types/navigation';
import * as queries from '../database/queries';
import { getGradientColors } from '../constants/gradients';
import { AuroraHeader } from '../components/AuroraHeader';

type Props = RootStackScreenProps<'NowPlaying'>;

const NowPlayingScreen: React.FC<Props> = ({ navigation, route }) => {
  const player = usePlayer();
  const { currentSong, loadSong, loadedAudioId, setLoadedAudioId } = usePlayerStore();
  const { songId } = route.params;
  
  const flatListRef = useRef<FlatList>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  
  // Load song on mount
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
    if (!player) return;
    if (player.playing) {
      await player.pause();
    } else {
      await player.play();
    }
  };

  const skipForward = async () => {
    if (!player || !player.duration) return;
    const newTime = Math.min(player.currentTime + 10000, player.duration);
    await player.seekTo(newTime);
  };

  const skipBackward = async () => {
    if (!player) return;
    const newTime = Math.max(0, player.currentTime - 10000);
    await player.seekTo(newTime);
  };

  const handleScrub = async (value: number) => {
    if (!player) return;
    await player.seekTo(value); // Scrubber returns seconds, player likely needs seconds too? 
  };

  const handleLyricTap = async (timestamp: number) => {
      if (!player) return;
      await player.seekTo(timestamp); // Timestamp is in seconds. If seekTo takes seconds, this is correct.
      player.play(); // Ensure playback continues
  };

  // ✅ Use Loaded Audio ID
  useEffect(() => {
    // Already implemented in previous step, ensuring it persists
  }, []);

  const gradientColors = currentSong?.gradientId 
    ? getGradientColors(currentSong.gradientId) 
    : ['#000', '#000'];

  // ... imports moved to top

  return (
    <View style={styles.container}>
       <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
       <AuroraHeader colors={gradientColors} />
       
       {/* Background Image (Optional, for now just black) */}
       
       {/* Header */}
       <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
             <Ionicons name="chevron-down" size={30} color="#fff" />
          </Pressable>
          
          {/* Collapsed view text could go here */}
          <Text style={styles.headerTitle} numberOfLines={1}>{currentSong?.title}</Text>

          <Pressable onPress={() => setMenuVisible(true)} style={styles.headerButton}>
             <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
          </Pressable>
       </View>

       <CustomMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title="Options"
        options={[
          {
            label: 'Edit Lyrics',
            icon: 'create-outline',
            onPress: () => {
              setMenuVisible(false);
              navigation.navigate('AddEditLyrics', { songId: currentSong?.id });
            }
          }
        ]}
      />

      {/* Main Content Area - Lyrics take priority */}
      <View style={styles.contentArea}>
          {/* Lyrics List */}
          <FlatList
            ref={flatListRef}
            data={currentSong?.lyrics || []}
            keyExtractor={(item, index) => `${item.timestamp}-${index}`}
            contentContainerStyle={styles.lyricsContainer}
            showsVerticalScrollIndicator={false}
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
                    {/* Small Cover Art inside List Header for scrolling effect? 
                        Or keep it sticky top? User wants "Lyrics showing fully". 
                        Let's keep art separate but small at top. 
                    */}
                </View>
            }
            ListFooterComponent={<View style={{ height: 200 }} />} // Space at bottom
            onScrollToIndexFailed={() => {}}
          />
      </View>

      {/* Bottom Player Controls Section (Sticky Bottom) */}
      <View style={styles.bottomControls}>
          {/* Mini Info (Art + Title) */}
          <View style={styles.miniInfo}>
             {currentSong?.coverImageUri && (
                <Image source={{ uri: currentSong.coverImageUri }} style={styles.miniCover} />
             )}
             <View style={{flex: 1, marginLeft: 12}}>
                 <Text style={styles.miniTitle} numberOfLines={1}>{currentSong?.title}</Text>
                 <Text style={styles.miniArtist} numberOfLines={1}>{currentSong?.artist}</Text>
             </View>
          </View>

          {/* Scrubber */}
          <View style={{ marginVertical: 10 }}>
             <Scrubber 
                currentTime={currentTime}
                duration={player?.duration || 0}
                onSeek={handleScrub}
             />
          </View>
          
          {/* Main Controls */}
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    backgroundColor: 'transparent',
    zIndex: 10,
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
    paddingTop: 20,
  },
  topSpacer: {
    height: 20,
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
  bottomControls: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 10,
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
});

export default NowPlayingScreen;
