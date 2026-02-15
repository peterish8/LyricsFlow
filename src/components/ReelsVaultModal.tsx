/**
 * Reels Vault Modal
 * Shows liked reels in a 3-column grid with batch download functionality
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReelsFeedStore } from '../store/reelsFeedStore';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { UnifiedSong } from '../types/song';

interface ReelsVaultModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ReelsVaultModal: React.FC<ReelsVaultModalProps> = ({
  visible,
  onClose,
}) => {
  const { vault, removeFromVault, clearVault } = useReelsFeedStore();
  const addToQueue = useDownloadQueueStore((state) => state.addToQueue);

  const handleDownloadAll = () => {
    if (vault.length === 0) {
      Alert.alert('Empty Vault', 'No songs to download');
      return;
    }

    // Add all vault songs to download queue
    // The downloadQueueStore will handle fetching lyrics automatically
    addToQueue(vault);

    Alert.alert(
      'Download Started',
      `${vault.length} song${vault.length > 1 ? 's' : ''} added to download queue`,
      [
        {
          text: 'Clear Vault',
          onPress: () => clearVault(),
        },
        { text: 'Keep in Vault', style: 'cancel' },
      ]
    );
  };

  const handleRemoveSong = (songId: string) => {
    removeFromVault(songId);
  };

  const renderSong = ({ item }: { item: UnifiedSong }) => (
    <View style={styles.songCard}>
      <Image
        source={{ uri: item.highResArt }}
        style={styles.coverArt}
        resizeMode="cover"
      />
      <Pressable
        style={styles.removeButton}
        onPress={() => handleRemoveSong(item.id)}
      >
        <Ionicons name="close-circle" size={24} color="#FF0048" />
      </Pressable>
      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {item.artist}
        </Text>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Vault ({vault.length})</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>

          {/* Song Grid */}
          {vault.length > 0 ? (
            <FlatList
              data={vault}
              renderItem={renderSong}
              keyExtractor={(item) => item.id}
              numColumns={3}
              contentContainerStyle={styles.gridContainer}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="heart-outline" size={64} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No liked reels yet</Text>
              <Text style={styles.emptySubtext}>
                Tap the heart on any reel to save it here
              </Text>
            </View>
          )}

          {/* Download All Button */}
          {vault.length > 0 && (
            <Pressable
              style={styles.downloadButton}
              onPress={handleDownloadAll}
            >
              <Ionicons name="download" size={24} color="#fff" />
              <Text style={styles.downloadButtonText}>
                Download All ({vault.length})
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  gridContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  songCard: {
    flex: 1,
    margin: 4,
    maxWidth: '31%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
  },
  coverArt: {
    width: '100%',
    height: '70%',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
  },
  songInfo: {
    padding: 8,
    height: '30%',
  },
  songTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  songArtist: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  downloadButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#007AFF',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
