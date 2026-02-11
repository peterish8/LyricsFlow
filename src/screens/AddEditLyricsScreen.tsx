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
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { TabScreenProps } from '../types/navigation';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { GradientPicker, AIGeneratorModal } from '../components';
import { MagicModeModal } from '../components/MagicModeModal';
import { ProcessingOverlay } from '../components/ProcessingOverlay';
import { Toast } from '../components/Toast';
import { Colors } from '../constants/colors';
import { DEFAULT_GRADIENT_ID } from '../constants/gradients';
import { parseTimestampedLyrics, calculateDuration, lyricsToRawText } from '../utils/timestampParser';
import { generateId } from '../utils/formatters';
import { formatTime } from '../utils/formatters';
import { getAutoTimestampService, AutoTimestampResult } from '../services/autoTimestampServiceV2';
import { Song, LyricLine } from '../types/song';

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

const AddEditLyricsScreen = ({ navigation, route }: any) => {
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
  
  // Magic Timestamp state
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isPickingAudio, setIsPickingAudio] = useState(false);

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
          setAudioUri(song.audioUri ?? null);
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

  /**
   * Pick audio file for Magic Timestamp
   */
  const pickAudioFile = async () => {
    // Prevent concurrent picker calls
    if (isPickingAudio) {
      console.log('[AddEditLyrics] Already picking audio, ignoring duplicate call');
      return;
    }

    try {
      setIsPickingAudio(true);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        console.log('[AddEditLyrics] Audio picker canceled');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('[AddEditLyrics] Audio file selected:', file.name);
        setAudioUri(file.uri);
        
        // Get audio duration
        try {
          // Import dynamically to avoid cycle if any (though utils are safe)
          const { getAudioConverter } = require('../utils/audioConverter');
          const converter = getAudioConverter();
          const durationMs = await converter.getAudioDuration(file.uri);
          
          if (durationMs > 0) {
            const durationSec = Math.round(durationMs / 1000);
            setDurationText(formatTime(durationSec)); // Sets as MM:SS
            console.log(`[AddEditLyrics] Duration set to ${durationSec}s (${formatTime(durationSec)})`);
          }
        } catch (err) {
          console.warn('[AddEditLyrics] Failed to get audio duration:', err);
          // Non-fatal, user can still enter manually
        }
        
        Alert.alert(
          '✅ Audio File Selected',
          `${file.name}\n\nYou can now use Magic Timestamp!`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[AddEditLyrics] Audio picker error:', error);
      Alert.alert(
        'Error',
        'Failed to select audio file. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsPickingAudio(false);
    }
  };

  // ============================================================================
  // MAGIC TIMESTAMP HANDLERS
  // ============================================================================

  /**
   * MAGIC MODE: User provides lyrics, AI adds timestamps
   */
  const handleMagicMode = async () => {
    // Validate lyrics exist
    if (!lyricsText || lyricsText.trim().length === 0) {
      Alert.alert(
        'No Lyrics Found',
        'Please paste your lyrics in the text box first, then tap Magic Timestamp.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!audioUri) {
      Alert.alert('No Audio', 'Please select an audio file first.');
      return;
    }

    setIsProcessing(true);
    setProcessingStage('Starting Magic mode...');
    setShowModeSelector(false);

    try {
      const service = getAutoTimestampService();

      const result = await service.processAudio(
        audioUri,
        lyricsText,
        (stage, progress) => {
          setProcessingStage(stage);
          setProcessingProgress(progress);
        }
      );

      handleTimestampResult(result, 'Magic');

    } catch (error: any) {
      handleTimestampError(error);
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
      setProcessingProgress(0);
    }
  };
  /**
   * PURE MAGIC MODE: AI extracts lyrics + timestamps automatically
   */
  const handlePureMagicMode = async () => {
    if (!audioUri) {
      Alert.alert('No Audio', 'Please select an audio file first.');
      return;
    }

    // Confirm with user (this will overwrite existing lyrics)
    if (lyricsText && lyricsText.trim().length > 0) {
      Alert.alert(
        'Overwrite Existing Lyrics?',
        'Pure Magic will extract new lyrics from audio and replace your current text. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => executePureMagic()
          }
        ]
      );
    } else {
      executePureMagic();
    }
  };

  /**
   * Execute Pure Magic mode
   */
  const executePureMagic = async () => {
    setIsProcessing(true);
    setProcessingStage('Starting Pure Magic mode...');
    setShowModeSelector(false);

    try {
      const service = getAutoTimestampService();

      const result = await service.autoGenerateLyrics(
        audioUri!,
        (stage, progress) => {
          setProcessingStage(stage);
          setProcessingProgress(progress);
        }
      );

      handleTimestampResult(result, 'Pure Magic');

    } catch (error: any) {
      handleTimestampError(error);
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
      setProcessingProgress(0);
    }
  };

  /**
   * Handle successful timestamp result (both modes)
   */
  const handleTimestampResult = (result: AutoTimestampResult, mode: string) => {
    console.log(`${mode} complete:`, result);

    if (result.overallConfidence >= 0.8) {
      const mappedLyrics = result.lyrics.map((l, i) => ({ ...l, lineOrder: i }));
      applyTimestamps(mappedLyrics);

      Alert.alert(
        '✨ Excellent!',
        `${mode} timestamped ${result.successfulMatches}/${result.totalLines} lines.\n\n` +
        `Confidence: ${(result.overallConfidence * 100).toFixed(0)}%\n` +
        `Processing time: ${result.processingTime.toFixed(1)}s`,
        [{ text: 'Great!' }]
      );

    } else if (result.overallConfidence >= 0.6) {
      Alert.alert(
        '⚠️ Review Recommended',
        `Confidence: ${(result.overallConfidence * 100).toFixed(0)}%\n\n` +
        `${result.warnings.length} lines may need adjustment:\n` +
        result.warnings.slice(0, 2).join('\n') +
        (result.warnings.length > 2 ? `\n...and ${result.warnings.length - 2} more` : ''),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Use Anyway', onPress: () => applyTimestamps(result.lyrics.map((l, i) => ({ ...l, lineOrder: i }))) }
        ]
      );

    } else {
      Alert.alert(
        '❌ Low Accuracy',
        `Only ${(result.overallConfidence * 100).toFixed(0)}% confidence.\n\n` +
        'Possible reasons:\n' +
        '• Heavy background music\n' +
        '• Unclear vocals\n' +
        '• Lyrics don\'t match audio\n\n' +
        'Consider manual timestamping.',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Apply timestamps to lyrics text
   */
  const applyTimestamps = (timestampedLyrics: LyricLine[]) => {
    const rawText = timestampedLyrics
      .map(line => {
        if (line.timestamp > 0) {
          const mins = Math.floor(line.timestamp / 60);
          const secs = line.timestamp % 60;
          // Format seconds with 2 decimal places and leading zero if needed (e.g., 03.75)
          const formattedSecs = secs < 10 ? `0${secs.toFixed(2)}` : secs.toFixed(2);
          // Format minutes with leading zero (e.g., 02)
          const formattedMins = mins.toString().padStart(2, '0');
          return `[${formattedMins}:${formattedSecs}] ${line.text}`;
        } else {
          return `[NEEDS_REVIEW] ${line.text}`;
        }
      })
      .join('\n');

    setLyricsText(rawText);
  };

  /**
   * Handle timestamp errors
   */
  const handleTimestampError = (error: any) => {
    console.error('Timestamp error:', error);

    Alert.alert(
      'Error',
      `Auto-timestamp failed:\n${error.message}\n\n` +
      'Please try manual timestamping.',
      [{ text: 'OK' }]
    );
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
        audioUri: audioUri ?? undefined,
        separationStatus: 'none' as const,
        separationProgress: 0,
      } as Song;

      if (isEditing) {
        await updateSong(songData);
        // Reload lyrics in player if this song is currently playing
        const { currentSong: playingSong } = useSongsStore.getState();
        const { setLyrics: setPlayerLyrics } = usePlayerStore.getState();
        if (playingSong?.id === songData.id) {
          setPlayerLyrics(songData.lyrics, songData.duration);
        }
        // Update current song in songs store
        const { setCurrentSong } = useSongsStore.getState();
        setCurrentSong(songData);
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

        {/* Audio File Selection for Magic Timestamp */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MAGIC TIMESTAMP</Text>
          <Pressable 
            style={[
              styles.audioPickerButton,
              isPickingAudio && styles.audioPickerButtonDisabled
            ]}
            onPress={pickAudioFile}
            disabled={isPickingAudio}
          >
            <Ionicons 
              name={audioUri ? "musical-note" : "musical-notes-outline"} 
              size={20} 
              color={audioUri ? "#7C3AED" : "#888"} 
            />
            <Text style={[
              styles.audioPickerText,
              audioUri && styles.audioPickerTextActive
            ]}>
              {isPickingAudio ? "Selecting..." : (audioUri ? "✓ Audio File Selected" : "Select Audio File")}
            </Text>
            {audioUri && !isPickingAudio && (
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            )}
          </Pressable>
          {audioUri && (
            <Text style={styles.audioHint}>
              Tap the Magic button below to auto-timestamp your lyrics!
            </Text>
          )}
        </View>

          {/* Lyrics Input */}
          <View style={styles.lyricsSection}>
            <View style={styles.lyricsHeader}>
              <Text style={styles.lyricsLabel}>LYRICS</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Pressable 
                  onPress={() => setShowModeSelector(true)}
                  disabled={isProcessing}
                >
                  <LinearGradient
                    colors={['#8B5CF6', '#7C3AED', '#6D28D9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.magicButtonCircle}
                  >
                    <Ionicons name="sparkles" size={18} color="#fff" />
                  </LinearGradient>
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

        {/* Magic Timestamp Mode Selector Modal */}
        {/* Magic Timestamp Mode Selector Modal */}
        <MagicModeModal
          visible={showModeSelector}
          onClose={() => setShowModeSelector(false)}
          onMagicMode={handleMagicMode}
          onPureMagicMode={handlePureMagicMode}
        />

        {/* Processing Overlay */}
        <ProcessingOverlay
          isVisible={isProcessing}
          stage={processingStage}
          progress={processingProgress}
        />

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
  
  // ============================================================================
  // MAGIC TIMESTAMP STYLES
  // ============================================================================
  
  // Magic Button (Small version for header)
  magicButtonCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
  },
  magicButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
  },
  magicButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Audio Picker Styles
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  audioPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333',
  },
  audioPickerButtonDisabled: {
    opacity: 0.5,
  },
  audioPickerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#888',
  },
  audioPickerTextActive: {
    color: '#fff',
  },
  audioHint: {
    fontSize: 13,
    color: '#7C3AED',
    marginTop: 8,
    fontStyle: 'italic',
  },
});

export default AddEditLyricsScreen;
