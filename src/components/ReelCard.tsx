/**
 * Reel Card Component
 * Instagram Reels-inspired layout with right-side buttons and bottom song info
 * Dynamic blurred background from cover art
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UnifiedSong } from '../types/song';

import { reelsBufferManager } from '../services/ReelsBufferManager';
import IslandScrubber from './IslandScrubber';

// Local component to handle progress updates without re-rendering the heavy ReelCard
const ReelsProgressController = ({ isActive }: { isActive: boolean }) => {
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  React.useEffect(() => {
    if (isActive) {
      // Subscribe to updates
      reelsBufferManager.setStatusUpdateCallback((status) => {
        if (status.isLoaded) {
          setPosition(status.positionMillis);
          setDuration(status.durationMillis || 0);
        }
      });
    }
    return () => {
        // Cleanup not strictly necessary as manager handles single callback, 
        // but good practice if we add multiple listener support later.
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <View style={styles.scrubberContainer}>
        <IslandScrubber 
            currentTime={position}
            duration={duration}
            onSeek={(time) => reelsBufferManager.seekTo(time)}
            onScrubStart={() => reelsBufferManager.pause()} // Pause while scrubbing
            onScrubEnd={() => reelsBufferManager.resume()} // Resume after
        />
    </View>
  );
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ReelCardProps {
  song: UnifiedSong;
  isActive: boolean;
  isLiked: boolean;
  isPlaying: boolean;
  onLike: () => void;
  onShare: () => void;
  onDownload: () => void;
  onPlayPause: () => void;
  reelHeight: number;
}

export const ReelCard: React.FC<ReelCardProps> = React.memo(
  ({ song, isActive, isLiked, isPlaying, onLike, onShare, onDownload, onPlayPause, reelHeight }) => {
    const [showPlayPause, setShowPlayPause] = useState(false);

    const handleTap = () => {
      onPlayPause();
      setShowPlayPause(true);
      setTimeout(() => setShowPlayPause(false), 800);
    };

    return (
      <Pressable style={[styles.container, { height: reelHeight }]} onPress={handleTap}>
        {/* Blurred Background - Full Screen Dynamic Colors */}
        {song.highResArt && (
          <Image
            source={{ uri: song.highResArt }}
            style={[StyleSheet.absoluteFillObject, { width: SCREEN_WIDTH, height: reelHeight }]}
            blurRadius={60}
            resizeMode="cover"
          />
        )}

        {/* Dark Overlay */}
        <View style={styles.overlay} />

        {/* Main Cover Art - Centered */}
        {song.highResArt && (
          <Image
            source={{ uri: song.highResArt }}
            style={styles.coverArt}
            resizeMode="cover"
          />
        )}

        {/* Play/Pause indicator (shows briefly on tap) */}
        {showPlayPause && (
          <View style={styles.playPauseOverlay}>
            <View style={styles.playPauseCircle}>
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={50}
                color="#fff"
              />
            </View>
          </View>
        )}

        {/* PROGRESS SCRUBBER (Replaces Waveform) */}
        {/* Placed at bottom, above actions/info */}
        <View style={styles.progressWrapper}>
            <ReelsProgressController isActive={isActive} />
        </View>

        {/* Right Side Action Buttons */}
        <View style={styles.actionsContainer}>
          {/* Like Button */}
          <Pressable style={styles.actionButton} onPress={onLike}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={30}
              color={isLiked ? '#FF2D55' : '#fff'}
            />
            <Text style={[styles.actionLabel, isLiked && { color: '#FF2D55' }]}>
              {isLiked ? 'Liked' : 'Like'}
            </Text>
          </Pressable>

          {/* Share Button */}
          <Pressable style={styles.actionButton} onPress={onShare}>
            <Ionicons name="share-outline" size={28} color="#fff" />
            <Text style={styles.actionLabel}>Share</Text>
          </Pressable>

          {/* Download Button */}
          <Pressable style={styles.actionButton} onPress={onDownload}>
            <Ionicons name="download-outline" size={28} color="#fff" />
            <Text style={styles.actionLabel}>Save</Text>
          </Pressable>
        </View>

        {/* Bottom Song Info Bar - Instagram-style */}
        <View style={styles.bottomContainer}>
          {/* Song Info Row */}
          <View style={styles.songInfoRow}>
            {/* Mini Album Art */}
            {song.highResArt ? (
              <Image source={{ uri: song.highResArt }} style={styles.miniArt} />
            ) : (
              <View style={[styles.miniArt, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="musical-note" size={18} color="#fff" />
              </View>
            )}

            {/* Song Details */}
            <View style={styles.songDetails}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {song.title}
              </Text>
              <Text style={styles.songArtist} numberOfLines={1}>
                {song.artist || 'Unknown Artist'}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isActive === nextProps.isActive &&
      prevProps.isLiked === nextProps.isLiked &&
      prevProps.isPlaying === nextProps.isPlaying &&
      prevProps.song.id === nextProps.song.id
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  coverArt: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  playPauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  playPauseCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressWrapper: {
    position: 'absolute',
    bottom: 120, // Above song info
    left: 20,
    right: 20, // Full width minus margins
    height: 40,
    justifyContent: 'center',
    zIndex: 20,
  },
  scrubberContainer: {
    width: '100%',
  },
  actionsContainer: {
    position: 'absolute',
    right: 12,
    bottom: 180, // Moved up to make room for scrubber
    gap: 24,
    alignItems: 'center',
  },
  actionButton: {
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 12,
  },
  songInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    padding: 10,
  },
  miniArt: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  songDetails: {
    flex: 1,
  },
  songTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  songArtist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
});
