# Product Overview

## Project Identity
**LuvLyrics (LyricFlow)** - A premium, privacy-first, local lyrics experience for mobile devices.

## Purpose & Value Proposition
LuvLyrics transforms lyric-reading into a cinematic, immersive experience. Built on three core pillars:
1. **Local-First Reliability**: All data stored locally in SQLite - no cloud dependencies, no tracking
2. **Visual Immersion**: Skia-powered blurs and animated gradients inspired by Apple Music's aesthetic
3. **Frictionless Input**: Intelligent parsing that handles messy text from ChatGPT or traditional LRC formats

## Key Features

### Lyrics Display & Interaction
- **Spotify/Apple Music-style scrolling**: Active line fixed at 30% from top with 60fps scroll engine
- **Smart animations**: Spring physics (damping: 20, stiffness: 90, mass: 0.8) for smooth transitions
- **Text formatting**: Per-song text case options (Normal, ALL CAPS, Title Case, Sentence case)
- **Alignment options**: Left/Center/Right alignment per song
- **Instrumental indicators**: Animated vertical bars for `[INSTRUMENTAL]` sections
- **Glow effects**: Active lyrics with white glow (opacity: 0.6, radius: 20px)
- **Skip controls**: ±10 second seek buttons for precise navigation

### Smart Lyric Search (The Magic Button) ✨
- **Waterfall Strategy**: Tiered fetching from **LRCLIB (Synced)** first, then falling back to **Genius (Plain Text)**.
- **Lyric Preview Mode**: Full-screen preview allows users to verify and scroll through found lyrics before applying them.
- **Dynamic Theming**: The Magic Button background dynamically shifts its gradient to match the current song's `gradientId`.
- **Robust Scraping**: Intelligent cleaning of Genius metadata ensures a pure reading experience without web clutter.
- **Match Scoring**: Automatic verification of result relevance using title, artist, and duration metadata.

### On-Device AI (Legacy)
- **Whisper AI**: (Legacy) Support for local transcription using `whisper.rn`.
- **Privacy-First**: No network required for transcription after initial model download.

### Cover Art Management
- **Custom uploads**: Long-press (1.5s) cover art to upload from gallery
- **Recent art reuse**: Quick access to recently used cover art
- **Gradient fallback**: Default to theme gradient if no custom cover set
- **Persistent storage**: Cover URIs saved per song in database

### Library Organization
- **Hybrid layout**: Top 2 songs in grid ("Most Played"), rest in list view ("All Songs")
- **List view details**: Shows thumbnail, title, artist, duration (MM:SS format)
- **Long-press actions**: Access cover art upload from any song card
- **Recently Played**: Horizontal scrolling list of last 10 listened songs
- **Real-time search**: Cross-field search engine across title, artist, album, lyrics

### UI/UX Enhancements
- **Auto-hide controls**: Player controls fade after 3.5s when playing, stay visible when paused
- **Toast notifications**: Success feedback with auto-dismiss after 2s
- **Submenu system**: Nested menus for text format options
- **Clear data**: Settings option to wipe all songs/lyrics with confirmation

## Target Users
- Lyrics enthusiasts who want a premium reading experience
- Privacy-conscious users who prefer local-first apps
- Music lovers who enjoy visual aesthetics and smooth animations
- Users who need flexible lyrics input (AI-generated or manual timestamps)

## Use Cases
1. **Immersive Lyric Reading**: Follow along with songs using smooth, synchronized scrolling
2. **Lyrics Creation**: Generate timestamped lyrics using AI or manual input
3. **Library Management**: Organize personal lyrics collection with custom cover art
4. **Offline Experience**: Enjoy full functionality without internet connection
5. **Visual Customization**: Personalize each song with gradients and formatting options
