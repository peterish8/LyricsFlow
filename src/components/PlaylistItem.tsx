import React, { memo } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, interpolate, Easing, cancelAnimation } from 'react-native-reanimated';
import { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { Song } from '../types/song';
import { usePlayerStore } from '../store/playerStore';
import { Colors } from '../constants/colors';

interface PlaylistItemProps extends RenderItemParams<Song> {
  currentSongId: string | null;
  isEditMode: boolean;
  onPress: (song: Song, index: number) => void;
  onDelete: (songId: string) => void;
  isPlaying: boolean;
}

// ... imports

const LiveVisualizer = ({ isPlaying }: { isPlaying: boolean }) => {
    // Simple 3-bar animation (Organic Mode)
    const animations = [useSharedValue(0.3), useSharedValue(0.4), useSharedValue(0.3)];
    
    React.useEffect(() => {
        if (!isPlaying) {
            // STOP/RESET animation
            animations.forEach(anim => {
                cancelAnimation(anim);
                anim.value = withTiming(0.3, { duration: 300 }); // Return to idle height
            });
            return;
        }

        animations.forEach((anim, i) => {
            // Offset start times slightly for organic feel
            const delay = i * 50;
            
            setTimeout(() => {
                anim.value = withRepeat(
                    withSequence(
                        // Fast, punchy movements for "beat" simulation
                        withTiming(Math.random(), { duration: 150, easing: Easing.linear }),
                        withTiming(Math.random(), { duration: 100, easing: Easing.quad }),
                        withTiming(Math.random(), { duration: 250, easing: Easing.inOut(Easing.quad) }),
                        withTiming(Math.random(), { duration: 120, easing: Easing.linear })
                    ),
                    -1, // Infinite
                    true // Reverses
                );
            }, delay);
        });
        
        return () => {
             animations.forEach(anim => cancelAnimation(anim));
        };
    }, [isPlaying]);

    return (
        <View style={styles.visualizerContainer}>
            {animations.map((anim, i) => (
                <Animated.View 
                    key={i}
                    style={[
                        styles.visualizerBar, 
                        useAnimatedStyle(() => ({
                            height: interpolate(anim.value, [0, 1], [4, 14]), 
                            opacity: interpolate(anim.value, [0, 1], [0.5, 1])
                        }))
                    ]} 
                />
            ))}
        </View>
    );
};

const ActiveSongProgress = () => {
  // ... existing ActiveSongProgress code ...
  const position = usePlayerStore(state => state.position);
  const duration = usePlayerStore(state => state.duration);

  const format = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
      <Text style={styles.songDurationActive}>
          {format(position)} / {format(duration)}
      </Text>
  );
};

const PlaylistItemComponent: React.FC<PlaylistItemProps> = ({ 
  item, 
  drag, 
  isActive, 
  getIndex, 
  currentSongId, 
  isEditMode, 
  onPress,
  onDelete,
  isPlaying 
}) => {
  const index = getIndex() || 0;
  const isActiveSong = currentSongId === item.id;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <ScaleDecorator>
      <Pressable
        onLongPress={isEditMode ? drag : undefined}
        onPress={() => onPress(item, index)}
        disabled={isActive}
        style={[
          styles.songRow,
          isActiveSong && !isEditMode && styles.songRowActive, // Grey Highlight
          isActive && styles.songRowDragging
        ]}
      >
        {/* Left Side: Number or Drag Handle */}
        <View style={styles.leftAction}>
           {isEditMode ? (
             <Pressable onPressIn={drag} hitSlop={20}>
               <Ionicons name="reorder-two" size={24} color="#666" />
             </Pressable>
           ) : (
             // Just the number, normal color
             // User: "make normal itself"
              <Text style={styles.songNumber}>
                {index + 1}
              </Text>
           )}
        </View>





        {/* Album Art (Small) */}
        <View style={styles.smallCoverContainer}>
          {item.coverImageUri ? (
            <Image source={{ uri: item.coverImageUri }} style={styles.smallCover} />
          ) : (
            <View style={[styles.smallCover, styles.placeholderCover]}>
              <Ionicons name="musical-note" size={20} color="#666" />
            </View>
          )}

          {/* Live Visualizer (White & Animated) */}
          {isActiveSong && !isEditMode && (
              <View style={styles.visualizerOverlay}>
                  <LiveVisualizer isPlaying={isPlaying} />
              </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.songInfo}>
          <Text 
            style={[styles.songTitle, isActiveSong && !isEditMode && styles.songTitleActive]} 
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.songArtist} numberOfLines={1}>
            {item.artist || 'Unknown Artist'}
          </Text>
        </View>

        {/* Right Side: Duration or Delete */}
        {isEditMode ? (
          <Pressable onPress={() => onDelete(item.id)} hitSlop={10}>
            <Ionicons name="remove-circle" size={24} color="#ff4444" />
          </Pressable>
        ) : (
           // "Make normal itself" - always show static duration
           <Text style={styles.songDuration}>{formatDuration(item.duration || 0)}</Text>
        )}

        {/* Three dots for song context (Normal Mode) */}
        {!isEditMode && (
           <Pressable style={styles.moreButton} hitSlop={10}>
              <Ionicons name="ellipsis-vertical" size={20} color="rgba(255,255,255,0.6)" />
           </Pressable>
        )}

      </Pressable>
    </ScaleDecorator>
  );
};

const styles = StyleSheet.create({
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8, // Added rounding for the "box" look
    marginHorizontal: 8, // Spacing for the box
  },
  songRowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)', // Much subtler "glass" look instead of solid grey
  },
  songRowDragging: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    transform: [{ scale: 1.02 }],
  },
  leftAction: {
    width: 30, // Reduced width since no icon
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  songNumber: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  songNumberActive: {
      color: Colors.primary // Green number, but white text? User said "not name as green", didn't specify number.
      // Actually image shows White Text for title. Let's make number green to indicate play, or white.
      // User: "its not highlighting the song name as green"
      // Let's keep number green for subtle indication, active text white.
  },
  smallCoverContainer: {
    marginRight: 12,
  },
  smallCover: {
    width: 48, // Slightly bigger per image
    height: 48,
    borderRadius: 4,
  },
  placeholderCover: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center'
  },
  visualizerOverlay: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: 0,
      top: 0,
      backgroundColor: 'rgba(0,0,0,0.4)', // Slightly darken cover to make white bars pop
      borderRadius: 4,
      justifyContent: 'center',
      alignItems: 'center',
  },
  visualizerContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: 16,
      gap: 2,
  },
  visualizerBar: {
      width: 3,
      backgroundColor: '#FFF', // White bars
      borderRadius: 2,
  },
  songInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  songTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    marginBottom: 2,
  },
  songTitleActive: {
    color: '#fff', // Explicitly White, not green
    fontWeight: '600',
  },
  songArtist: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  songDuration: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 8,
  },
  songDurationActive: {
      fontSize: 12,
      color: Colors.primary,
      fontWeight: '600',
      marginLeft: 8,
      fontVariant: ['tabular-nums'], // Prevent jitter
  },
  moreButton: {
    padding: 8,
    marginLeft: 4,
  },
});

export const PlaylistItem = memo(PlaylistItemComponent, (prevProps, nextProps) => {
  // Custom comparison for strict performance
  const idChanged = prevProps.item.id !== nextProps.item.id;
  const activeChanged = prevProps.isActive !== nextProps.isActive;
  const editModeChanged = prevProps.isEditMode !== nextProps.isEditMode;
  const currentSongChanged = prevProps.currentSongId !== nextProps.currentSongId;
  const isActiveSong = prevProps.item.id === prevProps.currentSongId || nextProps.item.id === nextProps.currentSongId;
  
  // Rerender if:
  // 1. Different underlying song (id changed)
  // 2. Dragging state changed (isActive)
  // 3. Edit Mode toggled (isEditMode)
  // 4. This specific song STARTED or STOPPED playing (isActiveSong && currentSongChanged)
  
  // Return TRUE if props are equal (DO NOT RERENDER)
  // Return FALSE if props are different (RERENDER)
  
  if (idChanged || activeChanged || editModeChanged) {
      return false; // Rerender
  }
  
  if (currentSongChanged && isActiveSong) {
      return false; // Rerender only if this song is affected
  }

  return true; // Use cached
});
