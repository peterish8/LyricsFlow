/**
 * LyricFlow - Add/Edit Lyrics Screen
 * Form for creating and editing songs
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { RootStackScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { GradientPicker, AIGeneratorModal } from '../components';
import { Toast } from '../components/Toast';
import { Colors } from '../constants/colors';
import { DEFAULT_GRADIENT_ID } from '../constants/gradients';
import { parseTimestampedLyrics, calculateDuration, lyricsToRawText } from '../utils/timestampParser';
import { generateId } from '../utils/formatters';
import { formatTime } from '../utils/formatters';

// Helper to parse duration string (mm:ss or seconds)
const parseDurationInput = (input: string): number => {
  const parts = input.trim().split(':');
  if (parts.length === 2) {
    const min = parseInt(parts[0], 10);
    const sec = parseInt(parts[1], 10);
    if (!isNaN(min) && !isNaN(sec)) {
      return min * 60 + sec;
    }
  } else if (parts.length === 1) {
    const val = parseInt(parts[0], 10);
    if (!isNaN(val)) return val;
  }
  return 0;
};

type Props = RootStackScreenProps<'AddEditLyrics'>;

const AddEditLyricsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { songId } = route.params ?? {};
  const isEditing = !!songId;

  const { getSong, addSong, updateSong } = useSongsStore();

  // Form state
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [gradientId, setGradientId] = useState(DEFAULT_GRADIENT_ID);
  const [lyricsText, setLyricsText] = useState('');
  const [scrollSpeed, setScrollSpeed] = useState(50); // pixels per second
  const [durationText, setDurationText] = useState('');
  const [lyricsAlign, setLyricsAlign] = useState<'left' | 'center' | 'right'>('left');
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  // Load existing song for editing
  useEffect(() => {
    if (isEditing && songId) {
      const loadSong = async () => {
        const song = await getSong(songId);
        if (song) {
          setTitle(song.title);
          setArtist(song.artist ?? '');
          setAlbum(song.album ?? '');
          setGradientId(song.gradientId);
          setLyricsText(lyricsToRawText(song.lyrics));
          setScrollSpeed(song.scrollSpeed ?? 50);
          setDurationText(formatTime(song.duration));
          setLyricsAlign(song.lyricsAlign ?? 'left');
        }
      };
      loadSong();
    }
  }, [songId, isEditing, getSong]);

  const handleCancel = () => {
    navigation.goBack();
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setLyricsText((prev) => prev + text);
      }
    } catch (error) {
      console.error('Paste failed:', error);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a song title.');
      return;
    }

    if (!lyricsText.trim()) {
      Alert.alert('Missing Lyrics', 'Please enter some lyrics.');
      return;
    }

    setIsSaving(true);

    try {
      const parsedLyrics = parseTimestampedLyrics(lyricsText);
      const manualDuration = parseDurationInput(durationText);
      const calculatedDuration = calculateDuration(parsedLyrics);
      const duration = manualDuration > 0 ? manualDuration : calculatedDuration;
      const now = new Date().toISOString();

      const songData = {
        id: isEditing && songId ? songId : generateId(),
        title: title.trim(),
        artist: artist.trim() || undefined,
        album: album.trim() || undefined,
        gradientId,
        lyrics: parsedLyrics,
        duration,
        dateCreated: isEditing ? (await getSong(songId!))?.dateCreated ?? now : now,
        dateModified: now,
        playCount: 0,
        lastPlayed: undefined,
        scrollSpeed,
        lyricsAlign,
      };

      if (isEditing) {
        await updateSong(songData);
      } else {
        await addSong(songData);
      }

      setShowToast(true);
      setTimeout(() => {
        navigation.goBack();
      }, 500);
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert(
        'Save Failed', 
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check the console logs and try again.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Edit lyrics' : 'Add lyrics'}
          </Text>
          <Pressable
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Input Fields */}
          <View style={styles.inputSection}>
            <FloatingInput
              label="Song Title"
              value={title}
              onChangeText={setTitle}
            />
            <FloatingInput
              label="Artist"
              value={artist}
              onChangeText={setArtist}
            />
          </View>

          <View style={styles.inputSection}>
            <FloatingInput
              label="Total Duration (mm:ss)"
              value={durationText}
              onChangeText={setDurationText}
            />
            <Text style={styles.hintText}>Leave empty to auto-calculate from timestamps</Text>
          </View>

          {/* Scroll Speed Slider */}
          <View style={styles.section}>
             <Text style={styles.sectionTitle}>
               Auto-Scroll Speed (Pixels/sec): {scrollSpeed || 50}
             </Text>
             <View style={styles.sliderContainer}>
                <Pressable onPress={() => setScrollSpeed(Math.max(10, scrollSpeed - 5))} style={styles.speedButton}>
                  <Ionicons name="remove" size={24} color={Colors.textPrimary} />
                </Pressable>
                <View 
                  style={[
                    styles.speedBar, 
                    { width: `${((scrollSpeed || 50) / 200) * 100}%` }
                  ]} 
                />
                <Pressable onPress={() => setScrollSpeed(Math.min(200, scrollSpeed + 5))} style={styles.speedButton}>
                  <Ionicons name="add" size={24} color={Colors.textPrimary} />
                </Pressable>
             </View>
             <Text style={styles.hintText}>Only used if lyrics have no timestamps</Text>
          </View>

          {/* Lyrics Alignment */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Lyrics Alignment</Text>
            <View style={styles.alignmentButtons}>
              <Pressable
                style={[styles.alignButton, lyricsAlign === 'left' && styles.alignButtonActive]}
                onPress={() => setLyricsAlign('left')}
              >
                <Ionicons name="text-outline" size={20} color={lyricsAlign === 'left' ? '#fff' : '#888'} />
                <Text style={[styles.alignButtonText, lyricsAlign === 'left' && styles.alignButtonTextActive]}>Left</Text>
              </Pressable>
              <Pressable
                style={[styles.alignButton, lyricsAlign === 'center' && styles.alignButtonActive]}
                onPress={() => setLyricsAlign('center')}
              >
                <Ionicons name="text" size={20} color={lyricsAlign === 'center' ? '#fff' : '#888'} />
                <Text style={[styles.alignButtonText, lyricsAlign === 'center' && styles.alignButtonTextActive]}>Center</Text>
              </Pressable>
              <Pressable
                style={[styles.alignButton, lyricsAlign === 'right' && styles.alignButtonActive]}
                onPress={() => setLyricsAlign('right')}
              >
                <Ionicons name="text-outline" size={20} color={lyricsAlign === 'right' ? '#fff' : '#888'} style={{ transform: [{ scaleX: -1 }] }} />
                <Text style={[styles.alignButtonText, lyricsAlign === 'right' && styles.alignButtonTextActive]}>Right</Text>
              </Pressable>
            </View>
          </View>

          {/* Gradient Picker */}
          <View style={styles.section}>
            <GradientPicker
              selectedId={gradientId}
              onSelect={setGradientId}
            />
          </View>

          {/* Lyrics Input */}
          <View style={styles.lyricsSection}>
            <View style={styles.lyricsHeader}>
              <Text style={styles.lyricsLabel}>LYRICS</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Pressable onPress={() => setShowAIModal(true)}>
                  <Text style={styles.aiButton}>✨ Magic AI</Text>
                </Pressable>
                <Pressable onPress={handlePaste}>
                  <Text style={styles.pasteButton}>Paste</Text>
                </Pressable>
              </View>
            </View>
            <TextInput
              style={styles.lyricsInput}
              multiline
              placeholder="Type or paste lyrics here..."
              placeholderTextColor={Colors.textMuted}
              value={lyricsText}
              onChangeText={setLyricsText}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        <AIGeneratorModal
          visible={showAIModal}
          onClose={() => setShowAIModal(false)}
          onApply={(text) => setLyricsText(text)}
        />

        <Toast
          message="Saved successfully!"
          visible={showToast}
          onHide={() => setShowToast(false)}
        />

        {/* Bottom Toolbar */}
        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            <Pressable style={styles.toolButton}>
              <Ionicons name="text" size={24} color={Colors.textSecondary} />
            </Pressable>
            <Pressable style={styles.toolButton}>
              <Ionicons name="create-outline" size={24} color={Colors.textSecondary} />
            </Pressable>
            <Pressable style={styles.toolButton}>
              <Ionicons name="reorder-three-outline" size={24} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <Pressable style={styles.toolButton}>
            <Ionicons name="chevron-down" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

// Floating Label Input Component
interface FloatingInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}

const FloatingInput: React.FC<FloatingInputProps> = ({ label, value, onChangeText }) => {
  const [isFocused, setIsFocused] = useState(false);
  const isFloating = isFocused || value.length > 0;

  return (
    <View style={floatingStyles.container}>
      <Text
        style={[
          floatingStyles.label,
          isFloating && floatingStyles.labelFloating,
          isFocused && floatingStyles.labelFocused,
        ]}
      >
        {label}
      </Text>
      <TextInput
        style={[floatingStyles.input, isFocused && floatingStyles.inputFocused]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
    </View>
  );
};

const floatingStyles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3F3F3F',
  },
  label: {
    position: 'absolute',
    left: 0,
    top: 24,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  labelFloating: {
    top: 0,
    fontSize: 12,
  },
  labelFocused: {
    color: '#3EA6FF',
  },
  input: {
    fontSize: 16,
    color: Colors.textPrimary,
    paddingVertical: 8,
  },
  inputFocused: {
    borderBottomColor: '#3EA6FF',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cancelButton: {
    backgroundColor: '#272727',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  saveButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 100,
    gap: 32,
  },
  inputSection: {
    gap: 24,
    paddingTop: 16,
  },
  section: {
    // Empty for now
  },
  lyricsSection: {
    flex: 1,
    gap: 8,
  },
  lyricsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lyricsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  pasteButton: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3EA6FF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A78BFA', // Purple accent
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lyricsInput: {
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 20,
    fontSize: 16,
    color: Colors.textPrimary,
    minHeight: 300,
    lineHeight: 24,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  toolbarLeft: {
    flexDirection: 'row',
    gap: 32,
  },
  toolButton: {
    padding: 4,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    marginBottom: 12,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: '#181818',
    borderRadius: 12,
    marginBottom: 8,
  },
  speedButton: {
    padding: 8,
  },
  speedBar: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  hintText: {
    color: Colors.textMuted,
    fontSize: 12,
    paddingHorizontal: 16,
  },
  alignmentButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  alignButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#181818',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  alignButtonActive: {
    backgroundColor: '#2a2a2a',
    borderColor: '#3EA6FF',
  },
  alignButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  alignButtonTextActive: {
    color: '#fff',
  },
});

export default AddEditLyricsScreen;
