# 🎵 LuvLyrics (LyricFlow): The Deep Dive

> **A Premium, Privacy-First, Local Lyrics Experience.**

LuvLyrics isn't just a lyrics storage app; it's a visual instrument designed to turn your lyric-reading into a cinematic experience. This document provides a comprehensive breakdown of the project's architecture, technical decisions, and file-by-file organization.

---

## 📖 Table of Contents
1. [Project Philosophy](#project-philosophy)
2. [Technical Foundations](#technical-foundations)
3. [Directory Architecture](#directory-architecture)
4. [Design System](#design-system)
5. [Key Features](#key-features)
6. [Future Roadmap](#future-roadmap)

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
- **Logic**: It calculates a high-precision `deltaTime` (ms since last frame) to update the scroll offset and playback tick.
- **Auto-Hide Logic**: Controls automatically fade out after 3.5 seconds of inactivity during playback.
- **Battery Saver**: Background animations can be disabled via the top-right menu to reduce GPU load.

### Robust Database Singleton
Expo SQLite can throw `NullPointerException` if multiple parts of the app try to open or query the database simultaneously.
- **Solution**: Implemented in `db.ts` using a `dbPromise` singleton pattern.
- **Recovery Path**: Automatic recovery mechanism that attempts to close, delete, and re-initialize the native state.
- **WAL Mode**: Enabled for concurrent reads/writes.

### Smart Timestamp Engine
The app handles "messy" data intelligently.
- **Regex**: `[\\[\\(]?(\\d{1,2})[:.](\\d{2})[\\]\\)]?`
- **Cleansing**: Aggressively cleans display text by stripping leading hyphens, colons, and pipes.

### Parallel Search Engine
The app implements a robust, tiered lyric fetching system.
- **Engine**: Orchestrated by `LyricsRepository.ts` using `MultiSourceLyricsService`.
- **Strategy**: 
    - **Parallel Fetching**: Hits **LRCLIB**, **JioSaavn**, and **Lyrica** simultaneously (5s race).
    - **Ranking**: Results are scored via `SmartLyricMatcher.ts` and ranked for the user.
    - **User Selection**: Preview mode allows users to pick the best source with colorful badges.
- **Hardware & Lock Screen Sync**: Fully integrated with `expo-audio`, supporting Bluetooth remote commands and system metadata.

### Instant Playback Architecture ⚡
To achieve <100ms startup times, the app uses an **Optimistic UI pattern**:
- **Problem**: Waiting for a full database query delays audio start by 300-500ms.
- **Solution**: The `loadSong` action in `playerStore.ts` immediately hydrates from memory cache and starts playback instantly.
- **Background Hydration**: Full lyrics and metadata are fetched asynchronously from SQLite.
- **Memoization**: The Library list uses strict `React.memo` and stable callbacks.

---

## 📂 Directory Architecture

### `src/components/`
| Component | Description |
|-----------|-------------|
| `LrcSearchModal.tsx` | Unified search interface with **Preview Mode** |
| `AuroraHeader.tsx` | **Skia-powered** organic blurred background |
| `VinylRecord.tsx` | Rotating vinyl record UI |
| `LyricsLine.tsx` | Animated line with scale, opacity, and glow |
| `PlayerControls.tsx` | Playback control buttons |
| `Scrubber.tsx` | Timeline progress bar with optimistic seeking |
| `MiniPlayer.tsx` | Compact player for background playback |
| `IslandScrubber.tsx` | Dynamic Island style progress indicator |
| `SynchronizedLyrics.tsx` | High-precision synced lyrics renderer |
| `MagicModeModal.tsx` | AI-powered magic lyrics search |
| `ManualSyncModal.tsx` | Manual timestamp synchronization |
| `LanguagePickerModal.tsx` | Transliteration language selector |
| `AIGeneratorModal.tsx` | AI lyrics generation |
| `BatchReviewModal.tsx` | Batch lyrics review |
| `BulkSwapModal.tsx` | Bulk operations |
| `CoverFlow.tsx` | 3D cover carousel |
| `MosaicCover.tsx` | Grid mosaic display |
| `DownloadGridCard.tsx` | Download item card |
| `DownloadQueueModal.tsx` | Download queue management |
| `ReelCard.tsx` | Social reels card |
| `PlaylistItem.tsx` | Playlist list item |
| `AddToPlaylistModal.tsx` | Add to playlist |
| `CreatePlaylistModal.tsx` | Create playlist |
| `GradientPicker.tsx` | Theme gradient selector |

### `src/screens/`
| Screen | Description |
|--------|-------------|
| `LibraryScreen.tsx` | Home view (Grid + List) |
| `NowPlayingScreen.tsx` | Lyric reader (60fps Engine) |
| `AddEditLyricsScreen.tsx` | Manual entry |
| `SearchScreen.tsx` | Library search |
| `SettingsScreen.tsx` | App preferences |
| `AudioDownloaderScreen.tsx` | Audio downloader |
| `CoverArtSearchScreen.tsx` | Cover art search |
| `LikedSongsScreen.tsx` | Favorites |
| `PlaylistDetailScreen.tsx` | Playlist view |
| `PlaylistsScreen.tsx` | Playlists |
| `ReelsScreen.tsx` | Short-form content |
| `YoutubeBrowserScreen.tsx` | YouTube browser |

### `src/services/`
| Service | Description |
|---------|-------------|
| `MultiSourceLyricsService.ts` | Parallel fetching |
| `JioSaavnLyricsService.ts` | JioSaavn API |
| `LyricaService.ts` | Lyrica API |
| `LrcLibService.ts` | LRCLIB API |
| `GeniusService.ts` | Genius scraper |
| `SmartLyricMatcher.ts` | Match scoring |
| `Tamil2LyricsService.ts` | Tamil lyrics |
| `TransliterationService.ts` | Romanization |
| `DownloadManager.ts` | Download queue |
| `ReelsRecommendationEngine.ts` | Content recommendations |

### `src/store/` (Zustand)
| Store | Description |
|-------|-------------|
| `songsStore.ts` | Master song list |
| `playerStore.ts` | Playback state |
| `settingsStore.ts` | UI preferences |
| `playlistStore.ts` | Playlist management |
| `downloadQueueStore.ts` | Download queue |
| `reelsFeedStore.ts` | Reels feed |
| `dailyStatsStore.ts` | Daily statistics |

### `src/database/`
| File | Description |
|------|-------------|
| `db.ts` | SQLite initialization |
| `queries.ts` | Song CRUD |
| `playlistQueries.ts` | Playlist CRUD |
| `db_migration.ts` | Migrations |

---

## 🔄 The Lifecycle of a Lyric

1. **Search**: User clicks the ✨ Magic button.
2. **Fetch**: `MultiSourceLyricsService` queries multiple providers in parallel.
3. **Preview**: User scrolls through results and previews the text.
4. **Parsing**: `timestampParser.ts` identifies timestamps and cleans text.
5. **Storage**: `queries.ts` saves to SQLite.
6. **Animation**: The **60fps Scroll Engine** starts.

---

## 🪄 Smart Search Workflow

1. **Access**: Tap the ✨ Magic button on Now Playing.
2. **Search**: Type title/artist (defaults to current song).
3. **Waterfall**: System searches all sources in parallel.
4. **Select**: Tap a result to enter **Preview Mode**.
5. **Apply**: Tap "Apply Lyrics" to update.

---

## ✨ Key Features

### Lyrics Display
- Spotify/Apple Music-style scrolling
- 60fps animation using requestAnimationFrame
- Text case transformation (Normal, UPPERCASE, Title Case, Sentence case)
- Alignment options (Left, Center, Right)
- Instrumental indicators with animated bars
- Glow effects on active lyrics

### Smart Search
- Multi-source parallel fetching
- Match scoring and ranking
- Preview before apply
- Dynamic gradient theming

### Library Management
- Grid/List hybrid view
- Custom cover art upload
- Recently played tracking
- Playlist management (CRUD)
- Liked songs collection

### Audio Features
- Multi-source downloads
- Quality selection
- Download queue
- Background playback

### Social Features
- Reels feed
- Content recommendations
- Vault for favorites

### Regional Support
- Transliteration for Tamil/Hindi
- Language picker
- Toggle original/transliterated

---

## 🛣️ Future Roadmap

- [ ] **Persistent Queues**: Move queue to SQLite
- [ ] **Local LRC Export**: Export lyrics to .lrc files
- [ ] **Visualizer**: Real-time waveform
- [ ] **More Transliteration Languages**: Telugu, Malayalam, Kannada

---

*LuvLyrics is a labor of love for people who still value their own personal library and the art of reading music.*
