# 🎵 LuvLyrics (LyricFlow): Architectural Deep Dive

[![Expo](https://img.shields.io/badge/Expo-54.0-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Data-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

> **A Premium, Privacy-First, Local Lyrics Experience.**
> LuvLyrics is a visual instrument designed to turn your lyric-reading into a cinematic experience. This document provides a comprehensive breakdown of the project's architecture, technical decisions, and file-by-file organization.

---

## 📖 Table of Contents
1. [Project Philosophy](#project-philosophy)
2. [Technical Foundations](#technical-foundations)
   - [The 60fps Scroll Engine](#60fps-scroll-engine)
   - [The Robust Database Singleton](#robust-database-singleton)
   - [Smart Timestamp Engine](#smart-timestamp-engine)
3. [Directory Architecture](#directory-architecture)
   - [src/components](#srccomponents)
   - [src/database](#srcdatabase)
   - [src/screens](#srcscreens)
   - [src/store](#srcstore)
   - [src/utils](#srcutils)
4. [Design System](#design-system)
5. [Future Roadmap](#future-roadmap)

---

## 🌟 Project Philosophy

LuvLyrics was built on three core pillars:
1. **Local-First Reliability**: Your data belongs to you. No cloud dependencies, no tracking. Everything is stored in a structured SQLite database.
2. **Visual Immersion**: Inspired by Apple Music's aesthetic, the app uses real-time Skia-powered blurs and animated gradients to create a focused reading environment.
3. **Frictionless Input**: Parsing lyrics shouldn't be hard. The app is designed to "just work" with messy text pasted from ChatGPT or traditional timestamped LRC formats.

---

## 🧠 Technical Foundations

### 60fps Scroll Engine
Traditional lyrics apps often use `setInterval` for auto-scrolling, which leads to "micro-stuttering" on modern high-refresh-rate displays.
- **Implementation**: Located in `NowPlayingScreen.tsx`, we use a custom `requestAnimationFrame` loop.
- **Logic**: It calculates a high-precision `deltaTime` (ms since last frame) to update the scroll offset and playback tick. This ensures that even if a frame is dropped, the lyrics stay perfectly in sync with real-time.
- **Fixed Positioning**: Active lyric line stays at 30% from top (above mid-point) using `viewPosition: 0.3` in FlatList `scrollToIndex`. No size changes on highlight - only color/glow changes to prevent text reflow.
- **Auto-hide Controls**: Player controls auto-hide after 3.5s when playing, stay visible when paused. Reappear on scroll-down gesture or tap.

### Robust Database Singleton
Expo SQLite can throw `NullPointerException` (NativeDatabase.prepareAsync) if multiple parts of the app try to open or query the database simultaneously during startup.
- **Solution**: Implemented in `db.ts` using a `dbPromise` singleton pattern. All database calls await the same initialization promise.
- **Recovery Path**: If the database file is ever corrupted or in a locked state, the app includes an automatic recovery mechanism that attempts to close, delete, and re-initialize the native state to prevent terminal crashes.
- **Retry Mechanism**: Every database query is wrapped in a `withDbRetry` helper (`src/database/queries.ts`) that detects NullPointer errors and automatically restarts the DB connection.
- **Migration System**: Automatic column additions (e.g., `lyrics_align`, `text_case`) via PRAGMA table_info checks.

### Smart Timestamp Engine
The app handles "messy" data intelligently.
- **Flexible Formats**: Supports `[0:00]`, `(0:00)`, `0:00`, and `0.00`.
- **Regex**: `[\[\(]?(\d{1,2})[:.](\d{2})[\]\)]?`
- **Cleansing**: It doesn't just extract timestamps; it aggressively cleans the display text by stripping leading hyphens, colons, and pipes (`|`) that often result from AI-generated lyric templates.

### On-Device AI (Whisper)
Privacy-first AI that runs entirely on your phone (no cloud API costs).
- **Core**: Uses `whisper.rn` (providing `whisper.cpp`) for high-performance offline speech-to-text.
- **Improved Quality**: Uses larger context window (`maxLen: 60`), lyrical prompts, and noise filtering for cleaner transcripts.
- **Metadata Protection**: Smart state merging ensures manual Title/Artist edits are never overwritten by AI results.
- **Dual Mode**:
    1. **Magic Mode**: Aligns *your* pasted lyrics with the audio using Dynamic Time Warping (DTW).
    2. **Pure Magic Mode**: Generates *new* lyrics and timestamps from scratch using the Whisper model.
- **Performance**: Optimized with FFmpeg audio conversion (16kHz WAV) and background task queuing.

### AI Karaoke Mode (ONNX Vocal Separation) 🎤
Apple Music Sing-style vocal/instrumental balance control powered by on-device AI.
- **Core Technology**: ONNX Runtime with quantized Spleeter/Demucs models (~40-60MB)
- **Audio Pipeline**:
    1. **Decode**: FFmpeg extracts raw PCM Float32 audio from MP3/M4A
    2. **Separate**: ONNX model splits audio into vocal and instrumental stems
    3. **Reconstruct**: FFmpeg encodes stems back to playable WAV files
    4. **Store**: Stems saved permanently per song in app documents
- **Dual-Track Playback**: Uses `expo-audio` with synchronized dual players:
    - Vocal track (master clock)
    - Instrumental track (follows vocal with 50ms drift correction)
- **Real-time Mixing**: Balance slider from -1.0 (vocals only) to +1.0 (karaoke/instruments only)
- **UI Components**:
    - `VocalBalanceSlider`: Apple Music Sing-style gradient slider
    - `StemProcessButton`: AI separation trigger with progress tracking
- **Database Storage**: `vocal_stem_uri`, `instrumental_stem_uri`, `separation_status`, `separation_progress`
- **Background Processing**: Runs as persistent task even when phone is locked

---

## 📂 Directory Architecture

### `src/components/` (The Building Blocks)
- **`AIGeneratorModal.tsx`**: Interface for generating prompt templates for ChatGPT.
- **`AuroraHeader.tsx`**: **Skia-powered** organic blurred background system.
- **`CustomMenu.tsx`**: iOS-style anchored "drop-up" menu. Supports dynamic positioning near tap source. Event passthrough for submenus.
- **`GradientBackground.tsx`**: Animated morphing gradients with GPU-accelerated transforms.
- **`GradientPicker.tsx`**: High-performance preset selector.
- **`LyricsLine.tsx`**: Animated line component with distance-based blur and glow.
- **`PlayerControls.tsx`**: Core playback interaction buttons with ±10s skip.
- **`Scrubber.tsx`**: Timeline progress bar with optimistic seeking.
- **`SongCard.tsx`**: Grid item that handles both gradient fallbacks and custom cover art images. Supports long-press.
- **`StemProcessButton.tsx`**: AI separation trigger with progress tracking and status display.
- **`TasksModal.tsx`**: Background task manager showing live progress and task history.
- **`Toast.tsx`**: Spring-animated notification component with auto-dismiss.
- **`VocalBalanceSlider.tsx`**: Apple Music Sing-style gradient slider for vocal/instrumental balance (-1.0 to +1.0).

### `src/database/` (The Persistence Layer)
- **`db.ts`**: Core SQLite initialization, singleton management, and recovery logic.
- **`queries.ts`**: CRUD operations with built-in retry logic and error handling.
- **`sampleData.ts`**: Template metadata to populate the app on first run.

### `src/screens/` (The Orchestration Layer)
- **`LibraryScreen.tsx`**: Hybrid layout - top 2 songs in grid, rest in list with thumbnails/duration. Long-press for cover art upload.
- **`NowPlayingScreen.tsx`**: Main lyric reader with 60fps scroll engine, fixed active line positioning (30% from top), auto-hide controls, text case transformation, instrumental bars animation, cover art upload menu.
- **`AddEditLyricsScreen.tsx`**: Form for song metadata, lyrics parsing, alignment picker, toast notifications.
- **`SearchScreen.tsx`**: Real-time cross-field search engine.
- **`SettingsScreen.tsx`**: iOS-style configuration with clear data option.

### `src/store/` (Reactive State - Zustand)
- **`songsStore.ts`**: Master song list and metadata state.
- **`playerStore.ts`**: Playback state, including the **Session Queue** and auto-play controls.
- **`tasksStore.ts`**: Persistent background task queue for tracking AI processing across songs (Whisper & Karaoke separation).
- **`artHistoryStore.ts`**: Tracks "Recent Art" for quick reuse across songs.
- **`settingsStore.ts`**: Persists UI preferences to disk.

### `src/services/` (AI & Background Processing)
- **`whisperService.ts`**: Whisper.cpp transcription service for Magic Timestamp.
- **`sourceSeparationModel.ts`**: ONNX Runtime wrapper for vocal/instrumental AI separation.
- **`SourceSeparationService.ts`**: Background task coordinator for AI Karaoke pipeline (FFmpeg decode → ONNX inference → FFmpeg encode).

### `src/hooks/` (React Hooks)
- **`useKaraokePlayer.ts`**: Dual-track synchronized playback hook with 50ms drift correction and real-time volume mixing.

### `src/utils/` (Logic Helpers)
- **`timestampParser.ts`**: The engine that converts raw text into structured `LyricLine` objects.
- **`audioConverter.ts`**: FFmpeg-based audio conversion for Whisper (16kHz WAV) and AI Karaoke (PCM decoding).
- **`exportImport.ts`**: JSON serialization for library backups.
- **`formatters.ts`**: Time and text formatting utilities.

---

## 🎨 Design System

Located in `src/constants/`:
- **`colors.ts`**: True Black foundation for maximum AMOLED contrast.
- **`gradients.ts`**: 24+ curated vibrant visual presets with meaningful names (Midnight Dreams, Ocean Breeze, Sunset Vibes, etc.).
- **`typography.ts`**: Scaled font sizes for improved accessibility.

---

## ✨ Key Features

### Lyrics Display & Interaction
- **Spotify/Apple Music-style scrolling**: Active line stays at fixed position (30% from top), content scrolls underneath
- **Smooth animations**: Spring physics (damping: 20, stiffness: 90, mass: 0.8) for all transitions
- **Text formatting**: Per-song text case options (Normal, ALL CAPS, Title Case, Sentence case) accessible via three-dot menu
- **Alignment options**: Left/Center/Right alignment per song, set in edit screen
- **Instrumental indicators**: Animated vertical bars for `[INSTRUMENTAL]` sections with live height changes
- **Glow effects**: Active lyrics have white glow (opacity: 0.6, radius: 20px)
- **Skip controls**: ±10 second seek buttons instead of previous/next song

### Cover Art Management
- **Custom uploads**: Long-press (1.5s) cover art in Now Playing or Library to upload from gallery
- **Recent art reuse**: Quick access to recently used cover art
- **Gradient fallback**: Default to theme gradient if no custom cover set
- **Persistent storage**: Cover URIs saved per song in database

### Library Organization
- **Hybrid layout**: Top 2 songs in grid ("Most Played"), rest in list view ("All Songs")
- **List view details**: Shows thumbnail, title, artist, duration (MM:SS format)
- **Long-press actions**: Access cover art upload from any song card
- **Recently Played**: Horizontal scrolling list of your last 10 listened songs

### ✨ Magic Timestamp (AI)
- **Dual Mode Intelligence**:
    1. **Magic**: Aligns your pasted lyrics with audio using Dynamic Time Warping.
    2. **Pure Magic**: Generates lyrics from scratch using on-device Whisper AI.
- **Background Processing**: Start tasks and keep browsing. AI runs in a global queue accessible via the notification bell.
- **Task Management**: Stop active transcriptions mid-process or restart failed jobs.
- **Visual Progress**: Real-time feedback with live progress bars and stage updates (Converting → Transcribing → Aligning).
- **Confidence Scoring**: AI assigns a confidence score to every line and the song overall.

### 🎤 AI Karaoke Mode
- **Apple Music Sing-style**: Real-time vocal/instrumental balance control
- **ONNX AI Separation**: On-device neural network splits any song into vocals + instruments
- **Dual-Track Engine**: Synchronized dual audio players with 50ms drift correction
- **Balance Slider**: -1.0 (vocals only) ↔ 0.0 (both) ↔ +1.0 (karaoke/instruments only)
- **Background Separation**: Process songs while using other apps (progress saved to database)
- **Persistent Stems**: Once separated, stems are saved permanently per song
- **One-Tap Trigger**: `StemProcessButton` initiates separation with visual progress
- **Integration**: Works alongside existing lyrics display (karaoke + lyrics sync)

### UI/UX Enhancements
- **Auto-hide controls**: Player controls fade out after 3.5s when playing, stay visible when paused
- **Toast notifications**: Success feedback on song save (auto-dismisses after 2s)
- **Submenu system**: Text format options in nested menu (tap "Text Format" → opens submenu at same position)
- **Clear data**: Settings option to wipe all songs/lyrics with confirmation dialog

---

## 🛠️ Technical Implementation Notes

### Database Schema
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

### Key State Management
- **Song interface**: Added `lyricsAlign?: 'left' | 'center' | 'right'` and `textCase?: 'normal' | 'uppercase' | 'titlecase' | 'sentencecase'`
- **Player controls**: `controlsOpacity` and `controlsTranslateY` animated values for auto-hide
- **Text transformation**: Applied in `renderLyric` callback, transforms on-the-fly without modifying stored data

### Performance Optimizations
- **No getItemLayout**: Removed fixed item heights to allow dynamic sizing for multi-line lyrics
- **Memoized LyricItem**: Extracted to separate component with `React.memo` to prevent hook violations in FlatList
- **Consistent font weight**: Same weight (600) for active/inactive to prevent text reflow
- **Title case logic**: Split by spaces, capitalize first letter only (handles contractions like "You're" correctly)

### Event Handling
- **CustomMenu event passthrough**: `onPress` accepts optional event parameter for submenu positioning
- **Long-press detection**: 1.5s delay for cover art, immediate for song cards in library
- **Scroll gesture detection**: Tracks `scrollYRef` to determine scroll direction for control visibility

---

## 🛠️ The Lifecycle of a Lyric

1. **Input**: User pastes text into `AddEditLyricsScreen`.
2. **Parsing**: `timestampParser.ts` extracts timestamps and cleans text.
3. **Storage**: `queries.ts` saves structured data into SQLite with atomic reliability.
4. **Display**: `NowPlayingScreen` loads the structured data.
5. **Animation**: The **60fps Scroll Engine** starts, animating `LyricsLine.tsx` based on sub-millisecond precision.
6. **Interaction**: User taps a line; `seek()` updates the state, and the scroll engine instantly realigns for zero-latency jumping.

---

## 📸 Screenshots & Media

<p align="center">
  <img src="file:///C:/Users/nithy/.gemini/antigravity/brain/4f69de0c-02f6-453b-94d1-8bbb9dcb416a/media__1770661470139.png" width="300" alt="Now Playing" />
  <img src="file:///C:/Users/nithy/.gemini/antigravity/brain/4f69de0c-02f6-453b-94d1-8bbb9dcb416a/media__1770660358664.png" width="300" alt="Library" />
</p>

---
*LuvLyrics: Created with ❤️ for lyrics lovers.*
