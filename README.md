# 🎵 LuvLyrics (LyricFlow): Architectural Deep Dive

[![Expo](https://img.shields.io/badge/Expo-54.0-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Data-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

> **A Premium, Privacy-First, Local Lyrics Experience.**
> LuvLyrics is a visual instrument designed to turn your lyric-reading into a cinematic experience. This document provides a comprehensive breakdown of the project's architecture, technical decisions, and file-by-file organization.

### 🚀 **V9 COMPLETE ENGINE**
The latest v9 update brings a complete overhaul with:
- **Multi-Source Parallel Lyrics Engine**: Fetches from LRCLIB, JioSaavn, and Lyrica simultaneously with smart ranking
- **Batch Review & Download System**: Process multiple songs with queue management
- **Dynamic Island & Island Scrubber**: Premium compact player UI with system integration
- **Reels & Social Features**: Vertical short-form content experience
- **Playlist Management**: Full CRUD with favorites and smart sorting
- **Transliteration Support**: Romanized lyrics for regional languages
- **AI Generator Modal**: AI-powered lyrics generation

---

## 📖 Table of Contents
1. [Project Philosophy](#project-philosophy)
2. [Technical Foundations](#technical-foundations)
   - [The 60fps Scroll Engine](#60fps-scroll-engine)
   - [The Robust Database Singleton](#robust-database-singleton)
   - [Smart Timestamp Engine](#smart-timestamp-engine)
   - [Parallel Search Strategy](#parallel-search-strategy)
3. [Directory Architecture](#directory-architecture)
   - [src/components](#srccomponents)
   - [src/screens](#srcscreens)
   - [src/services](#srcservices)
   - [src/store](#srcstore)
   - [src/database](#srcdatabase)
4. [Design System](#design-system)
5. [Key Features](#key-features)

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
Expo SQLite with WAL mode for concurrent access.
- **Solution**: Promise-based singleton in `db.ts` prevents multiple simultaneous connections
- **WAL Mode**: `PRAGMA journal_mode = WAL` enables concurrent reads/writes
- **Migration System**: Automatic column additions via PRAGMA table_info checks
- **Playlist Support**: Dedicated `playlistQueries.ts` for playlist CRUD operations

### Smart Timestamp Engine
The app handles "messy" data intelligently.
- **Flexible Formats**: Supports `[0:00]`, `(0:00)`, `0:00`, and `0.00`.
- **Regex**: `[\\[\\(]?(\\d{1,2})[:.](\\d{2})[\\]\\)]?`
- **Cleansing**: It doesn't just extract timestamps; it aggressively cleans the display text by stripping leading hyphens, colons, and pipes (`|`) that often result from AI-generated lyric templates.

### Parallel Search Strategy
Unified lyrics fetching with intelligent fallback strategy.
- **Waterfall Strategy**: synced-fast → synced-slow → plain text fallback
- **Parallel Race**: Hits LRCLIB, JioSaavn, and Lyrica simultaneously (5s race)
- **Match Scoring**: Results are ranked by `SmartLyricMatcher.ts`
- **Service**: `MultiSourceLyricsService.ts`

### Dynamic Theme Engine 🎨
- **Magic Button**: The "Sparkle" button now dynamically shifts its background gradient based on the current song's `gradientId`, creating a unified, premium appearance.
- **60fps Scroll Engine**: Uses `requestAnimationFrame` for buttery-smooth scrolling on high-refresh-rate displays.
- **Design System**: 24+ curated vibrant visual presets (Midnight Dreams, Ocean Breeze, Sunset Vibes, etc.).
- **Smart Backgrounds**: Three distinct modes for the Library view:
    1. **Daily Top**: Displays the album art of your most played song from yesterday.
    2. **Aurora**: A calming, animated gradient mesh (default).
    3. **Current Song**: Real-time blurred artwork of the currently playing track.
- **Battery Optimization**: Background animations can be toggled off directly from the Now Playing menu to save power.

---

## 📂 Directory Architecture

### `src/components/` (The Building Blocks)
| Component | Description |
|-----------|-------------|
| `LrcSearchModal.tsx` | Unified search interface with list filtering, source badges, and **Preview Mode** |
| `AuroraHeader.tsx` | **Skia-powered** organic blurred background system |
| `LyricsLine.tsx` | Animated line component with distance-based blur and glow |
| `VinylRecord.tsx` | Realistic rotating vinyl UI for the player |
| `PlayerControls.tsx` | Core playback interaction buttons with ±10s skip |
| `Scrubber.tsx` | Timeline progress bar with optimistic seeking |
| `MiniPlayer.tsx` | Compact player for background playback |
| `IslandScrubber.tsx` | Dynamic Island style progress indicator |
| `SynchronizedLyrics.tsx` | High-precision synced lyrics renderer |
| `MagicModeModal.tsx` | AI-powered magic lyrics search |
| `ManualSyncModal.tsx` | Manual timestamp synchronization tool |
| `LanguagePickerModal.tsx` | Transliteration language selector |
| `AIGeneratorModal.tsx` | AI lyrics generation interface |
| `BatchReviewModal.tsx` | Batch lyrics review and apply |
| `BulkSwapModal.tsx` | Bulk operations for multiple songs |
| `CoverFlow.tsx` | 3D cover art carousel |
| `MosaicCover.tsx` | Grid mosaic cover display |
| `DownloadGridCard.tsx` | Download item card |
| `DownloadQueueModal.tsx` | Download queue management |
| `FloatingDownloadIndicator.tsx` | Active download progress indicator |
| `ReelCard.tsx` | Social reels card |
| `ReelsVaultModal.tsx` | Reels collection vault |
| `PlaylistItem.tsx` | Playlist list item |
| `AddToPlaylistModal.tsx` | Add song to playlist |
| `CreatePlaylistModal.tsx` | Create new playlist |
| `PlaylistSelectionModal.tsx` | Select playlist |
| `GradientPicker.tsx` | Theme gradient selector |
| `GradientBackground.tsx` | Animated morphing gradients |
| `Toast.tsx` | Spring-animated notifications |
| `CustomMenu.tsx` | iOS-style anchored menus |
| `ProcessingOverlay.tsx` | Loading/processing overlay |
| `QualitySelector.tsx` | Audio quality selector |

### `src/screens/` (The Orchestration Layer)
| Screen | Description |
|--------|-------------|
| `LibraryScreen.tsx` | Home view with grid/list hybrid layout |
| `NowPlayingScreen.tsx` | Main reader with 60fps scroll engine, **Magic Button**, and search integration |
| `AddEditLyricsScreen.tsx` | Manual entry and metadata management |
| `SearchScreen.tsx` | Real-time cross-field search engine |
| `SettingsScreen.tsx` | iOS-style configuration with clear data option |
| `AudioDownloaderScreen.tsx` | Multi-source audio downloader |
| `CoverArtSearchScreen.tsx` | Cover art search and selection |
| `LikedSongsScreen.tsx` | Favorited songs collection |
| `PlaylistDetailScreen.tsx` | Individual playlist view |
| `PlaylistsScreen.tsx` | All playlists management |
| `ReelsScreen.tsx` | Vertical short-form content feed |
| `YoutubeBrowserScreen.tsx` | YouTube audio browser |

### `src/services/` (The Core Engine)
| Service | Description |
|---------|-------------|
| `MultiSourceLyricsService.ts` | Parallel fetching from all providers (5s race) |
| `JioSaavnLyricsService.ts` | Official JioSaavn API wrapper |
| `LyricaService.ts` | Lyrica API client |
| `LrcLibService.ts` | LRCLIB API client |
| `GeniusService.ts` | Robust scraper with metadata scrubbing |
| `SmartLyricMatcher.ts` | Match scoring logic |
| `Tamil2LyricsService.ts` | Tamil lyrics service |
| `TransliterationService.ts` | Romanization for regional languages |
| `LyricsRepository.ts` | Unified search orchestration |
| `DownloadManager.ts` | Download queue and management |
| `AudioExtractorService.ts` | Audio extraction |
| `MusicSearchService.ts` | Music search |
| `NativeSearchService.ts` | Native search |
| `ImageSearchService.ts` | Cover art search |
| `mediaScanner.ts` | Local media scanning |
| `ReelsBufferManager.ts` | Reels buffer management |
| `ReelsRecommendationEngine.ts` | Content recommendations |

### `src/store/` (Reactive State - Zustand)
| Store | Description |
|-------|-------------|
| `songsStore.ts` | Master song list and metadata state |
| `playerStore.ts` | Playback state and session queue |
| `settingsStore.ts` | UI preferences and persistence |
| `playlistStore.ts` | Playlist management state |
| `downloadQueueStore.ts` | Download queue state |
| `lyricsScanQueueStore.ts` | Lyrics scan queue |
| `reelsFeedStore.ts` | Reels feed state |
| `reelsPreferencesStore.ts` | Reels preferences |
| `dailyStatsStore.ts` | Daily listening statistics |
| `artHistoryStore.ts` | Recent cover art history |

### `src/database/` (The Persistence Layer)
| File | Description |
|------|-------------|
| `db.ts` | Core SQLite initialization, singleton management, and recovery logic |
| `queries.ts` | CRUD operations with built-in retry logic and error handling |
| `playlistQueries.ts` | Playlist-specific CRUD operations |
| `db_migration.ts` | Database migration management |
| `sampleData.ts` | Template metadata to populate the app on first run |

### `src/utils/` (Logic Helpers)
| File | Description |
|------|-------------|
| `timestampParser.ts` | The engine that converts raw text into structured `LyricLine` objects |
| `formatters.ts` | Time and text formatting utilities |
| `gradients.ts` | Gradient generation and utilities |
| `imageAnalyzer.ts` | Image brightness analysis |
| `exportImport.ts` | JSON serialization for library backups |

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

### Smart Lyric Search (The Magic Button) ✨
- **Parallel Fetching**: Hits **LRCLIB**, **JioSaavn**, and **Lyrica** simultaneously
- **Match Scoring**: System assigns a confidence score to every result
- **Preview Mode**: Full-screen preview before applying lyrics
- **Dynamic Theme**: Magic button gradient matches current song's theme

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
- **Playlists**: Create, edit, and manage playlists

### Audio Download & Streaming
- **Multi-source download**: Download from JioSaavn, Wynk, Gaana, NetEase
- **Quality selection**: Choose audio quality (128k, 320k, FLAC)
- **Download queue**: Manage multiple downloads
- **Batch processing**: Process multiple songs at once

### Reels & Social Features
- **Reels feed**: Vertical short-form content
- **Recommendations**: AI-powered content suggestions
- **Vault**: Save favorite reels

### Transliteration Support
- **Romanization**: Convert Tamil, Hindi, and other regional lyrics to Roman script
- **Language picker**: Select source and target languages
- **Toggle view**: Switch between original and transliterated lyrics

### UI/UX Enhancements
- **Auto-hide controls**: Player controls fade out after 3.5s when playing, stay visible when paused. Re-appears on interaction.
- **Dynamic Island**: Adaptive vignette based on cover art brightness (light vs dark)
- **Vinyl Record**: 60% cover art, 3% center hole for better proportions
- **Toast notifications**: Success feedback on song save (auto-dismisses after 2s)
- **Navigation**: Fallback to Main screen if goBack() fails
- **Solid Controls**: Now Playing controls feature a semi-transparent dark blurred background

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
  lyricSource TEXT,
  transliterated_lyrics TEXT,
  instrumental_stem_uri TEXT,
  vocal_stem_uri TEXT,
  separation_status TEXT DEFAULT 'none',
  separation_progress INTEGER DEFAULT 0
);

CREATE TABLE playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_uri TEXT,
  is_default INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  date_created TEXT NOT NULL,
  date_modified TEXT NOT NULL
);

CREATE TABLE playlist_songs (
  playlist_id TEXT,
  song_id TEXT,
  order_index INTEGER,
  PRIMARY KEY (playlist_id, song_id)
);
```

### Key Type Definitions (src/types/song.ts)

```typescript
export interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  gradientId: string;
  duration: number;
  lyrics: LyricLine[];
  lyricsAlign?: 'left' | 'center' | 'right';
  textCase?: 'normal' | 'uppercase' | 'titlecase' | 'sentencecase';
  transliteratedLyrics?: LyricLine[];
  // ... more fields
}

export interface UnifiedSong {
  id: string;
  title: string;
  artist: string;
  highResArt: string;
  downloadUrl: string;
  source: 'Saavn' | 'Wynk' | 'NetEase' | 'SoundCloud' | 'Audiomack' | 'Gaana' | 'Local';
  duration?: number;
  hasLyrics?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverImageUri?: string;
  isDefault: boolean;
  sortOrder: number;
  songCount?: number;
}
```

---

## 📱 Standalone Deployment

LuvLyrics is designed to run purely on your phone without needing a laptop or local server. All playback logic (Zustand) and library management (SQLite) happen on-device.

### How to get the APK? (Choose one method)

#### Option A: Local Build (No-EAS / Your Machine) 💻
This project includes a pre-configured native `android` folder. You can build the APK directly on your machine:

1.  **Navigate to Android folder**:
    ```bash
    cd android
    ```
2.  **Generate Release APK**:
    ```bash
    ./gradlew assembleRelease
    ```
3.  **Find your APK**: The file will be generated at:
    `android/app/build/outputs/apk/release/app-release.apk`
    *You can copy this file directly to your phone via USB or cloud storage.*

#### Option B: Expo EAS Cloud Build (Remote) ☁️
If you don't have the Android SDK installed, use Expo EAS:

1.  **Install EAS CLI**: `npm install -g eas-cli`
2.  **Login**: `eas login`
3.  **Run Build**: `eas build -p android --profile production`
4.  **Download**: EAS will provide a download link once finished.

> All search features (Lyrics, Downloads) require a standard internet connection to reach public APIs (LRCLIB, JioSaavn), but the core playback and library features are 100% offline-ready once the app is installed.

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
