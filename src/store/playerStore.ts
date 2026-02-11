/**
 * LyricFlow - Player Store (Zustand)
 * Manages the Now Playing / lyrics reader state
 */

import { create } from 'zustand';
import { LyricLine } from '../types/song';
import { getCurrentLineIndex } from '../utils/timestampParser';
import { audioService } from '../services/audioService';

interface PlayerState {
  // State
  isPlaying: boolean;          // Auto-scroll enabled
  currentTime: number;         // Current position in seconds
  currentLineIndex: number;    // Current lyric line index
  duration: number;            // Total duration in seconds
  lyrics: LyricLine[];         // Current song's lyrics
  queueSongIds: string[];      // In-memory queue for upcoming songs
  shouldAutoPlayOnLoad: boolean;
  isScrubbing: boolean;        // User is actively scrubbing
  
  // Scroll speed settings
  scrollSpeed: 'slow' | 'medium' | 'fast';
  skipDuration: 10 | 15 | 30;  // Seconds to skip forward/back
  
  // Actions
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number, fromSync?: boolean) => void;
  skipPrevious: () => void;
  skipNext: () => void;
  setLyrics: (lyrics: LyricLine[], duration: number) => void;
  setDuration: (duration: number) => void; // Added
  setIsPlaying: (isPlaying: boolean) => void; // Added
  tick: (dt?: number) => void;            // Called by interval timer
  reset: () => void;
  setScrollSpeed: (speed: 'slow' | 'medium' | 'fast') => void;
  setSkipDuration: (duration: 10 | 15 | 30) => void;
  enqueueSong: (songId: string) => void;
  dequeueNextSong: () => string | null;
  clearQueue: () => void;
  setShouldAutoPlayOnLoad: (value: boolean) => void;
  setIsScrubbing: (value: boolean) => void;
}

// Get tick interval based on scroll speed
const getTickInterval = (speed: 'slow' | 'medium' | 'fast'): number => {
  switch (speed) {
    case 'slow': return 1500;    // 1.5s per tick
    case 'medium': return 1000;  // 1s per tick
    case 'fast': return 750;     // 0.75s per tick
  }
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  isPlaying: false,
  currentTime: 0,
  currentLineIndex: 0,
  duration: 0,
  lyrics: [],
  queueSongIds: [],
  shouldAutoPlayOnLoad: false,
  isScrubbing: false,
  scrollSpeed: 'medium',
  skipDuration: 15,
  
  // Setters
  setDuration: (duration: number) => set({ duration }),
  setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),

  // Play (start auto-scroll)
  play: async () => {
    console.log('[PLAYER] Play called');
    set({ isPlaying: true });
    
    // Play audio if loaded (deferred to allow UI to update first)
    setTimeout(async () => {
      try {
        if (audioService.isAudioLoaded()) {
          console.log('[PLAYER] Playing audio');
          await audioService.play();
        } else {
          console.log('[PLAYER] No audio loaded');
        }
      } catch (error) {
        console.error('[PLAYER] Play error:', error);
      }
    }, 0);
  },
  
  // Pause (stop auto-scroll)
  pause: async () => {
    set({ isPlaying: false });
    
    // Pause audio if loaded
    try {
      if (audioService.isAudioLoaded()) {
        await audioService.pause();
      }
    } catch (error) {
      console.error('[PLAYER] Pause error:', error);
    }
  },
  
  // Toggle play/pause
  togglePlay: async () => {
    const { isPlaying } = get();
    if (isPlaying) {
      await get().pause();
    } else {
      await get().play();
    }
  },
  
  // Seek to specific time
  seek: (time: number, fromSync = false) => {
    const { lyrics, duration } = get();
    const clampedTime = Math.max(0, Math.min(time, duration));
    const lineIndex = getCurrentLineIndex(lyrics, clampedTime);
    
    // Call audio service to seek if not from sync
    if (!fromSync) {
      audioService.seek(clampedTime);
    }
    
    set({ 
      currentTime: clampedTime,
      currentLineIndex: lineIndex,
    });
  },
  
  // Skip to previous lyric line
  skipPrevious: () => {
    const { lyrics, currentLineIndex } = get();
    
    if (currentLineIndex > 0) {
      const prevIndex = currentLineIndex - 1;
      const prevLine = lyrics[prevIndex];
      
      set({
        currentLineIndex: prevIndex,
        currentTime: prevLine.timestamp,
      });
    } else {
      // Go to start
      set({
        currentLineIndex: 0,
        currentTime: lyrics[0]?.timestamp ?? 0,
      });
    }
  },
  
  // Skip to next lyric line
  skipNext: () => {
    const { lyrics, currentLineIndex } = get();
    
    if (currentLineIndex < lyrics.length - 1) {
      const nextIndex = currentLineIndex + 1;
      const nextLine = lyrics[nextIndex];
      
      set({
        currentLineIndex: nextIndex,
        currentTime: nextLine.timestamp,
      });
    }
  },
  
  // Set lyrics for current song
  setLyrics: (lyrics: LyricLine[], duration: number) => {
    set({
      lyrics,
      duration,
      currentTime: 0,
      currentLineIndex: 0,
      isPlaying: false,
    });
  },
  
  // Tick - called by interval timer for auto-scroll
  tick: (dt?: number) => {
    const { isPlaying, currentTime, duration, lyrics, scrollSpeed } = get();
    
    if (!isPlaying) return;
    
    if (duration > 0 && currentTime >= duration) {
      set({ isPlaying: false });
      return;
    }
    
    // Increment time based on scroll speed or provided delta
    const increment = dt !== undefined ? dt : (getTickInterval(scrollSpeed) / 1000);
    const newTime = currentTime + increment;
    const lineIndex = getCurrentLineIndex(lyrics, newTime);
    
    set({
      currentTime: newTime,
      currentLineIndex: lineIndex,
    });
  },
  
  // Reset player state
  reset: () => {
    set({
      isPlaying: false,
      currentTime: 0,
      currentLineIndex: 0,
      duration: 0,
      lyrics: [],
    });
  },
  
  // Set scroll speed
  setScrollSpeed: (scrollSpeed) => {
    set({ scrollSpeed });
  },
  
  // Set skip duration
  setSkipDuration: (skipDuration) => {
    set({ skipDuration });
  },

  enqueueSong: (songId) => {
    set((state) => ({
      queueSongIds: [...state.queueSongIds, songId],
    }));
  },

  dequeueNextSong: () => {
    const { queueSongIds } = get();
    if (queueSongIds.length === 0) return null;

    const [nextSongId, ...rest] = queueSongIds;
    set({ queueSongIds: rest });
    return nextSongId;
  },

  clearQueue: () => {
    set({ queueSongIds: [] });
  },

  setShouldAutoPlayOnLoad: (value) => {
    set({ shouldAutoPlayOnLoad: value });
  },

  setIsScrubbing: (value) => {
    set({ isScrubbing: value });
  },
}));

// Export tick interval getter for use in components
export { getTickInterval };
