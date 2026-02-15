/**
 * Reels Buffer Manager
 * Manages bi-directional audio buffer for instant swipe playback
 * Uses expo-av (NOT expo-audio) to avoid conflicts with main player
 */

import { Audio } from 'expo-av';
import { UnifiedSong } from '../types/song';

// STRICT SLIDING WINDOW: 1 Behind + 1 Current + 4 Ahead = 6 Total
// This ensures we always have 6 songs loaded in memory, no more, no less.
// This ensures we always have 6 songs loaded in memory, no more, no less. 
const BUFFER_BEHIND = 1; // Keep 1 song loaded behind for instant swipe-back
const BUFFER_AHEAD = 4; // Pre-load 4 songs ahead for instant playback

interface AudioSlot {
  sound: Audio.Sound | null;
  song: UnifiedSong | null;
  isLoaded: boolean;
}

class ReelsBufferManager {
  private slots: Map<number, AudioSlot> = new Map();
  private activeIndex: number = -1;
  private isInitialized: boolean = false;
  private loadingPromises: Map<number, Promise<void>> = new Map();

  /**
   * Enter Reels Mode - Set up audio focus for independent playback
   */
  async enterReelsMode() {
    if (this.isInitialized) return;

    console.log('[ReelsBuffer] Entering Reels mode, setting up audio focus');
    
    try {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        playsInSilentModeIOS: true,
      });
      
      this.isInitialized = true;
      console.log('[ReelsBuffer] Audio focus configured');
    } catch (error) {
      console.error('[ReelsBuffer] Failed to set audio mode:', error);
    }
  }

  /**
   * Exit Reels Mode - Clean up all sounds and reset audio mode
   */
  async exitReelsMode() {
    console.log('[ReelsBuffer] Exiting Reels mode, cleaning up');
    
    // Unload all sounds
    for (const [index, slot] of this.slots.entries()) {
      if (slot.sound) {
        try {
          await slot.sound.unloadAsync();
        } catch (error) {
          console.error(`[ReelsBuffer] Failed to unload slot ${index}:`, error);
        }
      }
    }
    
    this.slots.clear();
    this.activeIndex = -1;
    this.isInitialized = false;
    
    // Reset audio mode to default
    try {
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        playsInSilentModeIOS: true,
      });
      console.log('[ReelsBuffer] Audio mode reset to default');
    } catch (error) {
      console.error('[ReelsBuffer] Failed to reset audio mode:', error);
    }
  }

  /**
   * Update active index - shifts buffer window, loads/unloads as needed
   */
  async updateActiveIndex(newIndex: number, feedSongs: UnifiedSong[]) {
    if (newIndex === this.activeIndex) return;
    
    console.log(`[ReelsBuffer] Changing active index: ${this.activeIndex} → ${newIndex}`);
    
    // 1. FAST STOP: Immediately stop the current song (most important for "instant" feel)
    if (this.activeIndex !== -1 && this.activeIndex !== newIndex) {
        const currentSlot = this.slots.get(this.activeIndex);
        if (currentSlot?.sound) {
            try {
                // stopAsync rewinds to 0 and stops. smoother than pause for swipes.
                await currentSlot.sound.stopAsync(); 
            } catch (error) {
                console.log(`[ReelsBuffer] Failed to stop slot ${this.activeIndex}:`, error);
            }
        }
    }

    // 2. Safety Cleanup: Ensure no other songs are playing (race condition guard)
    for (const [index, slot] of this.slots.entries()) {
        if (slot.sound && index !== newIndex && index !== this.activeIndex) {
            try {
                await slot.sound.stopAsync();
            } catch (error) {
                console.log(`[ReelsBuffer] Failed to stop slot ${index}:`, error);
            }
        }
    }
    
    this.activeIndex = newIndex;
    
    // 3. Play new active
    await this.playActiveSlot(newIndex, feedSongs);
    
    // 4. Manage buffer window
    await this.manageBuffer(newIndex, feedSongs);
  }

  /**
   * Play the active slot
   */
  private async playActiveSlot(index: number, feedSongs: UnifiedSong[]) {
    const song = feedSongs[index];
    if (!song) return;
    
    // Load if needed
    if (!this.slots.has(index)) {
      console.log(`[ReelsBuffer] Loading active slot ${index}: ${song.title}`);
      await this.loadSlot(index, song);
    }
    
    // CRITICAL GUARD: Ensure we are still the active index after the await
    if (this.activeIndex !== index) {
        console.log(`[ReelsBuffer] 🛑 Aborting play for ${index} (Active is now ${this.activeIndex})`);
        return;
    }

    // Play
    const activeSlot = this.slots.get(index);
    if (activeSlot?.sound) {
      try {
        await activeSlot.sound.replayAsync(); // replayAsync ensures it starts from 0 or resumes correctly
        console.log(`[ReelsBuffer] ▶️ Playing ${song.title}`);
      } catch (error) {
        console.error('[ReelsBuffer] Failed to play:', error);
      }
    }
  }

  /**
   * Load a song into a slot (with deduplication)
   */
  private async loadSlot(index: number, song: UnifiedSong): Promise<void> {
    const audioUrl = song.streamUrl || song.downloadUrl;
    if (!audioUrl) return;

    // Check if already loaded
    if (this.slots.has(index)) return;

    // Check if already loading (Deduplication)
    if (this.loadingPromises.has(index)) {
        console.log(`[ReelsBuffer] Already loading slot ${index}, waiting...`);
        return this.loadingPromises.get(index);
    }

    // Create loading promise
    const loadPromise = (async () => {
        try {
            const { sound } = await Audio.Sound.createAsync(
                { uri: audioUrl },
                { shouldPlay: false },
                null
            );

            // Double check if we were unloaded while loading
            if (this.loadingPromises.has(index)) { 
                this.slots.set(index, {
                    sound,
                    song,
                    isLoaded: true,
                });
                console.log(`[ReelsBuffer] ✅ Loaded slot ${index}: ${song.title}`);
            } else {
                // We were cancelled/unloaded mid-load
                await sound.unloadAsync();
            }
        } catch (error) {
            console.error(`[ReelsBuffer] Failed to load ${song.title}:`, error);
            this.slots.set(index, {
                sound: null,
                song,
                isLoaded: false,
            });
        } finally {
            this.loadingPromises.delete(index);
        }
    })();

    this.loadingPromises.set(index, loadPromise);
    return loadPromise;
  }

  /**
   * Unload a slot
   */
  private async unloadSlot(index: number) {
    const slot = this.slots.get(index);
    if (slot?.sound) {
      try {
        await slot.sound.unloadAsync();
        console.log(`[ReelsBuffer] 🗑️ Unloaded slot ${index}`);
      } catch (error) {
        console.error(`[ReelsBuffer] Failed to unload slot ${index}:`, error);
      }
    }
    this.slots.delete(index);
  }

  /**
   * Manage buffer window (load ahead, unload behind)
   */
  private async manageBuffer(currentIndex: number, feedSongs: UnifiedSong[]) {
    // Use top-level constants directly
    // const BUFFER_AHEAD = 4;
    // const BUFFER_BEHIND = 1; 
    
    // Calculate window
    const startIndex = Math.max(0, currentIndex - BUFFER_BEHIND);
    const endIndex = Math.min(feedSongs.length - 1, currentIndex + BUFFER_AHEAD);
    
    console.log(`[ReelsBuffer] Buffer window: ${startIndex} to ${endIndex} (current: ${currentIndex})`);
    
    // Load all songs in window
    for (let i = startIndex; i <= endIndex; i++) {
      if (!this.slots.has(i) && feedSongs[i]) {
        console.log(`[ReelsBuffer] Pre-loading slot ${i}: ${feedSongs[i].title}`);
        await this.loadSlot(i, feedSongs[i]);
        // Small delay to prevent overwhelming the audio system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Unload slots outside window
    const slotsToRemove: number[] = [];
    this.slots.forEach((_, index) => {
      if (index < startIndex || index > endIndex) {
        slotsToRemove.push(index);
      }
    });
    
    for (const index of slotsToRemove) {
      const slot = this.slots.get(index);
      if (slot?.sound) {
        try {
          await slot.sound.unloadAsync();
          console.log(`[ReelsBuffer] Unloaded slot ${index}`);
        } catch (error) {
          console.log(`[ReelsBuffer] Failed to unload slot ${index}:`, error);
        }
      }
    }

    // Visual Log of the Buffer State (User Request)
    this.logBufferState(currentIndex, feedSongs, startIndex, endIndex);
  }

  /**
   * Log the current buffer state with symbols
   */
  private logBufferState(currentIndex: number, feedSongs: UnifiedSong[], start: number, end: number) {
    console.log('\n--- 🎧 REELS BUFFER STATE 🎧 ---');
    for (let i = start; i <= end; i++) {
        const song = feedSongs[i];
        if (!song) continue;

        let symbol = '⏸️'; // Default: Loaded & Waiting
        let status = 'Buffered';

        if (i === currentIndex) {
            symbol = '🔊';
            status = 'PLAYING';
        } else if (!this.slots.get(i)?.isLoaded) {
            symbol = '⏳';
            status = 'Loading...';
        }

        console.log(`${symbol} [Slot ${i}] ${song.title.substring(0, 20)}... (${status})`);
    }
    console.log('--------------------------------\n');
  }

  /**
   * Pause current playback
   */
  async pause() {
    if (this.activeIndex < 0) return;
    
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        await slot.sound.pauseAsync();
      } catch (error) {
        console.error('[ReelsBuffer] Failed to pause:', error);
      }
    }
  }

  /**
   * Stop ALL sounds (used when leaving the screen)
   */
  async stopAll() {
    console.log('[ReelsBuffer] 🛑 Stopping ALL playback');
    for (const [index, slot] of this.slots.entries()) {
        if (slot.sound) {
            try {
                // Check if playing then stop
                const status = await slot.sound.getStatusAsync();
                if (status.isLoaded && (status.isPlaying || status.positionMillis > 0)) {
                   await slot.sound.stopAsync();
                }
            } catch (error) {
                console.log(`[ReelsBuffer] Failed to stop slot ${index}:`, error);
            }
        }
    }
  }

  /**
   * Resume current playback
   */
  async resume() {
    if (this.activeIndex < 0) return;
    
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        await slot.sound.playAsync();
      } catch (error) {
        console.error('[ReelsBuffer] Failed to resume:', error);
      }
    }
  }
  /**
   * Seek to position
   */
  async seekTo(millis: number) {
    if (this.activeIndex < 0) return;
    
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        await slot.sound.setPositionAsync(millis);
      } catch (error) {
        console.error('[ReelsBuffer] Failed to seek:', error);
      }
    }
  }

  /**
   * Register a callback for playback status updates (for the scrubber)
   */
  async setStatusUpdateCallback(callback: (status: any) => void) {
    if (this.activeIndex < 0) return;
    
    const slot = this.slots.get(this.activeIndex);
    if (slot?.sound) {
      try {
        slot.sound.setOnPlaybackStatusUpdate(callback);
      } catch (error) {
        console.error('[ReelsBuffer] Failed to set status callback:', error);
      }
    }
  }
}

// Singleton instance
export const reelsBufferManager = new ReelsBufferManager();
