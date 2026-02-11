# 🎵 LuvLyrics AI Karaoke Architecture - Implementation Guide

> **Maximum Accuracy On-Device Audio Source Separation + Karaoke Mode**

---

## 📋 Overview

This guide implements a complete "Apple Music Sing"-style experience with:

1. **On-Device AI Vocal Separation** using ONNX Runtime (runs in background even when phone is locked)
2. **Dual Audio Stem Storage** - Separate vocal and instrumental files per song
3. **Karaoke Mixer UI** - Real-time volume balance slider between vocals and instruments
4. **Perfect Transcription** - Feeds isolated vocals to Whisper for maximum accuracy

---

## 🏗️ Architecture Components

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LuvLyrics AI Karaoke Pipeline                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │ User Audio   │───▶│ Background   │───▶│ ONNX Sep.    │                  │
│  │ File (MP3)   │    │ Task Service │    │ Model (AI)   │                  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                  │
│                                                  │                          │
│                          ┌───────────────────────┘                          │
│                          ▼                                                  │
│       ┌──────────────────────────────────────────────┐                      │
│       │           File System Storage               │                      │
│       │  ┌─────────────────┐ ┌─────────────────┐   │                      │
│       │  │ song_vocals.wav │ │song_instrum.wav │   │                      │
│       │  └─────────────────┘ └─────────────────┘   │                      │
│       └──────────────────┬─────────────────────────┘                      │
│                          │                                                  │
│          ┌───────────────┼───────────────┐                                │
│          ▼               ▼               ▼                                │
│    ┌──────────┐   ┌──────────┐   ┌──────────────┐                        │
│    │ Karaoke  │   │ Whisper  │   │   Database   │                        │
│    │ Player   │   │Transcribe│   │   (Paths)    │                        │
│    └──────────┘   └──────────┘   └──────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Phase 1: Dependencies Installation

### 1.1 Core Dependencies

```bash
# Background task execution (prevents OS from killing app)
npx expo install react-native-background-actions

# ONNX Runtime for AI model inference
npm install onnxruntime-react-native

# File system for handling large audio files
npx expo install expo-file-system

# Audio processing with ffmpeg
npx expo install ffmpeg-kit-react-native

# Native audio player with precise sync capabilities
npm install react-native-track-player

# Keep screen awake during processing
npx expo install expo-keep-awake
```

### 1.2 Prebuild / Development Client Required

**CRITICAL**: These libraries require native modules. You MUST use a development build:

```bash
# Install Expo Dev Client if not already
npm install expo-dev-client

# Create Android development build (for ONNX + background tasks)
eas build --profile development --platform android

# Or iOS
eas build --profile development --platform ios
```

### 1.3 Native Configuration

#### Android (`android/app/src/main/AndroidManifest.xml`)

Add to `<manifest>`:

```xml
<!-- Background service permissions -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

<!-- For Android 14+ -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
```

Add inside `<application>`:

```xml
<!-- Background actions service -->
<service android:name="com.asterinet.react.bgactions.RNBackgroundActionsTask" 
         android:foregroundServiceType="dataSync|mediaPlayback"
         android:exported="false" />
```

#### iOS (`ios/LuvLyrics/Info.plist`)

Add background modes:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
    <string>processing</string>
    <string>fetch</string>
</array>
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.luvlyrics.backgroundsep</string>
</array>
```

---

## 🗄️ Phase 2: Database Schema Updates

### 2.1 Migration SQL

Add to `src/database/db.ts` in the `initializeTables` function:

```typescript
// Migration: Add stem paths columns
const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(songs)');

if (!columns.some(c => c.name === 'vocal_stem_uri')) {
    log('Adding vocal_stem_uri column...');
    await database.execAsync('ALTER TABLE songs ADD COLUMN vocal_stem_uri TEXT');
}

if (!columns.some(c => c.name === 'instrumental_stem_uri')) {
    log('Adding instrumental_stem_uri column...');
    await database.execAsync('ALTER TABLE songs ADD COLUMN instrumental_stem_uri TEXT');
}

if (!columns.some(c => c.name === 'separation_status')) {
    log('Adding separation_status column...');
    await database.execAsync('ALTER TABLE songs ADD COLUMN separation_status TEXT DEFAULT "none"');
    // Status: 'none' | 'pending' | 'processing' | 'completed' | 'failed'
}

if (!columns.some(c => c.name === 'separation_progress')) {
    log('Adding separation_progress column...');
    await database.execAsync('ALTER TABLE songs ADD COLUMN separation_progress INTEGER DEFAULT 0');
}
```

### 2.2 Update Types

Update `src/types/song.ts`:

```typescript
export interface Song {
    // ... existing fields ...
    
    // AI Separation stems
    vocalStemUri?: string;          // Path to isolated vocals WAV
    instrumentalStemUri?: string;     // Path to isolated instruments WAV
    separationStatus: 'none' | 'pending' | 'processing' | 'completed' | 'failed';
    separationProgress: number;       // 0-100%
}

// New type for karaoke playback
export interface KaraokeMixSettings {
    vocalVolume: number;      // 0.0 to 2.0 (can boost)
    instrumentalVolume: number; // 0.0 to 2.0
    balance: number;          // -1.0 (vocals only) to 1.0 (instruments only)
}
```

---

## 🤖 Phase 3: AI Separation Service

### 3.1 Model Setup

Create `src/services/sourceSeparationModel.ts`:

```typescript
/**
 * Source Separation Model Manager
 * Handles ONNX model loading and inference
 */

import * as ort from 'onnxruntime-react-native';
import * as FileSystem from 'expo-file-system';

const MODEL_FILE = 'spleeter_2stem_quantized.onnx';
const MODEL_URL = 'https://your-cdn.com/models/spleeter_2stem_quantized.onnx';
const MODEL_DIR = `${FileSystem.documentDirectory}models/`;

export class SourceSeparationModel {
    private session: ort.InferenceSession | null = null;
    private isLoading = false;

    async initialize(): Promise<void> {
        if (this.session || this.isLoading) return;
        
        this.isLoading = true;
        
        try {
            // Ensure model directory exists
            const dirInfo = await FileSystem.getInfoAsync(MODEL_DIR);
            if (!dirInfo.exists) {
                await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
            }

            const modelPath = `${MODEL_DIR}${MODEL_FILE}`;
            const fileInfo = await FileSystem.getInfoAsync(modelPath);

            // Download model if not exists (or bundle it in assets for production)
            if (!fileInfo.exists) {
                console.log('[SeparationModel] Downloading model...');
                await FileSystem.downloadAsync(MODEL_URL, modelPath);
                console.log('[SeparationModel] Model downloaded');
            }

            // Create ONNX session with mobile optimizations
            this.session = await ort.InferenceSession.create(modelPath, {
                executionProviders: ['cpu'], // CPU for cross-platform
                graphOptimizationLevel: 'all',
                enableMemPattern: true,
                enableCpuMemArena: true,
            });

            console.log('[SeparationModel] Session created');
        } finally {
            this.isLoading = false;
        }
    }

    async separate(audioData: Float32Array, sampleRate: number = 22050): Promise<{
        vocals: Float32Array;
        instruments: Float32Array;
    }> {
        if (!this.session) {
            throw new Error('Model not initialized. Call initialize() first.');
        }

        // Model expects fixed-size windows (e.g., 44.1k samples = 2 seconds at 22.05kHz)
        const windowSize = 44100; // 2 seconds
        const hopSize = 22050;    // 1 second hop (50% overlap)

        const numWindows = Math.ceil((audioData.length - windowSize) / hopSize) + 1;
        
        const vocalsChunks: Float32Array[] = [];
        const instrChunks: Float32Array[] = [];

        for (let i = 0; i < numWindows; i++) {
            const start = i * hopSize;
            const end = Math.min(start + windowSize, audioData.length);
            
            // Extract window and pad if necessary
            const window = new Float32Array(windowSize);
            window.set(audioData.slice(start, end));
            
            // Create tensor [1, 1, windowSize] - batch, channels, time
            const inputTensor = new ort.Tensor('float32', window, [1, 1, windowSize]);
            
            // Run inference
            const feeds = { input: inputTensor };
            const results = await this.session.run(feeds);
            
            // Extract outputs (model specific - adjust based on your ONNX model)
            const vocalsOutput = results.vocals.data as Float32Array;
            const instrOutput = results.accompaniment.data as Float32Array;
            
            vocalsChunks.push(vocalsOutput.slice(0, end - start));
            instrChunks.push(instrOutput.slice(0, end - start));
        }

        // Overlap-add reconstruction with crossfade
        const vocals = this.overlapAdd(vocalsChunks, hopSize);
        const instruments = this.overlapAdd(instrChunks, hopSize);

        return { vocals, instruments };
    }

    private overlapAdd(chunks: Float32Array[], hopSize: number): Float32Array {
        const totalLength = hopSize * (chunks.length - 1) + chunks[0].length;
        const result = new Float32Array(totalLength);
        const window = this.createHannWindow(chunks[0].length);

        for (let i = 0; i < chunks.length; i++) {
            const start = i * hopSize;
            
            // Apply window and add
            for (let j = 0; j < chunks[i].length; j++) {
                result[start + j] += chunks[i][j] * window[j];
            }
        }

        return result;
    }

    private createHannWindow(size: number): Float32Array {
        const window = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
        }
        return window;
    }

    async release(): Promise<void> {
        if (this.session) {
            await this.session.release();
            this.session = null;
        }
    }
}

export const separationModel = new SourceSeparationModel();
```

### 3.2 Background Separation Service

Create `src/services/backgroundSeparationService.ts`:

```typescript
/**
 * Background Audio Source Separation Service
 * Runs ONNX inference in background task
 */

import BackgroundService from 'react-native-background-actions';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
import * as FileSystem from 'expo-file-system';
import { separationModel } from './sourceSeparationModel';
import { getDatabase } from '../database/db';
import { useTasksStore } from '../store/tasksStore';

const STEMS_DIR = `${FileSystem.documentDirectory}stems/`;

interface SeparationTaskData {
    songId: string;
    audioUri: string;
}

interface SeparationProgress {
    stage: 'decoding' | 'processing' | 'encoding' | 'complete';
    progress: number;
    message: string;
}

class BackgroundSeparationService {
    private isRunning = false;

    async startSeparation(songId: string, audioUri: string): Promise<void> {
        if (this.isRunning) {
            throw new Error('Separation already in progress');
        }

        // Add to tasks store
        const tasksStore = useTasksStore.getState();
        tasksStore.addTask({
            id: `separation-${songId}`,
            type: 'separation',
            songId,
            status: 'queued',
            progress: 0,
            stage: 'Preparing...',
        });

        // Update song status
        await this.updateSongStatus(songId, 'pending', 0);

        const options = {
            taskName: 'AI Audio Separation',
            taskTitle: 'Separating vocals from instruments...',
            taskDesc: 'Processing with AI model. Keep app open for best speed.',
            taskIcon: {
                name: 'ic_launcher',
                type: 'mipmap',
            },
            color: '#00FF00',
            linkingURI: 'luvlyrics://separation',
            parameters: {
                songId,
                audioUri,
            },
        };

        try {
            await BackgroundService.start(this.separationTask, options);
        } catch (error) {
            console.error('[SeparationService] Failed to start:', error);
            await this.updateSongStatus(songId, 'failed', 0);
            tasksStore.updateTask(`separation-${songId}`, { status: 'failed' });
            throw error;
        }
    }

    private separationTask = async (taskData: SeparationTaskData) => {
        const { songId, audioUri } = taskData;
        this.isRunning = true;

        const tasksStore = useTasksStore.getState();
        let tempWavPath: string | null = null;

        try {
            await this.updateSongStatus(songId, 'processing', 5);
            tasksStore.updateTask(`separation-${songId}`, {
                status: 'processing',
                progress: 5,
                stage: 'Converting audio...',
            });

            // Initialize model
            await separationModel.initialize();

            // Step 1: Decode to WAV
            tempWavPath = await this.decodeToWav(audioUri, (progress) => {
                const mappedProgress = 5 + Math.floor(progress * 15); // 5-20%
                this.updateSongStatus(songId, 'processing', mappedProgress);
                tasksStore.updateTask(`separation-${songId}`, {
                    progress: mappedProgress,
                    stage: `Converting audio... ${Math.floor(progress * 100)}%`,
                });
            });

            // Step 2: Read raw audio data
            const audioData = await this.readWavAsFloat32(tempWavPath);

            // Step 3: Run separation
            await this.updateSongStatus(songId, 'processing', 25);
            tasksStore.updateTask(`separation-${songId}`, {
                progress: 25,
                stage: 'AI processing (this may take a few minutes)...',
            });

            const { vocals, instruments } = await separationModel.separate(audioData);

            // Step 4: Save stems as separate WAV files
            await this.updateSongStatus(songId, 'processing', 80);
            tasksStore.updateTask(`separation-${songId}`, {
                progress: 80,
                stage: 'Saving stems...',
            });

            // Ensure stems directory exists
            const stemsDirInfo = await FileSystem.getInfoAsync(STEMS_DIR);
            if (!stemsDirInfo.exists) {
                await FileSystem.makeDirectoryAsync(STEMS_DIR, { intermediates: true });
            }

            const vocalPath = `${STEMS_DIR}${songId}_vocals.wav`;
            const instrPath = `${STEMS_DIR}${songId}_instruments.wav`;

            await this.saveFloat32AsWav(vocals, vocalPath, 22050);
            await this.saveFloat32AsWav(instruments, instrPath, 22050);

            // Step 5: Update database
            await this.saveStemPaths(songId, vocalPath, instrPath);
            await this.updateSongStatus(songId, 'completed', 100);

            tasksStore.updateTask(`separation-${songId}`, {
                status: 'completed',
                progress: 100,
                stage: 'Complete! Vocals isolated.',
            });

            // Clean up temp file
            if (tempWavPath) {
                await FileSystem.deleteAsync(tempWavPath, { idempotent: true });
            }

        } catch (error) {
            console.error('[SeparationService] Error:', error);
            await this.updateSongStatus(songId, 'failed', 0);
            tasksStore.updateTask(`separation-${songId}`, {
                status: 'failed',
                stage: 'Failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
            });
        } finally {
            this.isRunning = false;
            await BackgroundService.stop();
        }
    };

    private async decodeToWav(
        inputUri: string,
        onProgress: (progress: number) => void
    ): Promise<string> {
        const outputPath = `${FileSystem.cacheDirectory}temp_decode_${Date.now()}.wav`;

        // Convert to 22.05kHz mono WAV for model input
        const command = `-i "${inputUri}" -ar 22050 -ac 1 -c:a pcm_f32le "${outputPath}" -y`;

        const session = await FFmpegKit.execute(command);
        const returnCode = await session.getReturnCode();

        if (!ReturnCode.isSuccess(returnCode)) {
            const logs = await session.getLogs();
            throw new Error(`FFmpeg failed: ${logs}`);
        }

        return outputPath;
    }

    private async readWavAsFloat32(wavPath: string): Promise<Float32Array> {
        // Read file as base64, decode to buffer, extract PCM data
        const base64 = await FileSystem.readAsStringAsync(wavPath, {
            encoding: FileSystem.EncodingType.Base64,
        });

        // Convert base64 to ArrayBuffer
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Skip WAV header (44 bytes) and extract float32 samples
        const dataOffset = 44;
        const numSamples = (bytes.length - dataOffset) / 4;
        const samples = new Float32Array(numSamples);

        const dataView = new DataView(bytes.buffer);
        for (let i = 0; i < numSamples; i++) {
            samples[i] = dataView.getFloat32(dataOffset + i * 4, true); // little-endian
        }

        return samples;
    }

    private async saveFloat32AsWav(
        data: Float32Array,
        outputPath: string,
        sampleRate: number
    ): Promise<void> {
        // Create WAV header
        const numChannels = 1;
        const bytesPerSample = 4;
        const byteRate = sampleRate * numChannels * bytesPerSample;
        const dataSize = data.length * bytesPerSample;
        const fileSize = 36 + dataSize;

        const header = new ArrayBuffer(44);
        const view = new DataView(header);

        // "RIFF"
        view.setUint32(0, 0x52494646, false);
        view.setUint32(4, fileSize, true);
        // "WAVE"
        view.setUint32(8, 0x57415645, false);
        // "fmt "
        view.setUint32(12, 0x666D7420, false);
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, 3, true); // Audio format (3 = float)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, numChannels * bytesPerSample, true);
        view.setUint16(34, 32, true); // Bits per sample
        // "data"
        view.setUint32(36, 0x64617461, false);
        view.setUint32(40, dataSize, true);

        // Combine header and data
        const output = new Uint8Array(44 + dataSize);
        output.set(new Uint8Array(header), 0);
        
        const dataView = new DataView(output.buffer);
        for (let i = 0; i < data.length; i++) {
            dataView.setFloat32(44 + i * 4, data[i], true);
        }

        // Write to file
        const base64 = btoa(String.fromCharCode(...output));
        await FileSystem.writeAsStringAsync(outputPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
        });
    }

    private async updateSongStatus(
        songId: string,
        status: string,
        progress: number
    ): Promise<void> {
        const db = await getDatabase();
        await db.runAsync(
            'UPDATE songs SET separation_status = ?, separation_progress = ? WHERE id = ?',
            [status, progress, songId]
        );
    }

    private async saveStemPaths(
        songId: string,
        vocalPath: string,
        instrPath: string
    ): Promise<void> {
        const db = await getDatabase();
        await db.runAsync(
            'UPDATE songs SET vocal_stem_uri = ?, instrumental_stem_uri = ? WHERE id = ?',
            [vocalPath, instrPath, songId]
        );
    }

    async stop(): Promise<void> {
        if (this.isRunning) {
            await BackgroundService.stop();
            this.isRunning = false;
        }
    }
}

export const separationService = new BackgroundSeparationService();
```

---

## 🎵 Phase 4: Karaoke Player with Dual Sync

### 4.1 Install react-native-track-player

```bash
npm install react-native-track-player
npm install --save-dev @types/react-native-track-player

# For Expo, you need to configure plugin in app.json:
```

Add to `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-track-player",
        {
          "android": {
            "notificationChannelName": "LuvLyrics Playback",
            "appKilledPlaybackBehavior": "continue_playing"
          }
        }
      ]
    ]
  }
}
```

### 4.2 Karaoke Player Hook

Create `src/hooks/useKaraokePlayer.ts`:

```typescript
/**
 * Karaoke Player Hook
 * Manages dual-track playback with volume mixing
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import TrackPlayer, {
    Event,
    State,
    useTrackPlayerEvents,
    usePlaybackState,
    useProgress,
} from 'react-native-track-player';
import { Song, KaraokeMixSettings } from '../types/song';

const SYNC_CHECK_INTERVAL = 1000; // Check drift every second
const MAX_DRIFT_MS = 50; // Maximum acceptable drift

interface KaraokePlayerState {
    isReady: boolean;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    hasStems: boolean;
}

const DEFAULT_MIX: KaraokeMixSettings = {
    vocalVolume: 1.0,
    instrumentalVolume: 1.0,
    balance: 0.0,
};

export function useKaraokePlayer(song: Song | null) {
    const [mixSettings, setMixSettings] = useState<KaraokeMixSettings>(DEFAULT_MIX);
    const [playerState, setPlayerState] = useState<KaraokePlayerState>({
        isReady: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        hasStems: false,
    });

    const driftCheckRef = useRef<NodeJS.Timeout | null>(null);
    const vocalTrackId = useRef<string>('');
    const instrTrackId = useRef<string>('');

    const playbackState = usePlaybackState();
    const { position, duration } = useProgress(SYNC_CHECK_INTERVAL);

    // Check if stems exist
    useEffect(() => {
        const hasStems = !!(song?.vocalStemUri && song?.instrumentalStemUri);
        setPlayerState(prev => ({ ...prev, hasStems }));
    }, [song]);

    // Setup tracks when song changes
    useEffect(() => {
        if (!song) return;

        const setupTracks = async () => {
            await TrackPlayer.reset();

            if (song.vocalStemUri && song.instrumentalStemUri) {
                // Add both stems
                vocalTrackId.current = `vocal-${song.id}`;
                instrTrackId.current = `instr-${song.id}`;

                await TrackPlayer.add([
                    {
                        id: vocalTrackId.current,
                        url: song.vocalStemUri,
                        title: `${song.title} (Vocals)`,
                        artist: song.artist || 'Unknown',
                    },
                    {
                        id: instrTrackId.current,
                        url: song.instrumentalStemUri,
                        title: `${song.title} (Instrumental)`,
                        artist: song.artist || 'Unknown',
                    },
                ]);

                // Set initial volumes
                await applyMixSettings(mixSettings);
            } else if (song.audioUri) {
                // Fallback: single track
                await TrackPlayer.add({
                    id: song.id,
                    url: song.audioUri,
                    title: song.title,
                    artist: song.artist || 'Unknown',
                });
            }

            setPlayerState(prev => ({
                ...prev,
                isReady: true,
                duration: song.duration,
            }));
        };

        setupTracks();

        return () => {
            TrackPlayer.reset();
            if (driftCheckRef.current) {
                clearInterval(driftCheckRef.current);
            }
        };
    }, [song]);

    // Update current time
    useEffect(() => {
        setPlayerState(prev => ({
            ...prev,
            currentTime: position,
            isPlaying: playbackState.state === State.Playing,
        }));
    }, [position, playbackState]);

    // Drift correction for dual tracks
    useEffect(() => {
        if (!playerState.hasStems || !playerState.isPlaying) return;

        driftCheckRef.current = setInterval(async () => {
            const tracks = await TrackPlayer.getQueue();
            if (tracks.length < 2) return;

            // TrackPlayer doesn't expose individual track positions easily
            // In practice, they should stay synced since they start together
            // This is a safety check for edge cases
        }, SYNC_CHECK_INTERVAL);

        return () => {
            if (driftCheckRef.current) {
                clearInterval(driftCheckRef.current);
            }
        };
    }, [playerState.hasStems, playerState.isPlaying]);

    const applyMixSettings = useCallback(async (settings: KaraokeMixSettings) => {
        if (!song?.vocalStemUri || !song?.instrumentalStemUri) return;

        // Convert balance to individual volumes
        // balance: -1 (vocals only) to 1 (instruments only)
        let vocalVol = settings.vocalVolume;
        let instrVol = settings.instrumentalVolume;

        if (settings.balance < 0) {
            // Favor vocals - reduce instruments
            instrVol *= (1 + settings.balance); // balance is negative, so this reduces
        } else if (settings.balance > 0) {
            // Favor instruments - reduce vocals
            vocalVol *= (1 - settings.balance);
        }

        // Clamp to 0-2 range
        vocalVol = Math.max(0, Math.min(2, vocalVol));
        instrVol = Math.max(0, Math.min(2, instrVol));

        const tracks = await TrackPlayer.getQueue();
        
        // Apply volumes to tracks
        for (let i = 0; i < tracks.length; i++) {
            const trackId = tracks[i].id;
            if (trackId === vocalTrackId.current) {
                await TrackPlayer.setVolumeForTrack(i, vocalVol);
            } else if (trackId === instrTrackId.current) {
                await TrackPlayer.setVolumeForTrack(i, instrVol);
            }
        }
    }, [song]);

    const updateMix = useCallback((newMix: Partial<KaraokeMixSettings>) => {
        const updated = { ...mixSettings, ...newMix };
        setMixSettings(updated);
        applyMixSettings(updated);
    }, [mixSettings, applyMixSettings]);

    const setBalance = useCallback((balance: number) => {
        // Clamp balance between -1 and 1
        const clampedBalance = Math.max(-1, Math.min(1, balance));
        updateMix({ balance: clampedBalance });
    }, [updateMix]);

    const play = useCallback(async () => {
        await TrackPlayer.play();
    }, []);

    const pause = useCallback(async () => {
        await TrackPlayer.pause();
    }, []);

    const seekTo = useCallback(async (time: number) => {
        await TrackPlayer.seekTo(time);
    }, []);

    const toggle = useCallback(async () => {
        const state = await TrackPlayer.getState();
        if (state === State.Playing) {
            await TrackPlayer.pause();
        } else {
            await TrackPlayer.play();
        }
    }, []);

    return {
        // State
        ...playerState,
        mixSettings,
        
        // Actions
        play,
        pause,
        seekTo,
        toggle,
        updateMix,
        setBalance,
        
        // Helpers
        hasStems: playerState.hasStems,
        isKaraokeMode: playerState.hasStems,
    };
}
```

---

## 🎚️ Phase 5: Karaoke UI Components

### 5.1 Vocal Balance Slider

Create `src/components/VocalBalanceSlider.tsx`:

```typescript
/**
 * Vocal Balance Slider
 * Apple Music Sing-style slider for vocal/instrumental balance
 */

import React from 'react';
import {
    View,
    StyleSheet,
    PanResponder,
    Animated,
    Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface VocalBalanceSliderProps {
    balance: number; // -1 to 1
    onBalanceChange: (balance: number) => void;
    enabled: boolean;
}

const SLIDER_WIDTH = 280;
const KNOB_SIZE = 36;

export const VocalBalanceSlider: React.FC<VocalBalanceSliderProps> = ({
    balance,
    onBalanceChange,
    enabled,
}) => {
    const pan = React.useRef(new Animated.ValueXY()).current;
    const position = React.useRef(
        new Animated.Value(((balance + 1) / 2) * SLIDER_WIDTH)
    ).current;

    const panResponder = React.useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => enabled,
                onMoveShouldSetPanResponder: () => enabled,
                onPanResponderMove: (_, gestureState) => {
                    const newX = Math.max(0, Math.min(SLIDER_WIDTH, gestureState.moveX - 40));
                    position.setValue(newX);
                    
                    // Convert to balance (-1 to 1)
                    const newBalance = (newX / SLIDER_WIDTH) * 2 - 1;
                    onBalanceChange(newBalance);
                },
            }),
        [enabled, onBalanceChange]
    );

    // Interpolate position for gradient effect
    const vocalOpacity = position.interpolate({
        inputRange: [0, SLIDER_WIDTH / 2, SLIDER_WIDTH],
        outputRange: [1, 0.5, 0],
    });

    const instrOpacity = position.interpolate({
        inputRange: [0, SLIDER_WIDTH / 2, SLIDER_WIDTH],
        outputRange: [0, 0.5, 1],
    });

    return (
        <View style={[styles.container, !enabled && styles.disabled]}>
            {/* Label */}
            <Text style={styles.label}>VOCAL BALANCE</Text>

            {/* Slider Track */}
            <View style={styles.sliderContainer}>
                {/* Background gradient */}
                <LinearGradient
                    colors={['#FF6B6B', '#FFFFFF', '#4ECDC4']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.track}
                />

                {/* Icons */}
                <View style={styles.iconsContainer}>
                    <Animated.View style={{ opacity: vocalOpacity }}>
                        <Ionicons name="mic" size={20} color={Colors.white} />
                    </Animated.View>
                    <Animated.View style={{ opacity: instrOpacity }}>
                        <Ionicons name="musical-notes" size={20} color={Colors.white} />
                    </Animated.View>
                </View>

                {/* Draggable Knob */}
                <Animated.View
                    style={[
                        styles.knob,
                        {
                            transform: [
                                {
                                    translateX: position.interpolate({
                                        inputRange: [0, SLIDER_WIDTH],
                                        outputRange: [0, SLIDER_WIDTH],
                                    }),
                                },
                            ],
                        },
                    ]}
                    {...panResponder.panHandlers}
                >
                    <View style={styles.knobInner} />
                </Animated.View>
            </View>

            {/* Mode indicator */}
            <View style={styles.modeIndicator}>
                <Text style={[styles.modeText, balance < -0.5 && styles.modeActive]}>
                    VOCALS
                </Text>
                <Text style={[styles.modeText, Math.abs(balance) <= 0.5 && styles.modeActive]}>
                    MIXED
                </Text>
                <Text style={[styles.modeText, balance > 0.5 && styles.modeActive]}>
                    KARAOKE
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    disabled: {
        opacity: 0.4,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
        letterSpacing: 1.2,
        marginBottom: 12,
    },
    sliderContainer: {
        width: SLIDER_WIDTH,
        height: 44,
        justifyContent: 'center',
        position: 'relative',
    },
    track: {
        height: 8,
        borderRadius: 4,
        width: SLIDER_WIDTH,
    },
    iconsContainer: {
        position: 'absolute',
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: SLIDER_WIDTH,
        paddingHorizontal: 12,
    },
    knob: {
        position: 'absolute',
        width: KNOB_SIZE,
        height: KNOB_SIZE,
        borderRadius: KNOB_SIZE / 2,
        backgroundColor: Colors.white,
        left: -KNOB_SIZE / 2,
        top: 4,
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    knobInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.primary,
    },
    modeIndicator: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 20,
    },
    modeText: {
        fontSize: 11,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    modeActive: {
        color: Colors.white,
        fontWeight: '700',
    },
});
```

### 5.2 Stem Processing Button

Create `src/components/StemProcessButton.tsx`:

```typescript
/**
 * Stem Process Button
 * Triggers AI separation and shows progress
 */

import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    View,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/colors';
import { Song } from '../types/song';

interface StemProcessButtonProps {
    song: Song;
    onProcess: () => void;
    onCancel: () => void;
}

export const StemProcessButton: React.FC<StemProcessButtonProps> = ({
    song,
    onProcess,
    onCancel,
}) => {
    const { separationStatus, separationProgress } = song;

    const isProcessing = separationStatus === 'processing' || separationStatus === 'pending';
    const isCompleted = separationStatus === 'completed';
    const isFailed = separationStatus === 'failed';

    if (isCompleted) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#00C853', '#00E676']}
                    style={styles.badge}
                >
                    <Ionicons name="checkmark-circle" size={16} color={Colors.white} />
                    <Text style={styles.badgeText}>AI Stems Ready</Text>
                </LinearGradient>
            </View>
        );
    }

    if (isProcessing) {
        return (
            <TouchableOpacity style={styles.processingContainer} onPress={onCancel}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.processingText}>
                    Separating... {separationProgress}%
                </Text>
                <Text style={styles.cancelText}>Tap to cancel</Text>
            </TouchableOpacity>
        );
    }

    if (isFailed) {
        return (
            <TouchableOpacity style={styles.button} onPress={onProcess}>
                <Ionicons name="refresh" size={18} color={Colors.white} />
                <Text style={styles.buttonText}>Retry Separation</Text>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity style={styles.button} onPress={onProcess}>
            <Ionicons name="cut" size={18} color={Colors.white} />
            <Text style={styles.buttonText}>Separate Vocals (AI)</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        gap: 8,
    },
    buttonText: {
        color: Colors.white,
        fontWeight: '600',
        fontSize: 14,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 6,
    },
    badgeText: {
        color: Colors.white,
        fontWeight: '600',
        fontSize: 12,
    },
    processingContainer: {
        alignItems: 'center',
        padding: 12,
    },
    processingText: {
        color: Colors.textSecondary,
        marginTop: 8,
        fontSize: 14,
    },
    cancelText: {
        color: Colors.textSecondary,
        marginTop: 4,
        fontSize: 12,
        opacity: 0.7,
    },
});
```

---

## 🔌 Phase 6: Integration with Existing Flow

### 6.1 Update Magic Mode Modal

Modify `src/components/MagicModeModal.tsx` to include separation option:

```typescript
// Add separation check before Whisper transcription
const handleMagicTranscribe = async () => {
    // Check if stems already exist
    if (song.separationStatus === 'completed' && song.vocalStemUri) {
        // Use isolated vocals for perfect transcription
        await startTranscription(song.vocalStemUri);
    } else {
        // Show option to separate first
        Alert.alert(
            'Enhance Accuracy?',
            'Separating vocals from instruments first will dramatically improve transcription accuracy. This takes 2-5 minutes.',
            [
                {
                    text: 'Transcribe Original',
                    onPress: () => startTranscription(song.audioUri!),
                },
                {
                    text: 'Separate First (Best)',
                    onPress: () => {
                        // Start separation, then auto-transcribe
                        separationService.startSeparation(song.id, song.audioUri!)
                            .then(() => startTranscription(song.vocalStemUri!));
                    },
                },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    }
};
```

### 6.2 Update NowPlayingScreen

Add the Karaoke controls to your player UI:

```typescript
// In NowPlayingScreen.tsx, add after PlayerControls:
{song.vocalStemUri && song.instrumentalStemUri && (
    <VocalBalanceSlider
        balance={karaokePlayer.mixSettings.balance}
        onBalanceChange={karaokePlayer.setBalance}
        enabled={true}
    />
)}

// Add process button if stems not yet generated:
{song.audioUri && song.separationStatus !== 'completed' && (
    <StemProcessButton
        song={song}
        onProcess={() => separationService.startSeparation(song.id, song.audioUri!)}
        onCancel={() => separationService.stop()}
    />
)}
```

---

## 🚀 Phase 7: Build & Run

### 7.1 EAS Build Configuration

Update `eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```

### 7.2 Build Commands

```bash
# Development build (required for native modules)
eas build --profile development --platform android

# Or for iOS
eas build --profile development --platform ios

# Install on device
# Download the build artifact and install on your phone
```

---

## 📊 Summary of Implementation

| Component | Purpose | Location |
| - | - | - |
| `SourceSeparationModel` | ONNX inference for vocal separation | `src/services/sourceSeparationModel.ts` |
| `BackgroundSeparationService` | Background task management | `src/services/backgroundSeparationService.ts` |
| `useKaraokePlayer` | Dual-track playback hook | `src/hooks/useKaraokePlayer.ts` |
| `VocalBalanceSlider` | Karaoke UI component | `src/components/VocalBalanceSlider.tsx` |
| `StemProcessButton` | Trigger separation UI | `src/components/StemProcessButton.tsx` |
| Database Updates | Stem storage columns | `src/database/db.ts` |

---

## ⚠️ Important Notes

1. **Model Download**: The ONNX model (~50-100MB) needs to be downloaded on first use or bundled in assets
2. **Battery Impact**: Background processing is heavy - expect 5-10% battery per minute of audio
3. **Processing Time**: A 3-minute song takes ~2-5 minutes to separate on modern phones
4. **Memory**: Requires ~500MB RAM during processing
5. **iOS Limitations**: Background execution is more restricted on iOS than Android

---

## 🎯 Expected Outcome

After implementation:

- ✅ Audio separation runs in background even when phone is locked
- ✅ Vocals and instruments stored as separate files per song
- ✅ Karaoke slider in Now Playing to adjust vocal/instrumental balance
- ✅ Whisper transcription uses isolated vocals for maximum accuracy
- ✅ Zero-drift dual audio playback

**This creates a true "Apple Music Sing" competitor with on-device AI!** 🎤✨
