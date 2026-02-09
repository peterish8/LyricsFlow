/**
 * LyricFlow - Audio Service
 * Handles audio playback using expo-av
 */

import { Audio } from 'expo-av';

class AudioService {
  private sound: Audio.Sound | null = null;
  private isLoaded = false;

  async loadAudio(uri: string): Promise<void> {
    try {
      // Unload previous audio
      if (this.sound) {
        await this.unloadAudio();
      }

      // Set audio mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      // Load new audio
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false }
      );

      this.sound = sound;
      this.isLoaded = true;
    } catch (error) {
      console.error('Failed to load audio:', error);
      throw error;
    }
  }

  async play(): Promise<void> {
    if (this.sound && this.isLoaded) {
      await this.sound.playAsync();
    }
  }

  async pause(): Promise<void> {
    if (this.sound && this.isLoaded) {
      await this.sound.pauseAsync();
    }
  }

  async seek(positionMillis: number): Promise<void> {
    if (this.sound && this.isLoaded) {
      await this.sound.setPositionAsync(positionMillis);
    }
  }

  async getStatus(): Promise<any> {
    if (this.sound && this.isLoaded) {
      return await this.sound.getStatusAsync();
    }
    return null;
  }

  setOnPlaybackStatusUpdate(callback: (status: any) => void): void {
    if (this.sound) {
      this.sound.setOnPlaybackStatusUpdate(callback);
    }
  }

  async unloadAudio(): Promise<void> {
    if (this.sound) {
      await this.sound.unloadAsync();
      this.sound = null;
      this.isLoaded = false;
    }
  }

  isAudioLoaded(): boolean {
    return this.isLoaded;
  }
}

export const audioService = new AudioService();
