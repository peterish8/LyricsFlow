/**
 * LuvLyrics - Whisper Transcription Service
 * 
 * Production-grade service for on-device speech-to-text transcription using Whisper.cpp.
 * Provides word-level timestamps for precise lyric synchronization.
 * 
 * @module WhisperService
 * @version 1.1.0
 */

import { getWhisperSetup, RECOMMENDED_MODEL } from './whisperSetup';
import { getAudioConverter } from '../utils/audioConverter';

// Lazy load whisper to prevent native module errors on startup
let initWhisperFn: any = null;

const getInitWhisper = () => {
  if (!initWhisperFn) {
    try {
      // whisper.rn exports: initWhisper, WhisperContext, releaseAllWhisper, etc.
      const whisperModule = require('whisper.rn');
      initWhisperFn = whisperModule.initWhisper;
      if (!initWhisperFn) {
        throw new Error('initWhisper not found in whisper.rn');
      }
    } catch (error) {
      console.error('[WhisperService] Failed to load whisper.rn:', error);
      throw new Error(
        'Whisper is not available. This feature requires native module setup. ' +
        'Please rebuild the app after installing dependencies.'
      );
    }
  }
  return initWhisperFn;
};

// ============================================================================
// TYPES
// ============================================================================

export interface WhisperWord {
  word: string;        // The transcribed word
  start: number;       // Start time in seconds
  end: number;         // End time in seconds
  probability: number; // Whisper confidence (0-1)
}

export interface WhisperSegment {
  text: string;         // Full segment text
  start: number;        // Segment start time (seconds)
  end: number;          // Segment end time (seconds)
  words: WhisperWord[]; // Word-level breakdown
}

export interface WhisperResult {
  segments: WhisperSegment[];
  fullText: string;
  language: string;
  processingTime: number; // How long transcription took (seconds)
}

export interface WhisperOptions {
  language?: string;
  maxLen?: number;
  tokenTimestamps?: boolean;
  modelPath?: string;
}

// ============================================================================
// WHISPER TRANSCRIPTION SERVICE
// ============================================================================

export class WhisperService {
  private setup = getWhisperSetup();
  private converter = getAudioConverter();
  private modelPath: string | null = null;
  private whisperContext: any = null; // WhisperContext instance
  private isInitialized: boolean = false;
  private isTranscribing: boolean = false;
  private activeTask: { stop: () => void } | null = null;
  
  /**
   * Initialize Whisper (download model if needed, create context)
   * Must be called before transcribe()
   * 
   * @param onProgress - Progress callback for model download (0-1)
   * @throws Error if initialization fails
   */
  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    // Skip if already initialized with a valid context
    if (this.isInitialized && this.whisperContext) {
      console.log('[WhisperService] Already initialized');
      return;
    }
    
    console.log('[WhisperService] Initializing...');
    
    try {
      // Check if model exists
      const modelExists = await this.setup.isModelDownloaded();
      
      if (!modelExists) {
        console.log('[WhisperService] Model not found, downloading...');
        this.modelPath = await this.setup.downloadModel(undefined, onProgress);
      } else {
        console.log('[WhisperService] Model already downloaded');
        this.modelPath = await this.setup.getModelPath();
      }
      
      console.log('[WhisperService] Model ready at:', this.modelPath);
      
      // Create WhisperContext by calling initWhisper with the model path
      const initWhisper = getInitWhisper();
      
      console.log('[WhisperService] Creating WhisperContext...');
      this.whisperContext = await initWhisper({
        filePath: this.modelPath,
        isBundleAsset: false,
      });
      
      console.log('[WhisperService] WhisperContext created successfully');
      console.log('[WhisperService] GPU enabled:', this.whisperContext.gpu);
      if (!this.whisperContext.gpu && this.whisperContext.reasonNoGPU) {
        console.log('[WhisperService] No GPU reason:', this.whisperContext.reasonNoGPU);
      }
      
      this.isInitialized = true;
      
    } catch (error: any) {
      console.error('[WhisperService] Initialization error:', error);
      this.whisperContext = null;
      throw new Error(`Whisper initialization failed: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Transcribe audio file with Whisper
   * Returns word-level timestamps for precise synchronization
   * 
   * @param audioUri - Path to audio file
   * @param options - Transcription options
   * @returns Promise<WhisperResult> - Transcription with word timestamps
   * @throws Error if transcription fails
   */
  async transcribe(
    audioUri: string,
    options?: WhisperOptions
  ): Promise<WhisperResult> {
    
    console.log('[WhisperService] Starting transcription...');
    console.log('[WhisperService] Audio URI:', audioUri);
    
    if (!this.isInitialized || !this.whisperContext) {
      throw new Error('Whisper not initialized. Call initialize() first.');
    }

    if (this.isTranscribing) {
      console.warn('[WhisperService] Transcription already in progress, blocking concurrent call');
      throw new Error('Transcription is already in progress. Please wait for the current task to finish.');
    }
    
    this.isTranscribing = true;
    const startTime = Date.now();
    
    try {
      // Validate audio file
      console.log('[WhisperService] Validating audio file...');
      const isValid = await this.converter.validateAudioFile(audioUri);
      
      if (!isValid) {
        throw new Error('Invalid audio file. Please check the file format and try again.');
      }
      
      // Convert audio to compatible format
      console.log('[WhisperService] Converting audio...');
      const conversionResult = await this.converter.convertToWhisperFormat(audioUri);
      
      console.log('[WhisperService] Audio ready:', {
        wasConverted: conversionResult.wasConverted,
        duration: `${(conversionResult.duration / 1000).toFixed(1)}s`
      });
      
      // Estimating processing time
      const estimatedTime = this.converter.estimateProcessingTime(conversionResult.duration);
      console.log(`[WhisperService] Estimated processing time: ${estimatedTime}s`);
      
      // Transcribe with Whisper
      console.log('[WhisperService] Running Whisper inference...');
      
      const whisperOptions = {
        language: options?.language || 'en',
        // maxLen: 0 means no limit on segment length, Whisper will decide natural breaks
        // We'll set it to 60 for better phrase grouping
        maxLen: options?.maxLen || 60,
        tokenTimestamps: options?.tokenTimestamps !== false,
        // Add a prompt to encourage capitalization and punctuation, and help with noise
        prompt: "Lyrics of a song. Proper capitalization and punctuation. No background noise descriptions like [music] or (noise).",
      };
      
      console.log('[WhisperService] Whisper options:', whisperOptions);
      
      // whisper.rn context.transcribe() returns { stop, promise }
      let promise;
      try {
        const resultObj = await this.whisperContext.transcribe(
          conversionResult.outputUri,
          whisperOptions
        );
        this.activeTask = { stop: resultObj.stop };
        promise = resultObj.promise;
      } catch (err: any) {
        // Catch immediate start errors (like context not found)
        if (err.message?.includes('Context') || err.message?.includes('pointer')) {
          console.warn('[WhisperService] Context invalid on start, retrying...');
          await this.release();
          await this.initialize();
           const resultObj = await this.whisperContext.transcribe(
            conversionResult.outputUri,
            whisperOptions
          );
          this.activeTask = { stop: resultObj.stop };
          promise = resultObj.promise;
        } else {
          throw err;
        }
      }
      
      // Await the transcription result
      let result;
      try {
        result = await promise;
      } catch (err: any) {
         // Catch execution errors (like context lost during run)
         if (err.message?.includes('Context') || err.message?.includes('pointer')) {
           console.warn('[WhisperService] Context lost during transcription, retrying...');
           await this.release();
           await this.initialize();
           const resultObj = await this.whisperContext.transcribe(
            conversionResult.outputUri,
            whisperOptions
          );
          this.activeTask = { stop: resultObj.stop };
          result = await resultObj.promise;
         } else {
           throw err;
         }
      }
      
      this.activeTask = null;
      
      console.log('[WhisperService] Transcription complete');
      console.log('[WhisperService] Raw result segments:', result.segments?.length || 0);
      
      // Parse Whisper output
      const parsed = this.parseWhisperResult(result);
      
      const processingTime = (Date.now() - startTime) / 1000;
      console.log(`[WhisperService] Total processing time: ${processingTime.toFixed(1)}s`);
      
      // Cleanup temporary files
      await this.converter.cleanupTempFiles();
      
      return {
        ...parsed,
        processingTime
      };
      
    } catch (error: any) {
      console.error('[WhisperService] Transcription error:', error);
      
      // Cleanup on error
      try {
        await this.converter.cleanupTempFiles();
      } catch (cleanupError) {
        console.error('[WhisperService] Cleanup error:', cleanupError);
      }
      
      // Force release if context error to clean state for next time
      if (error.message?.includes('Context')) {
        await this.release();
      }
      
      throw new Error(
        `Whisper transcription failed: ${error.message || 'Unknown error'}`
      );
    } finally {
      this.isTranscribing = false;
    }
  }
  
  /**
   * Parse Whisper.cpp output into our format
   * Handles different output structures from whisper.rn
   * 
   * @param result - Raw Whisper result (TranscribeResult from whisper.rn)
   * @returns Parsed result with segments and words
   */
  /**
   * Parse Whisper.cpp output into our format
   * Handles different output structures from whisper.rn
   * 
   * @param result - Raw Whisper result (TranscribeResult from whisper.rn)
   * @returns Parsed result with segments and words
   */
  private parseWhisperResult(result: any): Omit<WhisperResult, 'processingTime'> {
    const segments: WhisperSegment[] = [];
    let fullText = '';
    
    console.log('[WhisperService] Parsing Whisper result...');
    
    // Improved Noise Regex: Matches common non-lyrical descriptions
    // Matches: [Music], (Applause), [Instrumental Break], etc.
    // Also matches specific keywords if they appear alone
    // NOTE: Removed 'instrumental', 'intro', 'outro', 'solo', 'break' to preserve structural markers
    const NOISE_PATTERNS = /^(noise|machine|whirring|humming|brrr|clicking|silence|music|applause|cheering|translated by|subtitle|caption)$/i;
    
    // Helper to clean text: Remove brackets/parens BUT preserve structural ones
    const cleanLyricText = (text: string): string => {
      if (!text) return '';
      
      // 1. Temporarily protect valid structural tags
      let processed = text.replace(/\[(instrumental|verse|chorus|bridge|intro|outro|solo|hook|break).*?\]/gi, (match) => {
          return `__KEEP_${match.replace(/[\[\]\s]/g, '')}__`; 
      });

      // 2. Remove ALL other brackets/parens and non-word chars
      processed = processed.replace(/\[.*?\]|\(.*?\)|([^\w\s'_])+/g, ' ').replace(/\s+/g, ' ').trim();

      // 3. Restore the protected tags
      processed = processed.replace(/__KEEP_(.*?)__/g, (match, p1) => {
          return `[${p1}]`;
      });
      
      // 4. Deduplicate consecutive structural tags (e.g. [Instrumental] [Instrumental] -> [Instrumental])
      processed = processed.replace(/(\[.*?\])(\s+\1)+/g, '$1');

      return processed;
    };

    if (result.segments && Array.isArray(result.segments)) {
      result.segments.forEach((segment: any, segmentIndex: number) => {
        const words: WhisperWord[] = [];
        
        // --- 1. Process Words (Validating & Cleaning) ---
        if (segment.words && Array.isArray(segment.words)) {
          segment.words.forEach((wordData: any) => {
            const rawWord = (wordData.word || wordData.text || '').trim();
            const cleanWord = cleanLyricText(rawWord);
            
            // Check if it's a bracketed word (that wasn't protected/restored)
            // If it starts with [ after cleaning, it's a protected tag, so we keep it.
            const isProtectedTag = cleanWord.startsWith('[');
            const isNoise = NOISE_PATTERNS.test(cleanWord);
            
            if (cleanWord.length > 0 && !isNoise) {
               // If it's a protected tag, we keep it as a "word"
               // If it's normal text, we keep it.
               words.push({
                word: isProtectedTag ? cleanWord : rawWord, 
                start: (wordData.t0 != null ? wordData.t0 / 100 : wordData.start || 0),
                end: (wordData.t1 != null ? wordData.t1 / 100 : wordData.end || 0),
                probability: wordData.p ?? wordData.probability ?? 0.8
              });
            }
          });
        } else {
          // --- Fallback: Estimate Word Timestamps ---
          const text = segment.text || '';
          // Custom split to handle punctuation better
          const wordTexts = text.split(/\s+/).filter((w: string) => cleanLyricText(w).length > 0);
          
          if (wordTexts.length > 0) {
            const segmentStart = (segment.t0 != null ? segment.t0 / 100 : segment.start || 0);
            const segmentEnd = (segment.t1 != null ? segment.t1 / 100 : segment.end || 0);
            const duration = segmentEnd - segmentStart;
            const timePerWord = duration / wordTexts.length;
            
            console.log(`[WhisperService] Segment ${segmentIndex}: Estimating timestamps for ${wordTexts.length} words`);
            
            wordTexts.forEach((wordText: string, index: number) => {
              const start = segmentStart + (index * timePerWord);
              const end = start + timePerWord;
              
              const isBracketed = wordText.startsWith('[') || wordText.startsWith('(');
              if (!isBracketed) {
                words.push({
                  word: wordText.trim(),
                  start,
                  end,
                  probability: 0.8
                });
              }
            });
          }
        }
        
        // --- 2. Process Segment Text ---
        const rawSegmentText = (segment.text || '').trim();
        let cleanSegmentText = cleanLyricText(rawSegmentText);
        
        // Additional Check: Is the clean text just a noise keyword or credit?
        if (cleanSegmentText.toLowerCase().includes('translated by') || cleanSegmentText.toLowerCase().includes('captioned by')) {
             cleanSegmentText = '';
        }

        // NOTE: NOISE_PATTERNS no longer includes 'instrumental' etc, so this won't kill valid tags
        if (NOISE_PATTERNS.test(cleanSegmentText)) {
          console.log(`[WhisperService] Detected noise/credit segment: "${cleanSegmentText}"`);
          cleanSegmentText = ''; // Mark as invalid
        }
        
        // --- 3. Construct Final Segment ---
        // We trust the `words` array more than the `cleanSegmentText` because we filtered words individually.
        // If we have valid words, we reconstruct the text from them.
        if (words.length > 0) {
           const reconstructedText = words.map(w => w.word).join(' ').trim();
           // Only use reconstructed if it's not substantially different (to avoid losing punctuation logic if we had it)
           // Actually, for lyric sync, words are truth.
           
           if (reconstructedText.length > 0) {
             segments.push({
                text: reconstructedText,
                start: words[0].start,
                end: words[words.length - 1].end,
                words
             });
             fullText += reconstructedText + ' ';
           }
        } else if (cleanSegmentText.length > 0) {
             // Fallback: If we have clean text but no words (rare, maybe extremely short segment)
             segments.push({
               text: cleanSegmentText,
               start: (segment.t0 != null ? segment.t0 / 100 : segment.start || 0),
               end: (segment.t1 != null ? segment.t1 / 100 : segment.end || 0),
               words: [] // No words, but segment exists
             });
             fullText += cleanSegmentText + ' ';
        } else {
             // console.log(`[WhisperService] Dropped empty/noise segment: "${rawSegmentText}"`);
        }
      });
    }
    
    
    console.log('[WhisperService] Parsed segments:', segments.length);
    console.log('[WhisperService] Total words:', segments.reduce((sum, s) => sum + s.words.length, 0));
    
    return {
      segments,
      fullText: fullText.trim(),
      language: result.language || 'en'
    };
  }
  
  /**
   * Get all words with timestamps (flattened from segments)
   * Useful for DTW alignment
   * 
   * @param result - Whisper result
   * @returns Array of all words with timestamps
   */
  getWordsFromResult(result: WhisperResult): WhisperWord[] {
    const allWords: WhisperWord[] = [];
    
    result.segments.forEach(segment => {
      allWords.push(...segment.words);
    });
    
    return allWords;
  }
  
  /**
   * Calculate average confidence from Whisper result
   * 
   * @param result - Whisper result
   * @returns Average confidence (0-1)
   */
  getAverageConfidence(result: WhisperResult): number {
    let totalConfidence = 0;
    let wordCount = 0;
    
    result.segments.forEach(segment => {
      segment.words.forEach(word => {
        totalConfidence += word.probability;
        wordCount++;
      });
    });
    
    return wordCount > 0 ? totalConfidence / wordCount : 0.8;
  }
  
  /**
   * Check if Whisper is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.whisperContext !== null;
  }
  
  /**
   * Get model path (if initialized)
   */
  getModelPath(): string | null {
    return this.modelPath;
  }
  
  /**
   * Stop an active transcription task
   */
  stop(): void {
    if (this.activeTask) {
      console.log('[WhisperService] Stopping active task...');
      this.activeTask.stop();
      this.activeTask = null;
      this.isTranscribing = false;
    }
  }

  /**
   * Release Whisper context to free memory
   */
  async release(): Promise<void> {
    this.stop(); // Ensure active task is stopped first
    if (this.whisperContext) {
      try {
        await this.whisperContext.release();
        console.log('[WhisperService] Context released');
      } catch (error) {
        console.error('[WhisperService] Release error:', error);
      }
      this.whisperContext = null;
      this.isInitialized = false;
      this.isTranscribing = false;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let whisperServiceInstance: WhisperService | null = null;

/**
 * Get singleton instance of WhisperService
 */
export function getWhisperService(): WhisperService {
  if (!whisperServiceInstance) {
    whisperServiceInstance = new WhisperService();
  }
  return whisperServiceInstance;
}
