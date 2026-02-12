# Smart Lyric Flow Implementation Changes

## New Feature: Waterfall Search Engine
Implemented a tiered search system to ensure high-quality lyrics with minimal user effort.

### Tier 1: LRCLIB (Synced)
- **Service**: `src/services/LrcLibService.ts`
- **Functionality**: Fetches professional LRC-formatted synced lyrics.
- **Precision**: Sub-millisecond timestamps.
- **Fallback**: Automatically defaults to Tier 2 if no synced result has a high match score (>80%).

### Tier 2: Genius (Fallback)
- **Service**: `src/services/GeniusService.ts`
- **Functionality**: Scrapes Genius.com for plain text lyrics.
- **Sanitization**: Robust scrubbing of web metadata (e.g., "contributors", "translations", "embedded scripts", "Harry Styles cover").
- **Smart Scoring**: `SmartLyricMatcher.ts` verifies the result against song duration and metadata.

## UI/UX Enhancements

### Magic Button (Dynamic Gradient)
- **Location**: `src/screens/NowPlayingScreen.tsx`
- **Feature**: Sparkle icon button that dynamically changes its background gradient to match the current song's theme.
- **Implementation**: Uses `LinearGradient` and `artHistoryStore` metadata.

### Lyric Preview Mode
- **Component**: `src/components/LrcSearchModal.tsx`
- **Feature**: Full-screen preview overlay with ScrollView.
- **Verification**: Allows users to read and scroll through lyrics before applying them to the song.
- **Controls**: "Back" to search list, "Apply" to update song lyrics.

## Maintenance & Cleanup

### Dependency Removal
- **REMOVED**: `ffmpeg-kit-react-native` (Reduced build size and complexity).
- **REMOVED**: `onnxruntime-react-native` (Removed heavy AI model requirements).
- **REMOVED**: `VAD` (Voice Activity Detection) hooks and services.

### Database Updates
- **Schema**: Added `lyricSource` column to track the origin of lyrics (LRCLIB, Genius, Manual).
- **Pruning**: Removed abandoned `vocal_stem_uri`, `instrumental_stem_uri`, etc.

### Reliability
- **AbortController**: Implemented in network services to prevent hanging requests.
- **User-Agent**: Added custom headers to comply with API/Scraping best practices.
- **ESLint**: Cleaned up legacy warnings and unnecessary escape characters.
