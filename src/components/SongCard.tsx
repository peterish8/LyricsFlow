/**
 * LyricFlow - Song Card Component
 * Grid card for library with gradient thumbnail
 */

import React, { memo } from 'react';
import { StyleSheet, View, Text, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getGradientById, GRADIENTS } from '../constants/gradients';
import { Colors } from '../constants/colors';
import { formatSongSubtitle } from '../utils/formatters';

interface SongCardProps {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  gradientId: string;
  coverImageUri?: string;
  duration?: number;
  onPress: () => void;
  onLongPress?: () => void;
}

export const SongCard: React.FC<SongCardProps> = memo(({
  title,
  artist,
  album,
  gradientId,
  coverImageUri,
  duration,
  onPress,
  onLongPress,
}) => {
  const gradient = getGradientById(gradientId) ?? GRADIENTS[0];
  const subtitle = formatSongSubtitle(artist, album);
  const durationText = duration ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : '';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {/* Gradient or Image Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {coverImageUri ? (
          <Image 
            source={{ uri: coverImageUri }} 
            style={styles.thumbnail} 
          />
        ) : (
          <LinearGradient
            colors={gradient.colors as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.thumbnail}
          />
        )}
        <View style={styles.thumbnailOverlay} />
      </View>

      {/* Song Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        {durationText && (
          <Text style={styles.duration}>{durationText}</Text>
        )}
      </View>
    </Pressable>
  );
});

SongCard.displayName = 'SongCard';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 8,
  },
  pressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.8,
  },
  thumbnailContainer: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.card,
  },
  thumbnail: {
    flex: 1,
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  info: {
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  duration: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});

export default SongCard;
