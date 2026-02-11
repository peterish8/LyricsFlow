# Project Structure

## Directory Organization

### Root Level
```
LuvLyrics/
├── src/                    # Main application source code
├── android/                # Android native configuration
├── assets/                 # App icons and splash screens
├── docs/                   # Documentation files
├── .amazonq/rules/         # Amazon Q rules and memory bank
├── App.tsx                 # Root application component
├── index.ts                # Entry point
├── package.json            # Dependencies and scripts
├── app.json                # Expo configuration
├── tsconfig.json           # TypeScript configuration
└── babel.config.js         # Babel configuration
```

### Source Directory (`src/`)

#### **`src/components/`** - UI Building Blocks
- **`AIGeneratorModal.tsx`**: Interface for generating ChatGPT prompt templates
- **`AuroraHeader.tsx`**: Skia-powered organic blurred background system
- **`CustomAlert.tsx`**: Custom alert dialog component
- **`CustomMenu.tsx`**: iOS-style anchored drop-up menu with dynamic positioning
- **`CustomTabBar.tsx`**: Custom tab bar for navigation
- **`GradientBackground.tsx`**: Animated morphing gradients with GPU acceleration
- **`GradientPicker.tsx`**: High-performance preset selector
- **`LyricsLine.tsx`**: Animated line component with distance-based blur and glow
- **`MagicModeModal.tsx`**: AI timestamp generation interface
- **`MiniPlayer.tsx`**: Compact player for non-playing screens
- **`PlayerControls.tsx`**: Core playback interaction buttons with ±10s skip
- **`ProcessingOverlay.tsx`**: Visual feedback during AI processing
- **`Scrubber.tsx`**: Timeline progress bar with optimistic seeking
- **`SongCard.tsx`**: Grid/list item with gradient fallbacks and custom cover art
- **`Toast.tsx`**: Spring-animated notification component with auto-dismiss
- **`index.ts`**: Component exports

#### **`src/constants/`** - Design System
- **`colors.ts`**: True Black foundation for AMOLED contrast
- **`gradients.ts`**: 24+ curated vibrant visual presets (Midnight Dreams, Ocean Breeze, etc.)
- **`typography.ts`**: Scaled font sizes for accessibility
- **`index.ts`**: Constants exports

#### **`src/database/`** - Persistence Layer
- **`db.ts`**: SQLite initialization, singleton management, recovery logic
- **`queries.ts`**: CRUD operations with built-in retry logic and error handling
- **`sampleData.ts`**: Template metadata for first-run population
- **`index.ts`**: Database exports

#### **`src/navigation/`** - Navigation Structure
- **`RootNavigator.tsx`**: Root stack navigator
- **`TabNavigator.tsx`**: Bottom tab navigation
- **`index.ts`**: Navigation exports

#### **`src/screens/`** - Main Application Screens
- **`AddEditLyricsScreen.tsx`**: Form for song metadata, lyrics parsing, alignment picker
- **`LibraryScreen.tsx`**: Hybrid layout (grid + list) with thumbnails and duration
- **`NowPlayingScreen.tsx`**: Main lyric reader with 60fps scroll engine
- **`SearchScreen.tsx`**: Real-time cross-field search engine
- **`SettingsScreen.tsx`**: iOS-style configuration with clear data option
- **`index.ts`**: Screen exports

#### **`src/services/`** - Business Logic Services
- **`audioService.ts`**: Audio playback management
- **`autoTimestampServiceV2.ts`**: Dynamic Time Warping (DTW) for lyric alignment
- **`mediaScanner.ts`**: Device media scanning functionality
- **`whisperService.ts`**: On-device Whisper AI integration
- **`whisperSetup.ts`**: Whisper model initialization and configuration

#### **`src/store/`** - State Management (Zustand)
- **`artHistoryStore.ts`**: Tracks "Recent Art" for quick reuse
- **`playerStore.ts`**: Playback state, Session Queue, auto-play controls
- **`settingsStore.ts`**: Persists UI preferences to disk
- **`songsStore.ts`**: Master song list and metadata state
- **`index.ts`**: Store exports

#### **`src/types/`** - TypeScript Definitions
- **`gradient.ts`**: Gradient type definitions
- **`navigation.ts`**: Navigation type definitions
- **`song.ts`**: Song and lyric type definitions
- **`index.ts`**: Type exports

#### **`src/utils/`** - Helper Functions
- **`audioConverter.ts`**: Audio format conversion utilities
- **`exportImport.ts`**: JSON serialization for library backups
- **`formatters.ts`**: Time and text formatting utilities
- **`gradients.ts`**: Gradient manipulation utilities
- **`timestampParser.ts`**: Converts raw text into structured `LyricLine` objects
- **`index.ts`**: Utility exports

## Core Components & Relationships

### Data Flow Architecture
```
User Input → Screen → Store (Zustand) → Database (SQLite)
                ↓
            Components ← Services (Audio, AI)
```

### Key Relationships

1. **Screens ↔ Stores**: Screens consume and update Zustand stores
2. **Stores ↔ Database**: Stores persist data to SQLite via queries
3. **Components ↔ Stores**: Components read reactive state from stores
4. **Services ↔ Stores**: Services update stores with playback/AI results
5. **Utils ↔ All Layers**: Utilities provide pure functions across the app

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
  text_case TEXT DEFAULT 'normal'
);
```

## Architectural Patterns

### 1. Singleton Pattern
- **Database Connection**: Single `dbPromise` ensures one connection across app
- **Recovery Mechanism**: Automatic retry on NullPointerException

### 2. Store Pattern (Zustand)
- **Reactive State**: Components auto-update on store changes
- **Persistence**: Settings and player state persist to AsyncStorage
- **Separation of Concerns**: Each store handles specific domain

### 3. Service Layer Pattern
- **Audio Service**: Encapsulates Expo AV playback logic
- **Whisper Service**: Isolates AI processing complexity
- **DTW Service**: Handles timestamp alignment algorithms

### 4. Component Composition
- **Atomic Design**: Small, reusable components (LyricsLine, Toast)
- **Container/Presenter**: Screens orchestrate, components present
- **Props Drilling Avoidance**: Zustand stores eliminate prop chains

### 5. 60fps Scroll Engine
- **requestAnimationFrame Loop**: High-precision deltaTime calculations
- **Fixed Positioning**: Active line at 30% from top (viewPosition: 0.3)
- **No Layout Shifts**: Same font weight for active/inactive prevents reflow

## Lifecycle of a Lyric

1. **Input**: User pastes text into `AddEditLyricsScreen`
2. **Parsing**: `timestampParser.ts` extracts timestamps and cleans text
3. **Storage**: `queries.ts` saves structured data to SQLite atomically
4. **Display**: `NowPlayingScreen` loads structured data from store
5. **Animation**: 60fps Scroll Engine animates `LyricsLine` with sub-ms precision
6. **Interaction**: User taps line → `seek()` updates state → scroll realigns instantly
