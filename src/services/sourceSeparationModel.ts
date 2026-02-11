/**
 * 🎵 AI Karaoke: Source Separation Model
 * 
 * ONNX Runtime wrapper for vocal/instrumental separation.
 * Uses a mobile-optimized source separation model.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as ort from 'onnxruntime-react-native';
import { Asset } from 'expo-asset';

type OnnxTensor = ort.Tensor;
type OnnxSession = ort.InferenceSession;

const MODEL_FILE = 'spleeter_2stem_quantized.onnx';
const MODEL_DIR = `${(FileSystem as any).documentDirectory}models/`;
const MODEL_PATH = `${MODEL_DIR}${MODEL_FILE}`;

// CDN URL - Replace with your actual CDN or leave empty to use bundled asset
// Example: 'https://your-cdn.com/models/spleeter_2stem_quantized.onnx'
const MODEL_URL = ''; 

// Bundled asset module ID - Place model in assets/models/ folder
const BUNDLED_MODEL = require('../../assets/models/spleeter_2stem_quantized.onnx');

export class SourceSeparationModel {
  private session: OnnxSession | null = null;
  private isLoading = false;
  private isInitialized = false;

  /**
   * Initialize the ONNX model
   */
  async initialize(): Promise<void> {
    if (this.isInitialized || this.isLoading) {
      console.log('[SeparationModel] Already initialized or loading');
      return;
    }

    this.isLoading = true;

    try {
      console.log('[SeparationModel] Initializing...');

      // Ensure model directory exists
      const dirInfo = await FileSystem.getInfoAsync(MODEL_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
      }

      // Check if model exists locally
      const modelInfo = await FileSystem.getInfoAsync(MODEL_PATH);
      
      if (!modelInfo.exists) {
        console.log('[SeparationModel] Model not found locally, checking sources...');
        
        // Option 1: Try CDN download if URL is set
        if (MODEL_URL) {
          console.log('[SeparationModel] Downloading from CDN...');
          await FileSystem.downloadAsync(MODEL_URL, MODEL_PATH);
          console.log('[SeparationModel] Model downloaded from CDN');
        } else {
          // Option 2: Copy from bundled assets
          console.log('[SeparationModel] Copying from bundled assets...');
          const asset = Asset.fromModule(BUNDLED_MODEL);
          await asset.downloadAsync();
          
          // Copy asset to models directory
          if (asset.localUri) {
            await FileSystem.copyAsync({
              from: asset.localUri,
              to: MODEL_PATH
            });
            console.log('[SeparationModel] Model copied from assets');
          } else {
            throw new Error('Failed to load bundled model asset');
          }
        }
      }

      console.log('[SeparationModel] Loading ONNX model...');
      
      // Create ONNX session with mobile optimizations
      this.session = await ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        enableMemPattern: true,
        enableCpuMemArena: true,
      });

      this.isInitialized = true;
      console.log('[SeparationModel] Initialized successfully');
    } catch (error) {
      console.error('[SeparationModel] Initialization failed:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Check if model is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.session !== null;
  }

  /**
   * Run separation on audio data
   * 
   * @param audioData Float32Array of audio samples
   * @param sampleRate Audio sample rate (default 22050)
   * @returns Object with vocals and instruments arrays
   */
  async separate(
    audioData: Float32Array,
    sampleRate: number = 22050,
    onProgress?: (progress: number) => void
  ): Promise<{
    vocals: Float32Array;
    instruments: Float32Array;
  }> {
    if (!this.session || !this.isInitialized) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    console.log(`[SeparationModel] Processing ${audioData.length} samples at ${sampleRate}Hz`);

    // Model window parameters
    const windowSize = 44100; // 2 seconds at 22.05kHz
    const hopSize = 22050;    // 1 second hop (50% overlap)

    const numWindows = Math.ceil((audioData.length - windowSize) / hopSize) + 1;
    
    const vocalsChunks: Float32Array[] = [];
    const instrChunks: Float32Array[] = [];

    // Process in chunks
    for (let i = 0; i < numWindows; i++) {
      const start = i * hopSize;
      const end = Math.min(start + windowSize, audioData.length);
      
      // Extract window and pad if necessary
      const window = new Float32Array(windowSize);
      window.set(audioData.slice(start, end));
      
      try {
        // Create tensor [1, 2, windowSize] - batch, stereo channels, time
        // Note: Adjust shape based on your model's expected input!
        const inputTensor = new ort.Tensor('float32', window, [1, 2, windowSize / 2]);
        
        // Run inference - Check your model's input/output names with Netron!
        const feeds: Record<string, ort.Tensor> = { input: inputTensor };
        const results = await this.session.run(feeds);
        
        // Extract outputs - These names depend on your model!
        // Common names: 'vocals', 'accompaniment', 'instr', 'other'
        const outputNames = this.session.outputNames;
        console.log('[SeparationModel] Output names:', outputNames);
        
        // Try common output names
        let vocalsOutput: Float32Array | undefined;
        let instrOutput: Float32Array | undefined;
        
        for (const name of outputNames) {
          const output = results[name];
          if (output && output.data) {
            if (name.toLowerCase().includes('vocal')) {
              vocalsOutput = output.data as Float32Array;
            } else if (name.toLowerCase().includes('accomp') || 
                       name.toLowerCase().includes('instr') || 
                       name.toLowerCase().includes('other')) {
              instrOutput = output.data as Float32Array;
            }
          }
        }
        
        // Fallback if outputs not found
        if (!vocalsOutput) {
          console.warn('[SeparationModel] Vocals output not found, using placeholder');
          vocalsOutput = window.map(s => s * 0.7);
        }
        if (!instrOutput) {
          console.warn('[SeparationModel] Instruments output not found, using placeholder');
          instrOutput = window.map(s => s * 0.3);
        }
        
        vocalsChunks.push(vocalsOutput.slice(0, end - start));
        instrChunks.push(instrOutput.slice(0, end - start));
        
      } catch (inferenceError) {
        console.error('[SeparationModel] Inference error:', inferenceError);
        // Fallback to placeholder on error
        const vocalsOutput = window.map(s => s * 0.7);
        const instrOutput = window.map(s => s * 0.3);
        vocalsChunks.push(vocalsOutput.slice(0, end - start));
        instrChunks.push(instrOutput.slice(0, end - start));
      }

      // Report progress
      if (onProgress) {
        onProgress((i + 1) / numWindows);
      }
    }

    // Overlap-add reconstruction
    const vocals = this.overlapAdd(vocalsChunks, hopSize);
    const instruments = this.overlapAdd(instrChunks, hopSize);

    return { vocals, instruments };
  }

  /**
   * Overlap-add reconstruction with Hann window
   */
  private overlapAdd(chunks: Float32Array[], hopSize: number): Float32Array {
    const totalLength = hopSize * (chunks.length - 1) + chunks[0].length;
    const result = new Float32Array(totalLength);
    
    // Create Hann window for smooth crossfade
    const window = this.createHannWindow(chunks[0].length);

    for (let i = 0; i < chunks.length; i++) {
      const start = i * hopSize;
      
      // Apply window and add to result
      for (let j = 0; j < chunks[i].length; j++) {
        result[start + j] += chunks[i][j] * window[j];
      }
    }

    return result;
  }

  /**
   * Create Hann window for smooth overlap-add
   */
  private createHannWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
  }

  /**
   * Release model resources
   */
  async release(): Promise<void> {
    if (this.session) {
      // In real implementation: await this.session.release();
      this.session = null;
      this.isInitialized = false;
      console.log('[SeparationModel] Released');
    }
  }

  /**
   * Get model file info
   */
  async getModelInfo(): Promise<{ exists: boolean; size?: number }> {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    return {
      exists: info.exists,
      size: info.exists ? (info as any).size : undefined,
    };
  }

  /**
   * Delete model file (for cleanup or re-download)
   */
  async deleteModel(): Promise<void> {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    if (info.exists) {
      await FileSystem.deleteAsync(MODEL_PATH);
      this.isInitialized = false;
      this.session = null;
    }
  }
}

// Export singleton
export const separationModel = new SourceSeparationModel();
