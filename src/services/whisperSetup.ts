/**
 * LuvLyrics - Whisper Model Setup Service
 * 
 * Production-grade service for downloading and managing Whisper AI models.
 * Handles one-time model download, storage, and validation.
 * 
 * @module WhisperSetup
 * @version 1.0.0
 */

// Lazy load RNFS to prevent native module errors in Expo Go
let RNFS: any = null;

const getRNFS = () => {
  if (!RNFS) {
    try {
      RNFS = require('react-native-fs');
      if (!RNFS || !RNFS.DocumentDirectoryPath) {
        throw new Error('RNFS module not available');
      }
    } catch (error) {
      console.error('[WhisperSetup] Failed to load react-native-fs:', error);
      throw new Error(
        'This feature requires a development build. ' +
        'Expo Go does not support native modules like react-native-fs. ' +
        'Please run: npx expo prebuild && npx expo run:android'
      );
    }
  }
  return RNFS;
};

// ============================================================================
// TYPES
// ============================================================================

export interface WhisperModelConfig {
  name: string;
  url: string;
  size: number; // MB
  accuracy: string;
  speed: string;
}

export interface DownloadProgress {
  bytesWritten: number;
  contentLength: number;
  progress: number; // 0-1
}

// ============================================================================
// WHISPER MODEL CONFIGURATIONS
// ============================================================================

export const WHISPER_MODELS: Record<string, WhisperModelConfig> = {
  tiny: {
    name: 'ggml-tiny.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    size: 75,
    accuracy: '80-85%',
    speed: 'Very Fast'
  },
  base: {
    name: 'ggml-base.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    size: 142,
    accuracy: '85-90%',
    speed: 'Fast'
  },
  small: {
    name: 'ggml-small.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    size: 466,
    accuracy: '90-92%',
    speed: 'Medium'
  }
};

// Recommended model for best balance (Tiny is much faster on CPU)
export const RECOMMENDED_MODEL = WHISPER_MODELS.tiny;

// ============================================================================
// WHISPER SETUP SERVICE
// ============================================================================

export class WhisperSetup {
  private _modelPath: string | null = null;
  private downloadInProgress: boolean = false;
  
  private get modelPath(): string {
    if (!this._modelPath) {
      const rnfs = getRNFS();
      this._modelPath = `${rnfs.DocumentDirectoryPath}/whisper-models`;
    }
    return this._modelPath;
  }
  
  /**
   * Check if Whisper model is already downloaded
   * 
   * @param modelName - Model filename (default: base.en)
   * @returns Promise<boolean> - True if model exists
   */
  async isModelDownloaded(modelName: string = RECOMMENDED_MODEL.name): Promise<boolean> {
    try {
      const rnfs = getRNFS();
      const modelFile = `${this.modelPath}/${modelName}`;
      const exists = await rnfs.exists(modelFile);
      
      if (exists) {
        // Verify file is not corrupted (check size)
        const stat = await rnfs.stat(modelFile);
        const modelConfig = Object.values(WHISPER_MODELS).find(m => m.name === modelName);
        
        if (modelConfig) {
          const expectedSize = modelConfig.size * 1024 * 1024; // Convert MB to bytes
          const actualSize = parseInt(stat.size.toString(), 10);
          
          // Allow 5% variance in file size
          const sizeMatch = Math.abs(actualSize - expectedSize) < (expectedSize * 0.05);
          
          if (!sizeMatch) {
            console.warn('[WhisperSetup] Model file size mismatch, may be corrupted');
            return false;
          }
        }
      }
      
      return exists;
    } catch (error) {
      console.error('[WhisperSetup] Error checking model:', error);
      return false;
    }
  }
  
  /**
   * Download Whisper model (one-time setup)
   * Shows progress to user via callback
   * 
   * @param modelName - Model to download (default: base.en)
   * @param onProgress - Progress callback (0-1)
   * @returns Promise<string> - Path to downloaded model
   * @throws Error if download fails
   */
  async downloadModel(
    modelName: string = RECOMMENDED_MODEL.name,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    
    if (this.downloadInProgress) {
      throw new Error('Download already in progress');
    }
    
    console.log('[WhisperSetup] Starting model download:', modelName);
    
    try {
      const rnfs = getRNFS();
      this.downloadInProgress = true;
      
      // Create directory if it doesn't exist
      const dirExists = await rnfs.exists(this.modelPath);
      if (!dirExists) {
        await rnfs.mkdir(this.modelPath);
        console.log('[WhisperSetup] Created model directory');
      }
      
      const modelFile = `${this.modelPath}/${modelName}`;
      
      // Check if already downloaded
      const exists = await this.isModelDownloaded(modelName);
      if (exists) {
        console.log('[WhisperSetup] Model already exists and is valid');
        this.downloadInProgress = false;
        return modelFile;
      }
      
      // Find model config
      const modelConfig = Object.values(WHISPER_MODELS).find(m => m.name === modelName);
      if (!modelConfig) {
        throw new Error(`Unknown model: ${modelName}`);
      }
      
      console.log('[WhisperSetup] Downloading from:', modelConfig.url);
      console.log('[WhisperSetup] Expected size:', modelConfig.size, 'MB');
      
      // Download with progress tracking
      const download = rnfs.downloadFile({
        fromUrl: modelConfig.url,
        toFile: modelFile,
        progress: (res: any) => {
          const progress = res.bytesWritten / res.contentLength;
          const percentComplete = (progress * 100).toFixed(1);
          const mbDownloaded = (res.bytesWritten / (1024 * 1024)).toFixed(1);
          const mbTotal = (res.contentLength / (1024 * 1024)).toFixed(1);
          
          console.log(
            `[WhisperSetup] Download progress: ${percentComplete}% ` +
            `(${mbDownloaded}/${mbTotal} MB)`
          );
          
          if (onProgress) {
            onProgress(progress);
          }
        },
        progressInterval: 500, // Update every 500ms
        background: true, // Continue download in background
        discretionary: false, // Don't wait for optimal network conditions
      });
      
      const result = await download.promise;
      
      if (result.statusCode === 200) {
        console.log('[WhisperSetup] Model downloaded successfully');
        
        // Verify download
        const isValid = await this.isModelDownloaded(modelName);
        if (!isValid) {
          throw new Error('Downloaded model failed validation');
        }
        
        this.downloadInProgress = false;
        return modelFile;
        
      } else {
        throw new Error(`Download failed with status ${result.statusCode}`);
      }
      
    } catch (error: any) {
      console.error('[WhisperSetup] Download error:', error);
      
      // Clean up partial download
      const rnfs = getRNFS();
      const modelFile = `${this.modelPath}/${modelName}`;
      const exists = await rnfs.exists(modelFile);
      if (exists) {
        try {
          await rnfs.unlink(modelFile);
          console.log('[WhisperSetup] Cleaned up partial download');
        } catch (cleanupError) {
          console.error('[WhisperSetup] Cleanup error:', cleanupError);
        }
      }
      
      this.downloadInProgress = false;
      
      throw new Error(
        `Failed to download Whisper model: ${error.message || 'Unknown error'}`
      );
    }
  }
  
  /**
   * Get path to downloaded model
   * 
   * @param modelName - Model filename
   * @returns Promise<string> - Full path to model file
   * @throws Error if model not found
   */
  async getModelPath(modelName: string = RECOMMENDED_MODEL.name): Promise<string> {
    const modelFile = `${this.modelPath}/${modelName}`;
    const exists = await this.isModelDownloaded(modelName);
    
    if (!exists) {
      throw new Error(
        'Whisper model not found. Please download it first using downloadModel().'
      );
    }
    
    return modelFile;
  }
  
  /**
   * Delete model to free up space
   * 
   * @param modelName - Model to delete
   */
  async deleteModel(modelName: string = RECOMMENDED_MODEL.name): Promise<void> {
    try {
      const rnfs = getRNFS();
      const modelFile = `${this.modelPath}/${modelName}`;
      const exists = await rnfs.exists(modelFile);
      
      if (exists) {
        await rnfs.unlink(modelFile);
        console.log('[WhisperSetup] Model deleted:', modelName);
      } else {
        console.log('[WhisperSetup] Model not found, nothing to delete');
      }
    } catch (error) {
      console.error('[WhisperSetup] Delete error:', error);
      throw new Error(`Failed to delete model: ${(error as any).message}`);
    }
  }
  
  /**
   * Get storage info for all models
   * 
   * @returns Promise<object> - Storage information
   */
  async getStorageInfo(): Promise<{
    totalSize: number;
    models: Array<{ name: string; size: number }>;
  }> {
    try {
      const rnfs = getRNFS();
      const dirExists = await rnfs.exists(this.modelPath);
      if (!dirExists) {
        return { totalSize: 0, models: [] };
      }
      
      const files = await rnfs.readDir(this.modelPath);
      const models = [];
      let totalSize = 0;
      
      for (const file of files) {
        if (file.name.endsWith('.bin')) {
          const sizeMB = parseInt(file.size.toString(), 10) / (1024 * 1024);
          models.push({
            name: file.name,
            size: parseFloat(sizeMB.toFixed(2))
          });
          totalSize += sizeMB;
        }
      }
      
      return {
        totalSize: parseFloat(totalSize.toFixed(2)),
        models
      };
    } catch (error) {
      console.error('[WhisperSetup] Storage info error:', error);
      return { totalSize: 0, models: [] };
    }
  }
  
  /**
   * Check if download is currently in progress
   */
  isDownloading(): boolean {
    return this.downloadInProgress;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let whisperSetupInstance: WhisperSetup | null = null;

/**
 * Get singleton instance of WhisperSetup
 */
export function getWhisperSetup(): WhisperSetup {
  if (!whisperSetupInstance) {
    whisperSetupInstance = new WhisperSetup();
  }
  return whisperSetupInstance;
}
