/**
 * LuvLyrics - Tasks Modal
 * UI for monitoring and managing background AI tasks.
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTasksStore, Task } from '../store/tasksStore';
import { useSongsStore } from '../store/songsStore';
import { Colors } from '../constants/colors';
import { getAutoTimestampService } from '../services/autoTimestampServiceV2';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TasksModalProps {
  visible: boolean;
  onClose: () => void;
}

export const TasksModal: React.FC<TasksModalProps> = ({ visible, onClose }) => {
  const { tasks, cancelTask, removeTask } = useTasksStore();
  const { updateSong, setCurrentSong, currentSong } = useSongsStore(); // Access songs store for revert
  
  const pendingTasks = tasks.filter(t => t.status === 'queued' || t.status === 'processing');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');

  const handleStop = (taskId: string) => {
    cancelTask(taskId);
    getAutoTimestampService().stop();
  };

  const handleRemoveTask = (task: Task) => {
    if (task.status === 'completed' && task.revertData) {
      Alert.alert(
        'Remove Task',
        'Do you want to revert the changes to this song?',
        [
          { 
            text: 'Just Remove', 
            style: 'cancel',
            onPress: () => removeTask(task.id)
          },
          {
            text: 'Revert & Remove',
            style: 'destructive',
            onPress: async () => {
              // Restore original data
              if (task.revertData) {
                const restoredSong = {
                  id: task.songId,
                  // We need to fetch the full song first to keep other fields? 
                  // Actually updateSong merges updates.
                  // But wait, updateSong expects a full song or partial? 
                  // The interface usually takes the full object.
                  // Let's assume we need to fetch current, then merge revertData.
                  // But we can just pass the ID + updates if the store handles it.
                  // Let's rely on updateSong logic.
                  // Wait, updateSong in store usually takes the whole object.
                };
                
                // Safe approach: Fetch fresh, then merge revert
                // We'll trust that the store's updateSong handles the merge or we construct it here.
                // Since we can't easily async fetch inside this callback securely, 
                // we'll assume the task.revertData has the core fields we care about (lyrics, duration).
                // We need `title` etc to be safe?
                // `tasksStore` doesn't have `getSong`.
                // We can use `useSongsStore` hook's `getSong`.
                
                // SIMPLER: use updateSong with the ID and the fields to restore.
                // Assuming updateSong(song) updates by ID.
                
                // We need to get the CURRENT song to merge with revert data
                // We can't use `getSong` from hook easily here if it's not exposed or async.
                // Actually `useSongsStore` exposes `getSong`.
                
                // Let's do it safely:
                const { getSong } = useSongsStore.getState();
                const current = await getSong(task.songId);
                if (current && task.revertData) {
                   const restored = {
                     ...current,
                     lyrics: task.revertData.lyrics,
                     duration: task.revertData.duration,
                     dateModified: new Date().toISOString()
                   };
                   await updateSong(restored);
                   
                   // If this is the currently playing song, update player state too
                   if (currentSong?.id === task.songId) {
                      setCurrentSong(restored);
                   }
                }
              }
              removeTask(task.id);
              Alert.alert('Reverted', 'Original lyrics restored.');
            }
          }
        ]
      );
    } else {
      removeTask(task.id);
    }
  };

  const renderTask = (task: Task) => {
    const isProcessing = task.status === 'processing' || task.status === 'queued';
    
    return (
      <View key={task.id} style={styles.taskItem}>
        <View style={styles.taskIcon}>
          {task.status === 'completed' && <Ionicons name="checkmark-circle" size={24} color="#4CD964" />}
          {task.status === 'failed' && <Ionicons name="alert-circle" size={24} color="#FF3B30" />}
          {task.status === 'cancelled' && <Ionicons name="close-circle" size={24} color="rgba(255,255,255,0.4)" />}
          {isProcessing && <Ionicons name="sync" size={24} color="#007AFF" />}
        </View>
        
        <View style={styles.taskInfo}>
          <Text style={styles.taskTitle} numberOfLines={1}>{task.songTitle}</Text>
          <Text style={styles.taskStatus}>{task.stage}</Text>
          
          {isProcessing && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${task.progress * 100}%` }]} />
            </View>
          )}
        </View>

        <View style={styles.taskActions}>
          {isProcessing ? (
            <Pressable onPress={() => handleStop(task.id)} style={styles.actionButton}>
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => handleRemoveTask(task)} style={styles.actionButton}>
              <Ionicons name="trash-outline" size={20} color="rgba(255,255,255,0.4)" />
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Background Tasks</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll}>
            {pendingTasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>In Progress</Text>
                {pendingTasks.map(renderTask)}
              </View>
            )}

            {completedTasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Completed</Text>
                {completedTasks.map(renderTask)}
              </View>
            )}

            {failedTasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Failed / Cancelled</Text>
                {failedTasks.map(renderTask)}
              </View>
            )}

            {pendingTasks.length === 0 && completedTasks.length === 0 && failedTasks.length === 0 && (
                <Text style={styles.emptyText}>No recent activity</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SCREEN_HEIGHT * 0.7,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  scroll: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  taskIcon: {
    width: 32,
    alignItems: 'center',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  taskStatus: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  progressContainer: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  taskActions: {
    paddingLeft: 8,
  },
  actionButton: {
    padding: 8,
  },
  stopText: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: 20,
  },
});
