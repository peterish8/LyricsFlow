/**
 * LyricFlow - Liked Songs Screen
 * Display all liked songs
 */

import React from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSongsStore } from '../store/songsStore';
import { AuroraHeader } from '../components';
import { Colors } from '../constants/colors';
import { formatTime } from '../utils/formatters';
import { RootStackParamList } from '../types/navigation';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export const LikedSongsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { songs } = useSongsStore();
  const likedSongs = songs.filter(s => s.isLiked);

  const handleSongPress = (songId: string) => {
    navigation.navigate('NowPlaying', { songId });
  };

  return (
    <View style={styles.container}>
      <AuroraHeader palette="library" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>Liked Songs</Text>
          <View style={{ width: 40 }} />
        </View>

        {likedSongs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="heart-outline" size={80} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyTitle}>No liked songs yet</Text>
            <Text style={styles.emptySubtitle}>Songs you like will appear here</Text>
          </View>
        ) : (
          <FlatList
            data={likedSongs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable style={styles.songItem} onPress={() => handleSongPress(item.id)}>
                <View style={styles.thumbnail}>
                  {item.coverImageUri ? (
                    <Image source={{ uri: item.coverImageUri }} style={styles.image} />
                  ) : (
                    <Ionicons name="disc" size={24} color="rgba(255,255,255,0.3)" />
                  )}
                </View>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.songArtist} numberOfLines={1}>
                    {item.artist || 'Unknown Artist'}
                  </Text>
                </View>
                <Text style={styles.duration}>{formatTime(item.duration)}</Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  songArtist: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  duration: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
});

export default LikedSongsScreen;
