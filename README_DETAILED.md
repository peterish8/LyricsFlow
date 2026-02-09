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

### Robust Database Singleton
Expo SQLite can throw `NullPointerException` (NativeDatabase.prepareAsync) if multiple parts of the app try to open or query the database simultaneously during startup.
- **Solution**: Implemented in `db.ts` using a `dbPromise` singleton pattern. All database calls await the same initialization promise.
- **Recovery Path**: If the database file is ever corrupted or in a locked state, the app includes an automatic recovery mechanism that attempts to close, delete, and re-initialize the native state to prevent terminal crashes.

### Smart Timestamp Engine
The app handles "messy" data intelligently.
- **Regex**: `[\[\(]?(\d{1,2})[:.](\d{2})[\]\)]?`
- **Cleansing**: It doesn't just extract timestamps; it aggressively cleans the display text by stripping leading hyphens, colons, and pipes (`|`) that often result from AI-generated lyric templates.

---

## 📂 Directory Architecture

### `src/components/`
The UI building blocks of the application.

- **`AIGeneratorModal.tsx`**: A specialized interface for generating prompt templates for ChatGPT to help users get correctly formatted lyrics.
- **`AuroraHeader.tsx`**: Using **React Native Skia**, this component creates an ethereal, moving blurred background at the top of screens.
- **`CustomMenu.tsx`**: A bespoke "drop-up" menu that mimics iOS's native look. It supports **anchored positioning**, appearing exactly where the user tapped.
- **`GradientBackground.tsx`**: An animated, morphing gradient background that cycles through colors over 60 seconds.
- **`GradientPicker.tsx`**: A high-performance horizontal selector for choosing between the 24+ color presets.
- **`LyricsLine.tsx`**: The centerpiece of the reader. It uses **Reanimated** to handle the scale, opacity, and glow of the active line relative to its distance from the playhead.
- **`PlayerControls.tsx`**: Clean, accessible buttons for playback control.
- **`Scrubber.tsx`**: A custom-built timeline progress bar that supports smooth, optimistic seeking.
- **`SongCard.tsx`**: Used in the library grid; it intelligently switches between a gradient preview and the user's custom cover art.

### `src/database/`
The persistence layer.

- **`db.ts`**: The core initialization logic, singleton management, and recovery path.
- **`queries.ts`**: A structured CRUD layer. Every function here includes a `withDbRetry` wrapper to handle transient database locks or native failures gracefully.
- **`sampleData.ts`**: Contains "Welcome" songs to ensure the user isn't greeted by a blank screen on first launch.

### `src/screens/`
Full-page layouts and orchestration.

- **`LibraryScreen.tsx`**: The home view. Displays a 2-column grid of all saved songs with an Aurora-themed header.
- **`NowPlayingScreen.tsx`**: The most complex screen. It orchestrates the 60fps scroll loop, the transition between queued songs, and the image picker for cover art management.
- **`AddEditLyricsScreen.tsx`**: A robust form with floating labels, duration input, and real-time lyric parsing logic.
- **`SearchScreen.tsx`**: Fast, real-time search that scans titles, artists, and the actual content of lyrics.
- **`SettingsScreen.tsx`**: A clean, categorized menu for managing app-wide preferences.

### `src/store/` (Zustand)
Reactive state management.

- **`songsStore.ts`**: Manages the master list of songs, loading them from SQLite into memory for fast UI access.
- **`playerStore.ts`**: Handles the active playback state, including the **in-memory queue** system and the auto-play sequence.
- **`artHistoryStore.ts`**: Tracks recently used cover art images so users can quickly re-apply them to other songs.
- **`settingsStore.ts`**: Persists UI preferences like font size and theme.

### `src/utils/`
The heavy-lifting logic helpers.

- **`timestampParser.ts`**: The engine that converts raw text into structured `LyricLine` objects.
- **`exportImport.ts`**: Handles JSON serialization/deserialization for backing up or sharing your library.
- **`formatters.ts`**: Time-to-string conversion (e.g., `125` seconds to `2:05`).

---

## 🎨 Design System (`src/constants/`)

- **`colors.ts`**: A centralized theme using a "True Black" (`#000000`) foundation to make AMOLED screens pop and colors glow.
- **`gradients.ts`**: Definitions for over 24 curated gradients, ranging from "Cyberpunk" to "Soft Morning."
- **`typography.ts`**: A scaled font system that allows users to adjust readability in the settings.

---

## 🔄 The Lifecycle of a Lyric

1. **Input**: User pastes text into `AddEditLyricsScreen`.
2. **Parsing**: `timestampParser.ts` identifies timestamps, cleans the text, and calculates the total duration.
3. **Storage**: `queries.ts` saves the song metadata and line-by-line lyrics into SQLite.
4. **Display**: `NowPlayingScreen` loads the structured data.
5. **Animation**: The **60fps Scroll Engine** starts. `LyricsLine.tsx` calculates its own "glow" state based on the store's `currentTime`.
6. **Interaction**: User taps a line; `seek()` updates the store, and the scroll engine instantly recalculates the offset for a zero-latency jump.

---

## 🛣️ Future Roadmap

- [ ] **Persistent Queues**: Move the in-memory queue to SQLite for persistence across restarts.
- [ ] **LRC Full Support**: Enhanced support for millisecond-precision LRC files.
- [ ] **Cloud Sync (Optional)**: Optional, encrypted backups to personal Google Drive or Dropbox.
- [ ] **Visualizer**: Real-time waveform or bar visualizer behind the lyrics.

---
*LuvLyrics is a labor of love for people who still value their own personal library and the art of reading music.*
