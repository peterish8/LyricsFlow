# AI Karaoke Implementation Summary

## Overview
Implementation of Apple Music Sing-style AI Karaoke feature with on-device vocal/instrumental separation using ONNX Runtime.

## Key Components

### 1. Database Schema (src/database/db.ts)
Added columns to `songs` table:
- `vocal_stem_uri` - Path to isolated vocals WAV file
- `instrumental_stem_uri` - Path to instruments WAV file  
- `separation_status` - 'none' | 'pending' | 'processing' | 'completed' | 'failed'
- `separation_progress` - Integer 0-100%

### 2. Type Definitions (src/types/song.ts)
Added to Song interface:
- `vocalStemUri?: string`
- `instrumentalStemUri?: string`
- `separationStatus: 'none' | 'pending' | 'processing' | 'completed' | 'failed'`
- `separationProgress: number`

Created `KaraokeMixSettings` interface:
- `vocalVolume: number` (0.0 to 2.0)
- `instrumentalVolume: number` (0.0 to 2.0)
- `balance: number` (-1.0 to 1.0)

### 3. ONNX Model Service (src/services/sourceSeparationModel.ts)
- `SourceSeparationModel` class for AI inference
- Model download from CDN or bundled assets
- Audio chunking with 50% overlap
- Hann window for smooth crossfading
- Overlap-add reconstruction
- Real ONNX Runtime integration with `onnxruntime-react-native`

### 4. Source Separation Service (src/services/SourceSeparationService.ts)
- Background task coordination
- FFmpeg audio decoding (MP3/M4A → PCM Float32)
- ONNX inference loop
- FFmpeg audio encoding (PCM → WAV)
- Stem file management
- Database updates for paths
- Progress tracking via tasks store

### 5. Karaoke Player Hook (src/hooks/useKaraokePlayer.ts)
- Uses `expo-audio` (NOT expo-av or react-native-track-player)
- Creates 2 audio players: vocals + instruments
- 50ms drift detection and sync correction
- Volume mixing based on balance slider
- Methods: `togglePlay()`, `play()`, `pause()`, `seekTo()`, `setBalance()`, `updateMix()`

### 6. UI Components
- `VocalBalanceSlider.tsx` - Apple Music Sing-style gradient slider (-1 to +1)
- `StemProcessButton.tsx` - AI separation trigger with progress tracking

### 7. Tasks Store Updates (src/store/tasksStore.ts)
- Added 'separation' to task type union
- Task interface with optional `songTitle`, `createdAt`, `completedAt`

## Dependencies Added
```bash
npm install onnxruntime-react-native
npm install ffmpeg-kit-react-native@6.0.2
npx expo install expo-audio
```

## Critical Implementation Details

### Audio Pipeline
1. **Decode**: FFmpeg extracts raw PCM Float32 from MP3/M4A
2. **Chunk**: 2-second windows with 50% overlap
3. **Inference**: ONNX model processes each chunk
4. **Reconstruct**: Overlap-add with Hann window smoothing
5. **Encode**: FFmpeg converts back to WAV format
6. **Store**: Save stems to `{documentDirectory}/stems/`

### Dual-Track Playback
- Vocal track = master clock
- Instrumental track follows with 1-second sync intervals
- 50ms drift tolerance before correction
- Real-time volume adjustment via `player.volume = value`

### Model Loading Strategy
1. Check if model exists in document directory
2. If not, try CDN download (if MODEL_URL set)
3. Otherwise, copy from bundled assets (`assets/models/`)
4. Load into ONNX Runtime with CPU execution provider

## Files Modified
- `src/database/db.ts` - Added stem columns
- `src/types/song.ts` - Added KaraokeMixSettings
- `src/services/sourceSeparationModel.ts` - NEW
- `src/services/SourceSeparationService.ts` - Updated with FFmpeg
- `src/hooks/useKaraokePlayer.ts` - NEW
- `src/components/VocalBalanceSlider.tsx` - NEW
- `src/components/StemProcessButton.tsx` - NEW
- `src/components/index.ts` - Export new components
- `src/store/tasksStore.ts` - Added 'separation' task type
- `src/utils/audioConverter.ts` - Added FFmpeg conversion
- `app.json` - Added expo-audio plugin

## Next Steps for Completion
1. Download ONNX model (Spleeter/Demucs quantized ~40-60MB)
2. Place in `assets/models/spleeter_2stem_quantized.onnx`
3. Update MODEL_URL in sourceSeparationModel.ts if using CDN
4. Rebuild app with `npx expo run:android --device`

## Common Issues & Solutions

### Issue: Invalid hook call in audioConverter
**Solution**: Don't use `useAudioPlayer` hook in class methods. Use simple file validation instead.

### Issue: expo-file-system deprecation warnings
**Solution**: Import from `expo-file-system/legacy` instead of `expo-file-system`

### Issue: FFmpeg build failures
**Solution**: Use `ffmpeg-kit-react-native@6.0.2` (not min-gpl version)

### Issue: Whisper -999 error
**Solution**: Add FFmpeg conversion to WAV 16kHz mono before Whisper transcription
