/**
 * LyricFlow - Library Screen
 * Home screen with song grid, aurora header
 */

import React, { useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  Image,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TabScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { useArtHistoryStore } from '../store/artHistoryStore';
import { AuroraHeader, SongCard, CustomMenu } from '../components';
import { Colors } from '../constants/colors';
import { getGradientById, GRADIENTS } from '../constants/gradients';
import { Song } from '../types/song';
import * as ImagePicker from 'expo-image-picker';

type Props = TabScreenProps<'Library'>;

const LibraryScreen: React.FC<Props> = ({ navigation }) => {
  const { songs, isLoading, fetchSongs, setCurrentSong, updateSong } = useSongsStore();
  const { recentArts, addRecentArt } = useArtHistoryStore();
  
  const [artMenuVisible, setArtMenuVisible] = React.useState(false);
  const [artMenuAnchor, setArtMenuAnchor] = React.useState<{ x: number, y: number } | undefined>(undefined);
  const [selectedSongForArt, setSelectedSongForArt] = React.useState<Song | null>(null);
  const [recentArtVisible, setRecentArtVisible] = React.useState(false);

  useEffect(() => {
    fetchSongs();
  }, []);
  
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchSongs();
    });
    return unsubscribe;
  }, [navigation]);

  const handleSongPress = useCallback((song: Song) => {
    setCurrentSong(song);
    navigation.navigate('NowPlaying', { songId: song.id });
  }, [navigation, setCurrentSong]);

  const handleSongLongPress = useCallback((song: Song, event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    setSelectedSongForArt(song);
    setArtMenuAnchor({ x: pageX, y: pageY });
    setArtMenuVisible(true);
  }, []);

  const handleAddPress = useCallback(() => {
    navigation.navigate('AddEditLyrics', {});
  }, [navigation]);
  
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0].uri && selectedSongForArt) {
        const uri = result.assets[0].uri;
        const updatedSong = {
          ...selectedSongForArt,
          coverImageUri: uri,
          dateModified: new Date().toISOString(),
        };
        await updateSong(updatedSong);
        addRecentArt(uri);
        setArtMenuVisible(false);
        fetchSongs();
      }
    } catch (error) {
      console.error('Cover art save failed:', error);
      Alert.alert('Save failed', 'Failed to save cover art.');
    }
  };

  const selectRecentArt = async (uri: string) => {
    if (selectedSongForArt) {
      try {
        const updatedSong = {
          ...selectedSongForArt,
          coverImageUri: uri,
          dateModified: new Date().toISOString(),
        };
        await updateSong(updatedSong);
        setArtMenuVisible(false);
        fetchSongs();
      } catch (error) {
        console.error('Recent art apply failed:', error);
        Alert.alert('Save failed', 'Failed to save cover art.');
      }
    }
  };

  const artOptions = [
    {
      label: 'Choose from Gallery',
      icon: 'image-outline' as const,
      onPress: pickImage,
    },
    ...(recentArts.length > 0 ? [{
      label: 'Recent Art',
      icon: 'time-outline' as const,
      onPress: () => {
        setArtMenuVisible(false);
        setTimeout(() => setRecentArtVisible(true), 100);
      },
    }] : []),
  ];

  const topSongs = songs.slice(0, 2);
  const otherSongs = songs.slice(2);

  const renderSong = ({ item, index }: { item: Song; index: number }) => (
    <View style={[styles.cardWrapper, index % 2 === 0 && styles.cardLeft]}>
      <SongCard
        id={item.id}
        title={item.title}
        artist={item.artist}
        album={item.album}
        gradientId={item.gradientId}
        coverImageUri={item.coverImageUri}
        onPress={() => handleSongPress(item)}
      />
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="musical-notes-outline" size={80} color={Colors.textSecondary} />
      <Text style={styles.emptyTitle}>No songs yet</Text>
      <Text style={styles.emptySubtitle}>
        Add your first song with timestamped lyrics
      </Text>
      <Pressable style={styles.addButton} onPress={handleAddPress}>
        <Ionicons name="add" size={20} color="#000" />
        <Text style={styles.addButtonText}>Add Lyrics</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <AuroraHeader palette="library" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft} />
          <View style={styles.headerRight}>
            <Pressable style={styles.headerButton}>
              <Ionicons name="notifications-outline" size={24} color="#fff" />
            </Pressable>
            <Pressable 
              style={styles.headerButton}
              onPress={() => navigation.navigate('Search' as never)}
            >
              <Ionicons name="search-outline" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <FlatList
          key="library-list"
          data={[]}
          keyExtractor={(item) => item.id}
          renderItem={() => null}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={songs.length === 0 ? renderEmpty : null}
          ListHeaderComponent={
            songs.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Most Played</Text>
                </View>
                <View style={styles.topGrid}>
                  {topSongs.map((song, index) => (
                    <View key={song.id} style={[styles.cardWrapper, index % 2 === 0 && styles.cardLeft]}>
                      <SongCard
                        id={song.id}
                        title={song.title}
                        artist={song.artist}
                        album={song.album}
                        gradientId={song.gradientId}
                        coverImageUri={song.coverImageUri}
                        duration={song.duration}
                        onPress={() => handleSongPress(song)}
                        onLongPress={(e) => handleSongLongPress(song, e)}
                      />
                    </View>
                  ))}
                </View>
                {songs.length > 2 && (
                  <>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>All Songs</Text>
                    </View>
                    {songs.map((song) => (
                      <Pressable
                        key={song.id}
                        style={styles.listItem}
                        onPress={() => handleSongPress(song)}
                        onLongPress={(e) => handleSongLongPress(song, e)}
                      >
                        <View style={styles.listItemThumbnail}>
                          {song.coverImageUri ? (
                            <Image source={{ uri: song.coverImageUri }} style={styles.listItemImage} />
                          ) : (
                            <LinearGradient
                              colors={getGradientById(song.gradientId)?.colors as [string, string, ...string[]] || GRADIENTS[0].colors as [string, string, ...string[]]}
                              style={styles.listItemImage}
                            />
                          )}
                        </View>
                        <View style={styles.listItemContent}>
                          <Text style={styles.listItemTitle} numberOfLines={1}>{song.title}</Text>
                          <Text style={styles.listItemArtist} numberOfLines={1}>{song.artist || 'Unknown Artist'}</Text>
                        </View>
                        <Text style={styles.listItemDuration}>{Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, '0')}</Text>
                        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                      </Pressable>
                    ))}
                  </>
                )}
              </>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={fetchSongs}
              tintColor={Colors.textSecondary}
            />
          }
        />

        {/* FAB */}
        <Pressable style={styles.fab} onPress={handleAddPress}>
          <Ionicons name="add" size={28} color="#000" />
        </Pressable>
      </SafeAreaView>
      
      <CustomMenu
        visible={artMenuVisible}
        onClose={() => setArtMenuVisible(false)}
        title="Cover Art Options"
        anchorPosition={artMenuAnchor}
        options={artOptions}
      />
      
      <Modal
        visible={recentArtVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRecentArtVisible(false)}
      >
        <Pressable 
          style={styles.recentArtOverlay} 
          onPress={() => setRecentArtVisible(false)}
        >
          <View style={styles.recentArtContainer}>
            <Text style={styles.recentArtTitle}>Recent Art</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentArtScroll}>
              {recentArts.map((uri, index) => (
                <Pressable
                  key={index}
                  style={styles.recentArtItem}
                  onPress={() => {
                    selectRecentArt(uri);
                    setRecentArtVisible(false);
                  }}
                >
                  <Image source={{ uri }} style={styles.recentArtImage} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 10,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 20,
  },
  headerButton: {
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  topGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  row: {
    gap: 16,
    marginBottom: 24,
  },
  cardWrapper: {
    flex: 1,
  },
  cardLeft: {
    marginRight: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  moreButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  moreButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 250,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  listItemThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 6,
    overflow: 'hidden',
  },
  listItemImage: {
    width: '100%',
    height: '100%',
  },
  listItemContent: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  listItemArtist: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  listItemDuration: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginRight: 8,
  },
  recentArtOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  recentArtContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  recentArtTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  recentArtScroll: {
    paddingHorizontal: 20,
  },
  recentArtItem: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  recentArtImage: {
    width: '100%',
    height: '100%',
  },
});

export default LibraryScreen;
