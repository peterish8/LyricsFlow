/**
 * LyricFlow - Audio Service
 * Handles audio playback using expo-audio
 */

import { useAudioPlayer } from 'expo-audio';

class AudioService {
  private player: ReturnType<typeof useAudioPlayer> | null = null;
  private isLoaded = false;
  private currentUri: string | null = null;

  async loadAudio(uri: string): Promise<void> {
    try {
      this.currentUri = uri;
      this.isLoaded = true;
      console.log('[AUDIO SERVICE] Audio loaded:', uri);
    } catch (error) {
      console.error('Failed to load audio:', error);
      throw error;
    }
  }

  setPlayer(player: ReturnType<typeof useAudioPlayer>): void {
    this.player = player;
  }

  async play(): Promise<void> {
    if (this.player && this.isLoaded && this.currentUri) {
      console.log('[AUDIO SERVICE] Playing audio');
      try {
        this.player.play();
      } catch (error) {
        console.error('[AUDIO SERVICE] Play error:', error);
      }
    } else {
      console.log('[AUDIO SERVICE] Cannot play - player:', !!this.player, 'isLoaded:', this.isLoaded);
    }
  }

  async pause(): Promise<void> {
    if (this.player && this.isLoaded) {
      this.player.pause();
    }
  }

  async seek(positionSeconds: number): Promise<void> {
    if (this.player && this.isLoaded) {
      this.player.seekTo(positionSeconds);
    }
  }

  /**
   * Enable lock screen / Dynamic Island controls for the current player
   */
  setLockScreenActive(metadata?: { title?: string; artist?: string }): void {
    if (this.player && typeof this.player.setActiveForLockScreen === 'function') {
      try {
        this.player.setActiveForLockScreen(true, metadata);
        console.log('[AUDIO SERVICE] Lock screen controls activated');
      } catch (error) {
        // Silently ignore - not available in Expo Go
      }
    }
  }

  getCurrentUri(): string | null {
    return this.currentUri;
  }

  getPlayer(): ReturnType<typeof useAudioPlayer> | null {
    return this.player;
  }

  async unloadAudio(): Promise<void> {
    // Clear lock screen controls when unloading
    if (this.player) {
      try {
        this.player.clearLockScreenControls();
      } catch (_e) {
        // ignore
      }
    }
    this.currentUri = null;
    this.isLoaded = false;
  }

  isAudioLoaded(): boolean {
    return this.isLoaded && this.currentUri !== null;
  }

  async getDuration(): Promise<number> {
    if (this.player && this.isLoaded && this.player.duration) {
      return this.player.duration;
    }
    return 0;
  }

  async getPosition(): Promise<number> {
    if (this.player && this.isLoaded && this.player.currentTime) {
      return this.player.currentTime;
    }
    return 0;
  }
}

export const audioService = new AudioService();
