# 🎵 LuvLyrics (LyricFlow): The Deep Dive

> **A Premium, Privacy-First, Local Lyrics Experience.**

LuvLyrics isn't just a lyrics storage app; it's a visual instrument designed to turn your lyric-reading into a cinematic experience. This document provides a comprehensive breakdown of the project's architecture, technical decisions, and file-by-file organization.

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
- **Auto-Hide Logic**: Controls automatically fade out after 3.5 seconds of inactivity during playback. They reappear instantly on any user interaction (tap or scroll drag).
- **Battery Saver**: Background animations can be disabled via the top-right menu to reduce GPU load on older devices.

### Robust Database Singleton
Expo SQLite can throw `NullPointerException` (NativeDatabase.prepareAsync) if multiple parts of the app try to open or query the database simultaneously during startup.
- **Solution**: Implemented in `db.ts` using a `dbPromise` singleton pattern. All database calls await the same initialization promise.
- **Recovery Path**: If the database file is ever corrupted or in a locked state, the app includes an automatic recovery mechanism that attempts to close, delete, and re-initialize the native state to prevent terminal crashes.

### Smart Timestamp Engine
The app handles "messy" data intelligently.
- **Regex**: `[\[\(]?(\d{1,2})[:.](\d{2})[\]\)]?`
- **Cleansing**: It doesn't just extract timestamps; it aggressively cleans the display text by stripping leading hyphens, colons, and pipes (`|`) that often result from AI-generated lyric templates.

### Smart Lyric Search (Unified Parallel Selection)
The app implements a robust, tiered lyric fetching system.
- **Engine**: Orchestrated by `LyricsRepository.ts` using `MultiSourceLyricsService`.
- **Strategy**: 
    - **Parallel Fetching**: Hits **LRCLIB**, **JioSaavn**, and **Lyrica/Genius** simultaneously.
    - **Ranking**: Results are scored via `SmartLyricMatcher.ts` and ranked for the user.
    - **User Selection**: Preview mode allows users to pick the best source with colorful badges identifying the provider.
- **Hardware & Lock Screen Sync**: Fully integrated with the device media session via `expo-audio`, supporting Bluetooth remote commands and system metadata updates.
- **On-Device AI**: Powerful ONNX separation logic for Karaoke mode (standalone capability).

---

## 📂 Directory Architecture

### `src/components/`
- **`LrcSearchModal.tsx`**: New unified search interface with list filtering, source badges, and **Preview Mode**.
- **`AuroraHeader.tsx`**: Using **React Native Skia**, this component creates an ethereal, moving blurred background.
- **`VinylRecord.tsx`**: A realistic, rotating vinyl record UI for the "Now Playing" background.
- **`LyricsLine.tsx`**: Uses **Reanimated** to handle the scale, opacity, and glow of the active line.
- **`PlayerControls.tsx`**: Clean, accessible buttons for playback control.
- **`Scrubber.tsx`**: A custom-built timeline progress bar that supports smooth, optimistic seeking.

### `src/database/`
- **`db.ts`**: The core initialization logic, singleton management, and recovery path.
- **`queries.ts`**: Structured CRUD layer with built-in retry logic.

### `src/screens/`
- **`LibraryScreen.tsx`**: Home view with grid/list hybrid layout.
- **`NowPlayingScreen.tsx`**: Main reader with 60fps scroll engine and **Magic Button (Dynamic Gradient)**.
- **`AddEditLyricsScreen.tsx`**: Manual entry and metadata management.

### `src/services/` (The Core Engine)
- **`LyricsRepository.ts`**: Orchestrates the multi-source search (LRCLIB → Genius).
- **`LrcLibService.ts`**: LRCLIB API client with timeout and User-Agent headers.
- **`GeniusService.ts`**: High-performance scraper with metadata scrubbing patterns.
- **`SmartLyricMatcher.ts`**: Match scoring based on metadata and content length.

### `src/store/` (Zustand)
- **`songsStore.ts`**: Master song list from SQLite.
- **`songsStore.ts`**: Master song list from SQLite.
- **`playerStore.ts`**: Playback state and unified queue.
- **`settingsStore.ts`**: Persists user preferences like `autoHideControls`, `animateBackground`, and `libraryBackgroundMode`.
- **`dailyStatsStore.ts`**: Tracks daily listening habits to power the "Daily Top" background mode.

---

## 🔄 The Lifecycle of a Lyric

1. **Search**: User clicks the ✨ Magic button.
2. **Fetch**: `LyricsRepository` queries LRCLIB and Genius.
3. **Preview**: User scrolls through results and previews the text content.
4. **Parsing**: `timestampParser.ts` identifies timestamps and cleans text on apply.
5. **Storage**: `queries.ts` saves the song metadata and line-by-line lyrics into SQLite.
6. **Animation**: The **60fps Scroll Engine** starts, animating `LyricsLine.tsx`.

---

## 🪄 Smart Search Workflow
1. **Access**: Tap the ✨ Magic button on the Now Playing screen.
2. **Search**: Type title/artist (defaults to current song metadata).
3. **Waterfall**: System searches LRCLIB first, then Fallbacks to Genius.
4. **Select**: Tap a result to enter **Preview Mode**.
5. **Apply**: Tap "Apply Lyrics" to instantly update the song with the new content and source metadata.

---

## 🛣️ Future Roadmap

- [ ] **Persistent Queues**: Move the in-memory queue to SQLite for persistence.
- [ ] **Local LRC Export**: Export lyrics back to .lrc files.
- [ ] **Visualizer**: Real-time waveform visualizer behind the lyrics.

---
*LuvLyrics is a labor of love for people who still value their own personal library and the art of reading music.*
