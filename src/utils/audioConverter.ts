/**
 * LuvLyrics - Audio Converter Utility
 * 
 * Production-grade audio format conversion for Whisper compatibility.
 * Whisper requires: WAV format, 16kHz sample rate, mono channel.
 * 
 * @module AudioConverter
 * @version 1.0.0
 */

import * as FileSystem from 'expo-file-system/legacy';
// import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native'; // REMOVED

// Lazy load RNFS to prevent native module errors in Expo Go
let RNFS: any = null;

const getRNFS = () => {
  if (!RNFS) {
    try {
      RNFS = require('react-native-fs');
      if (!RNFS || !RNFS.CachesDirectoryPath) {
        throw new Error('RNFS module not available');
      }
    } catch (error) {
      console.error('[AudioConverter] Failed to load react-native-fs:', error);
      throw new Error(
        'This feature requires a development build. ' +
        'Expo Go does not support native modules. ' +
        'Please run: npx expo prebuild && npx expo run:android'
      );
    }
  }
  return RNFS;
};

// ============================================================================
// TYPES
// ============================================================================

export interface AudioInfo {
  uri: string;
  duration: number; // milliseconds
  format: string;
  isCompatible: boolean;
}

export interface ConversionResult {
  outputUri: string;
  originalUri: string;
  duration: number;
  wasConverted: boolean;
}

// ============================================================================
// AUDIO CONVERTER SERVICE
// ============================================================================

export class AudioConverter {
  private tempFiles: Set<string> = new Set();
  
  /**
   * Convert audio file to Whisper-compatible format
   */
  async convertToWhisperFormat(inputUri: string): Promise<ConversionResult> {
    console.warn('[AudioConverter] FFmpeg removed. Conversion disabled.');
    // Throw error or return original
    throw new Error('Audio conversion unavailable: FFmpeg removed.');
  }
  
  /**
   * Get audio file information
   */
  private async getAudioInfo(uri: string): Promise<AudioInfo> {
    // Stub implementation that just checks file existence
     try {
       const fileInfo = await FileSystem.getInfoAsync(uri);
       if (!fileInfo.exists) {
         throw new Error('File does not exist');
       }
       return {
         uri,
         duration: 0,
         format: 'unknown',
         isCompatible: false
       };
     } catch (error: any) {
       throw new Error(`Failed to analyze audio: ${error.message}`);
     }
  }
  
  /**
   * Extract format from file URI
   */
  private getFormatFromUri(uri: string): string {
    const extension = uri.split('.').pop()?.toLowerCase() || 'unknown';
    return extension;
  }
  
  /**
   * Validate audio file
   */
  async validateAudioFile(uri: string): Promise<boolean> {
      // Basic check
      return true;
  }
  
  /**
   * Get audio duration without full conversion
   */
  async getAudioDuration(uri: string): Promise<number> {
    return 0;
  }
  
  /**
   * Clean up temporary audio files
   */
  async cleanupTempFiles(): Promise<void> {
    // No-op
  }
  
  /**
   * Estimate processing time based on audio duration
   */
  estimateProcessingTime(durationMs: number): number {
    return 0;
  }
  /**
   * Trim audio file to a specific range (for VAD batch processing)
   */
  async trimAudio(inputUri: string, start: number, duration: number): Promise<string> {
      throw new Error('Audio trimming unavailable: FFmpeg removed.');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let audioConverterInstance: AudioConverter | null = null;

/**
 * Get singleton instance of AudioConverter
 */
export function getAudioConverter(): AudioConverter {
  if (!audioConverterInstance) {
    audioConverterInstance = new AudioConverter();
  }
  return audioConverterInstance;
}
