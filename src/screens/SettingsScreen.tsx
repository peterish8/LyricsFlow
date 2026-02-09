/**
 * LyricFlow - Settings Screen
 * User preferences with iOS-style toggles
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TabScreenProps } from '../types/navigation';
import { useSettingsStore } from '../store/settingsStore';
import { AuroraHeader, GradientPicker } from '../components';
import { CustomAlert } from '../components/CustomAlert';
import { Colors } from '../constants/colors';
import { exportAllSongs, shareExportedFile, importSongsFromJson } from '../utils/exportImport';
import { clearAllData } from '../database/queries';
import { useSongsStore } from '../store/songsStore';
import { Alert } from 'react-native';
import { scanAudioFiles, convertAudioFileToSong } from '../services/mediaScanner';

type Props = TabScreenProps<'Settings'>;

const SettingsScreen: React.FC<Props> = () => {
  const settings = useSettingsStore();
  const { fetchSongs, addSong, songs, deleteSong } = useSongsStore();
  const [isImporting, setIsImporting] = React.useState(false);
  const [alertConfig, setAlertConfig] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: Array<{ text: string; onPress: () => void; style?: 'default' | 'cancel' | 'destructive' }>;
  }>({ visible: false, title: '', message: '', buttons: [] });

  const handleExport = async () => {
    try {
      const fileUri = await exportAllSongs();
      await shareExportedFile(fileUri);
    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert('Export Failed', 'Could not export songs.');
    }
  };

  const handleImport = async () => {
    try {
      const count = await importSongsFromJson();
      if (count > 0) {
        Alert.alert('Import Successful', `Imported ${count} songs.`);
        await fetchSongs();
      }
    } catch (error) {
       console.error('Import failed:', error);
       Alert.alert('Import Failed', 'Could not import songs. Check file format.');
    }
  };

  const handleClearData = () => {
    setAlertConfig({
      visible: true,
      title: '⚠️ Clear All Data',
      message: 'This will permanently delete all songs and lyrics. This action cannot be undone.',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              await fetchSongs();
              setAlertConfig({
                visible: true,
                title: '✅ Success',
                message: 'All data has been cleared.',
                buttons: [{ text: 'Done', onPress: () => {} }],
              });
            } catch (error) {
              setAlertConfig({
                visible: true,
                title: '❌ Error',
                message: 'Failed to clear data.',
                buttons: [{ text: 'OK', onPress: () => {} }],
              });
            }
          },
        },
      ],
    });
  };

  const handleClearImported = async () => {
    const importedSongs = songs.filter(s => s.audioUri);
    
    if (importedSongs.length === 0) {
      setAlertConfig({
        visible: true,
        title: 'ℹ️ No Imported Songs',
        message: 'There are no imported audio files to remove.',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
      return;
    }

    setAlertConfig({
      visible: true,
      title: '🗑️ Clear Imported Audio',
      message: `Remove ${importedSongs.length} imported audio files? Your manually created songs will be kept.`,
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: `Remove ${importedSongs.length} Songs`,
          style: 'destructive',
          onPress: async () => {
            try {
              for (const song of importedSongs) {
                await deleteSong(song.id);
              }
              setAlertConfig({
                visible: true,
                title: '✅ Removed',
                message: `Removed ${importedSongs.length} imported songs.`,
                buttons: [{ text: 'Done', onPress: () => {} }],
              });
            } catch (error) {
              setAlertConfig({
                visible: true,
                title: '❌ Error',
                message: 'Failed to remove imported songs.',
                buttons: [{ text: 'OK', onPress: () => {} }],
              });
            }
          },
        },
      ],
    });
  };

  const handleImportLocalAudio = async () => {
    try {
      setIsImporting(true);
      const audioFiles = await scanAudioFiles();
      
      if (audioFiles.length === 0) {
        Alert.alert('No Audio Files', 'No audio files found on your device.');
        setIsImporting(false);
        return;
      }

      // Show custom styled alert
      setAlertConfig({
        visible: true,
        title: '🎵 Audio Files Found',
        message: `Discovered ${audioFiles.length} songs on your device.\n\nImport all tracks to your library?`,
        buttons: [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setIsImporting(false),
          },
          {
            text: `Import ${audioFiles.length} Songs`,
            onPress: async () => {
              let imported = 0;
              for (const audioFile of audioFiles) {
                try {
                  const song = convertAudioFileToSong(audioFile);
                  await addSong(song);
                  imported++;
                } catch (error) {
                  console.error('Failed to import:', audioFile.filename, error);
                }
              }
              setIsImporting(false);
              setAlertConfig({
                visible: true,
                title: '✅ Import Complete',
                message: `Successfully imported ${imported} of ${audioFiles.length} songs to your library.`,
                buttons: [{ text: 'Done', onPress: () => {} }],
              });
            },
          },
        ],
      });
    } catch (error) {
      setIsImporting(false);
      console.error('Import failed:', error);
      Alert.alert('Import Failed', 'Could not access media library. Check permissions.');
    }
  };

  return (
    <View style={styles.container}>
      <AuroraHeader palette="settings" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Profile Section */}
          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={40} color={Colors.textSecondary} />
            </View>
            <Text style={styles.profileName}>LyricFlow User</Text>
            <Text style={styles.profileEmail}>Offline Mode</Text>
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <Pressable style={styles.quickAction} onPress={handleExport}>
              <Ionicons name="download-outline" size={28} color="#A78BFA" />
              <Text style={styles.quickActionText}>Export</Text>
            </Pressable>
            <Pressable style={styles.quickAction} onPress={handleImport}>
              <Ionicons name="cloud-upload-outline" size={28} color="#F472B6" />
              <Text style={styles.quickActionText}>Import</Text>
            </Pressable>
            <Pressable style={styles.quickAction}>
              <Ionicons name="time-outline" size={28} color="#60A5FA" />
              <Text style={styles.quickActionText}>History</Text>
            </Pressable>
          </View>

          {/* Settings Sections */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>APPEARANCE</Text>
            <SettingsRow
              icon="moon-outline"
              label="App Theme"
              value="Dark"
              onPress={() => {}}
            />
            <SettingsRow
              icon="text-outline"
              label="Lyrics Size"
              value={settings.lyricsFontSize.charAt(0).toUpperCase() + settings.lyricsFontSize.slice(1)}
              onPress={() => {}}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PLAYBACK</Text>
            <SettingsRowSwitch
              icon="play-outline"
              label="Auto-Scroll Lyrics"
              value={true}
              onToggle={() => {}}
            />
            <SettingsRowSwitch
              icon="sunny-outline"
              label="Keep Screen On"
              value={settings.keepScreenOn}
              onToggle={settings.setKeepScreenOn}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LIBRARY</Text>
            <SettingsRow
              icon="folder-outline"
              label={isImporting ? 'Importing...' : 'Import Local Audio'}
              value={isImporting ? '' : 'Tap to scan'}
              onPress={isImporting ? undefined : handleImportLocalAudio}
            />
            <SettingsRowSwitch
              icon="download-outline"
              label="Show Thumbnails"
              value={settings.showThumbnails}
              onToggle={settings.setShowThumbnails}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DATA</Text>
            <SettingsRow
              icon="close-circle-outline"
              label="Clear Imported Audio"
              onPress={handleClearImported}
            />
            <SettingsRow
              icon="trash-outline"
              label="Clear All Data"
              onPress={handleClearData}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ABOUT</Text>
            <SettingsRow
              icon="information-circle-outline"
              label="Version"
              value="1.0.0"
              showChevron={false}
            />
            <SettingsRow
              icon="shield-outline"
              label="Privacy Policy"
              onPress={() => {}}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
      
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      />
    </View>
  );
};

// Settings Row Component
interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
}) => (
  <Pressable style={styles.settingsRow} onPress={onPress}>
    <Ionicons name={icon} size={24} color={Colors.textSecondary} />
    <Text style={styles.settingsLabel}>{label}</Text>
    <View style={styles.settingsValue}>
      {value && <Text style={styles.settingsValueText}>{value}</Text>}
      {showChevron && (
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      )}
    </View>
  </Pressable>
);

// Settings Row with Switch
interface SettingsRowSwitchProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
}

const SettingsRowSwitch: React.FC<SettingsRowSwitchProps> = ({
  icon,
  label,
  value,
  onToggle,
}) => (
  <View style={styles.settingsRow}>
    <Ionicons name={icon} size={24} color={Colors.textSecondary} />
    <Text style={styles.settingsLabel}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onToggle}
      trackColor={{ false: '#39393D', true: '#34C759' }}
      thumbColor="#fff"
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  quickAction: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    gap: 12,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
    paddingLeft: 4,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(44,44,46,0.5)',
    gap: 16,
  },
  settingsLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  settingsValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingsValueText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});

export default SettingsScreen;
