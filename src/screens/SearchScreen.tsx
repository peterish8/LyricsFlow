/**
 * LyricFlow - Search Screen
 * Real-time search with filter chips
 */

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TabScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { AuroraHeader, SongCard } from '../components';
import { Colors } from '../constants/colors';
import { Song } from '../types/song';
import { getGradientById, GRADIENTS } from '../constants/gradients';

type Props = TabScreenProps<'Search'>;

const SearchScreen: React.FC<Props> = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [results, setResults] = useState<Song[]>([]);
  const { searchSongs, setCurrentSong } = useSongsStore();

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.trim().length > 0) {
      const found = await searchSongs(text);
      setResults(found);
    } else {
      setResults([]);
    }
  }, [searchSongs]);

  const handleSearchSubmit = useCallback(() => {
    if (query.trim().length === 0) return;
    
    setRecentSearches(prev => {
      const newHistory = [query.trim(), ...prev.filter(q => q !== query.trim())];
      return newHistory.slice(0, 8); // Keep only last 8
    });
  }, [query]);

  const handleRecentSearchPress = useCallback((searchText: string) => {
    handleSearch(searchText);
  }, [handleSearch]);

  const handleSongPress = useCallback((song: Song) => {
    setCurrentSong(song);
    // Also add to history on selection
    setRecentSearches(prev => {
      const newHistory = [song.title, ...prev.filter(q => q !== song.title)];
      return newHistory.slice(0, 8);
    });
    navigation.navigate('NowPlaying', { songId: song.id });
  }, [navigation, setCurrentSong]);

  const renderResult = ({ item }: { item: Song }) => {
    const gradient = getGradientById(item.gradientId) || GRADIENTS[0];
    
    return (
      <Pressable
        style={styles.resultItem}
        onPress={() => handleSongPress(item)}
      >
        <View style={styles.resultThumbnail}>
          {item.coverImageUri ? (
            <Image 
              source={{ uri: item.coverImageUri }} 
              style={StyleSheet.absoluteFill} 
            />
          ) : (
            <LinearGradient
              colors={gradient.colors as [string, string, ...string[]]}
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            Song • {item.artist || 'Unknown Artist'}
          </Text>
        </View>
        <Ionicons name="play" size={20} color={Colors.textSecondary} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <AuroraHeader palette="search" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Search Header */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search songs, albums, artists"
              placeholderTextColor={Colors.textSecondary}
              value={query}
              onChangeText={handleSearch}
              onSubmitEditing={handleSearchSubmit}
              autoFocus
            />
            {query.length > 0 && (
              <Pressable onPress={() => handleSearch('')}>
                <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Content Area */}
        {query.length === 0 ? (
          // Recent Searches View
          <ScrollView contentContainerStyle={styles.recentSearchesContainer}>
            {recentSearches.length > 0 && (
              <Text style={styles.sectionTitle}>Recent Searches</Text>
            )}
            {recentSearches.map((item, index) => (
              <Pressable
                key={index}
                style={styles.recentItem}
                onPress={() => handleRecentSearchPress(item)}
              >
                <Ionicons name="time-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.recentText}>{item}</Text>
                <Ionicons name="arrow-up-outline" size={16} color={Colors.textSecondary} style={{ transform: [{ rotate: '-45deg' }] }} />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          // Search Results View
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderResult}
            contentContainerStyle={styles.resultsContent}
            ListEmptyComponent={
              <View style={styles.emptyResults}>
                <Text style={styles.emptyText}>No results found</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    zIndex: 10,
  },
  backButton: {
    padding: 4,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(33,33,33,0.8)',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  recentSearchesContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  recentText: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
    marginLeft: 12,
  },
  resultsContent: {
    paddingBottom: 100,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  resultThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  resultSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyResults: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});

export default SearchScreen;
