import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator, 
  Alert,
  ScrollView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LyricsRepository, SearchResult } from '../services/LyricsRepository';
import { Colors } from '../constants/colors';

interface LrcSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  initialQuery: {
    title: string;
    artist: string;
    duration: number;
  };
}

export const LrcSearchModal: React.FC<LrcSearchModalProps> = ({ 
  visible, 
  onClose, 
  onSelect,
  initialQuery 
}) => {
  const [query, setQuery] = useState(`${initialQuery.title} ${initialQuery.artist}`);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [previewItem, setPreviewItem] = useState<SearchResult | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery(`${initialQuery.title} ${initialQuery.artist}`);
      handleSearch();
    } else {
      setPreviewItem(null);
      setResults([]);
      setQuery('');
    }
  }, [visible]);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setStatusMessage('Searching LRCLIB...');
    setResults([]);

    try {
      const searchResults = await LyricsRepository.searchSmart(
        query,
        initialQuery,
        (msg) => setStatusMessage(msg)
      );
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
      Alert.alert('Error', 'Failed to fetch lyrics. Please try again.');
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const handleSelect = (item: SearchResult) => {
    setPreviewItem(item);
  };

  const handleApply = () => {
    if (!previewItem) return;
    onSelect(previewItem);
    onClose();
  };

  const handleBack = () => {
    setPreviewItem(null);
  };

  const renderItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity 
      style={styles.resultItem} 
      onPress={() => handleSelect(item)}
    >
      <View style={styles.resultContent}>
        <Text style={styles.resultTitle} numberOfLines={1}>{item.trackName}</Text>
        <Text style={styles.resultArtist} numberOfLines={1}>{item.artistName}</Text>
        
        <View style={styles.badgesContainer}>
          {/* Source Badge */}
          <View style={[
            styles.badge, 
            item.source === 'LRCLIB' ? styles.badgeLrc : styles.badgeGenius
          ]}>
            <Text style={styles.badgeText}>{item.source}</Text>
          </View>

          {/* Type Badge */}
          {item.type === 'synced' && (
            <View style={[styles.badge, styles.badgeSynced]}>
              <Ionicons name="time" size={10} color="#fff" style={{ marginRight: 2 }} />
              <Text style={styles.badgeText}>Synced</Text>
            </View>
          )}

          {/* Score Badge */}
          {item.matchScore > 0 && (
            <View style={[
              styles.badge, 
              item.matchScore > 80 ? styles.badgeHigh : styles.badgeLow
            ]}>
              <Text style={styles.badgeText}>{Math.round(item.matchScore)}% Match</Text>
            </View>
          )}
        </View>

        {item.matchReason ? (
          <Text style={styles.matchReason}>{item.matchReason}</Text>
        ) : null}
      </View>
      
      <Ionicons name="chevron-forward" size={20} color="#666" />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Fetch Lyrics</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search title, artist..."
            placeholderTextColor="#666"
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
            <Ionicons name="search" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {previewItem ? (
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.previewTitle}>Preview Lyrics</Text>
              <View style={{ width: 60 }} />
            </View>

            <View style={styles.previewContent}>
              <View style={styles.previewMeta}>
                <Text style={styles.previewTrack}>{previewItem.trackName}</Text>
                <Text style={styles.previewArtist}>{previewItem.artistName}</Text>

                <View style={styles.badgesContainer}>
                  <View
                    style={[
                      styles.badge,
                      previewItem.source === 'LRCLIB' ? styles.badgeLrc : styles.badgeGenius,
                    ]}
                  >
                    <Text style={styles.badgeText}>{previewItem.source}</Text>
                  </View>

                  <View style={[styles.badge, previewItem.type === 'synced' ? styles.badgeSynced : styles.badgeLow]}>
                    <Text style={styles.badgeText}>
                      {previewItem.type === 'synced' ? 'Synced Lyrics' : 'Plain Lyrics'}
                    </Text>
                  </View>
                </View>
              </View>

              <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewScrollContent}>
                <Text style={styles.previewText}>
                  {previewItem.syncedLyrics || previewItem.plainLyrics}
                </Text>
              </ScrollView>
            </View>

            <View style={styles.previewFooter}>
              <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
                <Text style={styles.applyButtonText}>Apply Lyrics</Text>
                <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          </View>
        ) : loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>{statusMessage}</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="musical-notes-outline" size={48} color="#333" />
                <Text style={styles.emptyText}>No results found</Text>
                <Text style={styles.emptySubText}>Try a different search query</Text>
              </View>
            }
          />
        )}

      </View>
    </Modal>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: Colors.primary || '#007AFF', // Fallback if color undef
    borderRadius: 8,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  resultContent: {
    flex: 1,
    marginRight: 12,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  resultArtist: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeLrc: {
    backgroundColor: '#0A84FF',
  },
  badgeGenius: {
    backgroundColor: '#FFD60A', // Genius Yellow
  },
  badgeSynced: {
    backgroundColor: '#30D158',
  },
  badgeHigh: {
    backgroundColor: 'rgba(48, 209, 88, 0.2)',
    borderWidth: 1,
    borderColor: '#30D158',
  },
  badgeLow: {
    backgroundColor: 'rgba(255, 69, 58, 0.2)',
    borderWidth: 1,
    borderColor: '#FF453A',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    // For Genius badge, maybe black text?
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 1,
  },
  matchReason: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubText: {
    color: '#666',
    marginTop: 8,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#1c1c1e',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 4,
  },
  previewTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  previewContent: {
    flex: 1,
    padding: 16,
  },
  previewMeta: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 16,
  },
  previewTrack: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  previewArtist: {
    color: '#aaa',
    fontSize: 16,
  },
  previewScroll: {
    flex: 1,
  },
  previewScrollContent: {
    paddingBottom: 24,
  },
  previewText: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'monospace',
  },
  previewFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    backgroundColor: '#1c1c1e',
  },
  applyButton: {
    backgroundColor: Colors.primary || '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
