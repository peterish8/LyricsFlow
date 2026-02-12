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
- LrcSearchModal.tsx - Unified search UI with **Preview Mode**
- AuroraHeader.tsx - Skia-powered blurred backgrounds
- CustomMenu.tsx - iOS-style anchored menus
- GradientBackground.tsx - Animated morphing gradients
- GradientPicker.tsx - Color preset selector
- LyricsLine.tsx - Animated lyric lines with glow
- PlayerControls.tsx - Playback buttons
- Scrubber.tsx - Timeline progress bar
- SongCard.tsx - Grid items with cover art
- VinylRecord.tsx - Rotating vinyl UI
- Toast.tsx - Spring-animated notifications

### src/database/
- db.ts - SQLite initialization, singleton, recovery
- queries.ts - CRUD operations with retry logic
- sampleData.ts - Welcome songs for first launch

### src/screens/
- LibraryScreen.tsx - Home screen (Grid + List)
- NowPlayingScreen.tsx - Lyric reader (60fps Engine) with **Dynamic Magic Button**
- AddEditLyricsScreen.tsx - Song metadata form
- SearchScreen.tsx - Real-time library search
- SettingsScreen.tsx - App preferences

### src/services/ (The Search Engine)
- LyricsRepository.ts - Waterfall logic (LRCLIB → Genius)
- LrcLibService.ts - LRCLIB API client
- GeniusService.ts - Scraper with metadata scrubbing
- SmartLyricMatcher.ts - Result scoring logic
- whisperService.ts - (Legacy) Local transcription

### src/utils/
Logic helpers:
- timestampParser.ts - Lyric text → structured data
- exportImport.ts - JSON backup/restore
- formatters.ts - Time/text formatting

### LyricApp/ (Desktop Python Tools)
- forced_aligner.py - WhisperX + Wav2Vec2 alignment pipeline
- force_mapper.py - Fuzzy matching and interpolation engine
- setup_env.bat - Dependency installation helper

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

### 2. Search Waterfall Strategy
```typescript
// LyricsRepository.ts - LRCLIB -> Genius fallback
const bestMatch = await LrcLibService.search(query);
if (!bestMatch || bestMatch.matchScore < 60) {
  results = await GeniusService.searchGenius(query);
}
```

### 3. Smart Scraping & Sanitization
```typescript
// GeniusService.ts - Cleaning web-injected metadata
const cleanedLines = plainText.split('\n').filter(line => {
  if (/^\d+\s+contributors?$/i.test(line)) return false;
  if (/^you might also like$/i.test(line)) return false;
  return true;
});
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
  lyricSource TEXT -- 'LRCLIB' | 'Genius'
);
```

## Critical Implementation Notes

### 60fps Scroll Engine
- Uses `requestAnimationFrame` loop
- Calculates `deltaTime` for sub-millisecond precision
- Active line fixed at 30% from top
- Auto-hide controls after 3.5s when playing

### Lyric Preview Mode
- Full text/timestamp preview before database update
- Prevents accidental overwrites of existing lyrics
- Integrated in `LrcSearchModal.tsx`

### Dynamic Magic Button
- Gradient colors updated on-the-fly based on `currentSong.gradientId`
- Uses `LinearGradient` for a native, premium feel
- High-vibrancy "Sparkle" UI

### Error Recovery
- Database: Automatic retry with connection reset
- Network: Timeout and AbortController for fetch calls
- Search: Waterfall fallback ensures results even if one provider fails
