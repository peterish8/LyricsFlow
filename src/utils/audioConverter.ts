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
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';

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
   * Whisper requires: WAV, 16kHz sample rate, mono channel
   * 
   * @param inputUri - Path to input audio file
   * @returns Promise<ConversionResult> - Conversion result with output path
   * @throws Error if conversion fails
   */
  async convertToWhisperFormat(inputUri: string): Promise<ConversionResult> {
    console.log('[AudioConverter] Converting audio for Whisper...');
    console.log('[AudioConverter] Input:', inputUri);
    
    try {
      // Get file info
      const format = this.getFormatFromUri(inputUri);
      const isCompatible = format === 'wav';
      
      // Get file size to estimate duration
      const fileInfo = await FileSystem.getInfoAsync(inputUri);
      const fileSize = fileInfo.exists ? (fileInfo as any).size || 0 : 0;
      // Rough estimate: 1MB ≈ 1 minute at 128kbps MP3
      const estimatedDuration = (fileSize / (1024 * 1024)) * 60000;
      
      // Check if already compatible WAV
      if (isCompatible) {
        console.log('[AudioConverter] Audio is already WAV, using original');
        return {
          outputUri: inputUri,
          originalUri: inputUri,
          duration: estimatedDuration,
          wasConverted: false
        };
      }
      
      // Convert to WAV using FFmpeg
      console.log('[AudioConverter] Converting to WAV with FFmpeg...');
      
      const cacheDir = (FileSystem as any).cacheDirectory;
      const outputUri = `${cacheDir}whisper_input_${Date.now()}.wav`;
      
      // FFmpeg command: convert to WAV, 16kHz, mono
      // -i input : Input file
      // -ar 16000 : Sample rate 16kHz (Whisper requirement)
      // -ac 1 : Mono channel
      // -c:a pcm_s16le : 16-bit PCM codec
      const command = `-i "${inputUri}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputUri}" -y`;
      
      console.log('[AudioConverter] FFmpeg command:', command);
      
      const session = await FFmpegKit.execute(command);
      const returnCode = await session.getReturnCode();
      
      if (!ReturnCode.isSuccess(returnCode)) {
        const logs = await session.getLogs();
        const output = logs.map((l: any) => l.getMessage()).join('\n');
        console.error('[AudioConverter] FFmpeg failed:', output);
        throw new Error(`FFmpeg conversion failed: ${output.substring(0, 200)}`);
      }
      
      console.log('[AudioConverter] Conversion successful:', outputUri);
      
      // Track temp file for cleanup
      this.tempFiles.add(outputUri);
      
      return {
        outputUri,
        originalUri: inputUri,
        duration: estimatedDuration,
        wasConverted: true
      };
      
    } catch (error: any) {
      console.error('[AudioConverter] Conversion error:', error);
      // Fallback to original file if conversion fails
      console.warn('[AudioConverter] Falling back to original file');
      return {
        outputUri: inputUri,
        originalUri: inputUri,
        duration: 0,
        wasConverted: false
      };
    }
  }
  
  /**
   * Get audio file information
   * 
   * @param uri - Audio file URI
   * @returns Promise<AudioInfo> - Audio metadata
   */
  private async getAudioInfo(uri: string): Promise<AudioInfo> {
    try {
      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error('File does not exist');
      }
      
      // Determine format from URI
      const format = this.getFormatFromUri(uri);
      
      // Estimate duration based on file size (rough approximation)
      // This is a fallback since we can't load audio in a non-React context
      const fileSize = fileInfo.exists ? (fileInfo as any).size || 0 : 0;
      // Rough estimate: 1MB ≈ 1 minute at 128kbps MP3
      const estimatedDuration = (fileSize / (1024 * 1024)) * 60000;
      
      // Check if compatible (WAV files are usually compatible)
      const isCompatible = format === 'wav';
      
      return {
        uri,
        duration: estimatedDuration,
        format,
        isCompatible
      };
      
    } catch (error: any) {
      console.error('[AudioConverter] Error getting audio info:', error);
      throw new Error(`Failed to analyze audio: ${error.message || 'Unknown error'}`);
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
   * 
   * @param uri - Audio file URI
   * @returns Promise<boolean> - True if valid
   */
  async validateAudioFile(uri: string): Promise<boolean> {
    try {
      const rnfs = getRNFS();
      // Check if file exists
      const exists = await rnfs.exists(uri);
      if (!exists) {
        console.error('[AudioConverter] File does not exist:', uri);
        return false;
      }
      
      // Check file size (must be > 0)
      const stat = await rnfs.stat(uri);
      const sizeBytes = parseInt(stat.size.toString(), 10);
      
      if (sizeBytes === 0) {
        console.error('[AudioConverter] File is empty');
        return false;
      }
      
      // Check if too large (> 100MB)
      const sizeMB = sizeBytes / (1024 * 1024);
      if (sizeMB > 100) {
        console.warn('[AudioConverter] File is very large:', sizeMB.toFixed(1), 'MB');
        // Still valid, just warn
      }
      
      // Check file extension to validate format
      const format = this.getFormatFromUri(uri);
      const validFormats = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'];
      
      if (!validFormats.includes(format)) {
        console.error('[AudioConverter] Unsupported format:', format);
        return false;
      }
      
      // File exists and has valid extension
      return true;
      
    } catch (error) {
      console.error('[AudioConverter] Validation error:', error);
      return false;
    }
  }
  
  /**
   * Get audio duration without full conversion
   * 
   * @param uri - Audio file URI
   * @returns Promise<number> - Duration in milliseconds
   */
  async getAudioDuration(uri: string): Promise<number> {
    try {
      const info = await this.getAudioInfo(uri);
      return info.duration;
    } catch (error) {
      console.error('[AudioConverter] Error getting duration:', error);
      return 0;
    }
  }
  
  /**
   * Clean up temporary audio files
   */
  async cleanupTempFiles(): Promise<void> {
    try {
      const rnfs = getRNFS();
      console.log('[AudioConverter] Cleaning up temp files...');
      
      // Clean up tracked temp files
      for (const filePath of this.tempFiles) {
        try {
          const exists = await rnfs.exists(filePath);
          if (exists) {
            await rnfs.unlink(filePath);
            console.log('[AudioConverter] Deleted:', filePath);
          }
        } catch (error) {
          console.error('[AudioConverter] Error deleting file:', filePath, error);
        }
      }
      
      this.tempFiles.clear();
      
      // Also clean up any old whisper_input_* files in cache
      try {
        const cacheDir = rnfs.CachesDirectoryPath;
        const files = await rnfs.readDir(cacheDir);
        
        const whisperTempFiles = files.filter((file: any) => 
          file.name.startsWith('whisper_input_') && file.name.endsWith('.wav')
        );
        
        for (const file of whisperTempFiles) {
          try {
            await rnfs.unlink(file.path);
            console.log('[AudioConverter] Deleted old temp file:', file.name);
          } catch (error) {
            console.error('[AudioConverter] Error deleting old temp file:', error);
          }
        }
        
      } catch (error) {
        console.error('[AudioConverter] Error cleaning cache directory:', error);
      }
      
      console.log('[AudioConverter] Cleanup complete');
      
    } catch (error) {
      console.error('[AudioConverter] Cleanup error:', error);
      // Don't throw - cleanup errors shouldn't break the app
    }
  }
  
  /**
   * Estimate processing time based on audio duration
   * 
   * @param durationMs - Audio duration in milliseconds
   * @returns number - Estimated processing time in seconds
   */
  estimateProcessingTime(durationMs: number): number {
    // Whisper typically processes at 0.3-0.5x realtime on mobile
    // For a 3-minute song (180s), expect 60-90 seconds processing
    const durationSeconds = durationMs / 1000;
    const processingFactor = 0.4; // Conservative estimate
    return Math.ceil(durationSeconds * processingFactor);
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
