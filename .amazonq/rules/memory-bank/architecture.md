# Project Architecture Overview

## Tech Stack
- **Framework**: React Native with Expo SDK 54
- **Language**: TypeScript 5.9
- **Database**: SQLite (expo-sqlite)
- **State Management**: Zustand
- **UI**: React Native Skia, Reanimated
- **Audio**: expo-audio
- **AI**: whisper.rn (Whisper.cpp), onnxruntime-react-native

## Directory Structure

### src/components/
UI building blocks:
- AIGeneratorModal.tsx - ChatGPT prompt templates
- AuroraHeader.tsx - Skia-powered blurred backgrounds
- CustomMenu.tsx - iOS-style anchored menus
- GradientBackground.tsx - Animated morphing gradients
- GradientPicker.tsx - Color preset selector
- LyricsLine.tsx - Animated lyric lines with glow
- PlayerControls.tsx - Playback buttons
- Scrubber.tsx - Timeline progress bar
- SongCard.tsx - Grid items with cover art
- StemProcessButton.tsx - AI separation trigger
- TasksModal.tsx - Background task manager
- Toast.tsx - Spring-animated notifications
- VocalBalanceSlider.tsx - Karaoke balance control

### src/database/
Persistence layer:
- db.ts - SQLite initialization, singleton, recovery
- queries.ts - CRUD operations with retry logic
- sampleData.ts - Welcome songs for first launch

### src/screens/
Full-page layouts:
- LibraryScreen.tsx - Home with grid + list hybrid
- NowPlayingScreen.tsx - Main lyric reader (60fps scroll)
- AddEditLyricsScreen.tsx - Song metadata form
- SearchScreen.tsx - Real-time search
- SettingsScreen.tsx - App preferences

### src/services/
AI and processing:
- whisperSetup.ts - Model lifecycle management
- whisperService.ts - C++ Whisper bridge
- autoTimestampServiceV2.ts - DTW alignment
- audioConverter.ts - FFmpeg audio conversion
- sourceSeparationModel.ts - ONNX vocal separation
- SourceSeparationService.ts - Karaoke pipeline

### src/hooks/
React hooks:
- useKaraokePlayer.ts - Dual-track sync playback

### src/store/
Zustand state:
- songsStore.ts - Master song list
- playerStore.ts - Playback state, queue
- tasksStore.ts - Background tasks (Whisper + Karaoke)
- artHistoryStore.ts - Recent cover art
- settingsStore.ts - UI preferences

### src/utils/
Logic helpers:
- timestampParser.ts - Lyric text → structured data
- exportImport.ts - JSON backup/restore
- formatters.ts - Time/text formatting

## Key Design Patterns

### 1. Database Singleton
```typescript
// db.ts - Prevents multiple connections
let dbPromise: Promise<SQLiteDatabase> | null = null;
export const getDatabase = async () => {
  if (!dbPromise) {
    dbPromise = initDatabase();
  }
  return dbPromise;
};
```

### 2. Audio Dual-Track Sync
```typescript
// useKaraokePlayer.ts - 50ms drift correction
const startSyncMonitor = () => {
  setInterval(() => {
    const diff = Math.abs(vocalPlayer.currentTime - instrPlayer.currentTime);
    if (diff > 50) instrPlayer.seekTo(vocalPlayer.currentTime);
  }, 1000);
};
```

### 3. Background Task Queue
```typescript
// tasksStore.ts - Persistent AI task tracking
type Task = {
  id: string;
  songId: string;
  type: 'magic' | 'pure-magic' | 'separation';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
};
```

## Database Schema

```sql
CREATE TABLE songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  gradient_id TEXT NOT NULL,
  duration INTEGER DEFAULT 0,
  date_created TEXT NOT NULL,
  date_modified TEXT NOT NULL,
  play_count INTEGER DEFAULT 0,
  last_played TEXT,
  scroll_speed INTEGER DEFAULT 50,
  cover_image_uri TEXT,
  lyrics_align TEXT DEFAULT 'left',
  text_case TEXT DEFAULT 'normal',
  audio_uri TEXT,
  is_liked INTEGER DEFAULT 0,
  vocal_stem_uri TEXT,
  instrumental_stem_uri TEXT,
  separation_status TEXT DEFAULT 'none',
  separation_progress INTEGER DEFAULT 0
);
```

## Critical Implementation Notes

### 60fps Scroll Engine
- Uses `requestAnimationFrame` loop
- Calculates `deltaTime` for sub-millisecond precision
- Active line fixed at 30% from top
- Auto-hide controls after 3.5s when playing

### FFmpeg Integration
- MP3/M4A → WAV 16kHz mono (for Whisper)
- MP3/M4A → PCM Float32 (for ONNX)
- Fallback to original if conversion fails

### ONNX Model Loading
1. Check local document directory
2. Try CDN download (if URL configured)
3. Copy from bundled assets (if available)
4. Load with CPU execution provider

### Error Recovery
- Database: Automatic retry with connection reset
- Whisper: Context recreation on pointer errors
- Audio: Fallback to original file on conversion fail
- Karaoke: Placeholder separation on ONNX errors
