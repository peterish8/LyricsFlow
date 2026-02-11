/**
 * LuvLyrics - Auto-Timestamp Service V2
 * 
 * Production-grade service for automatic lyric timestamping using Whisper + DTW.
 * Supports two modes:
 * - Magic Mode: User provides lyrics, AI adds timestamps
 * - Pure Magic Mode: AI extracts lyrics + timestamps from audio
 * 
 * @module AutoTimestampServiceV2
 * @version 2.0.0
 */

import { getWhisperService, WhisperWord, WhisperResult, WhisperSegment } from './whisperService';

// ============================================================================
// TYPES
// ============================================================================

export interface LyricLine {
  text: string;
  timestamp: number; // seconds
  order: number;
  confidence?: number;
}

export interface AutoTimestampResult {
  lyrics: LyricLine[];
  overallConfidence: number;
  warnings: string[];
  successfulMatches: number;
  totalLines: number;
  processingTime: number;
}

export interface ProcessingProgress {
  stage: string;
  progress: number; // 0-1
}

// ============================================================================
// AUTO-TIMESTAMP SERVICE V2
// ============================================================================

export class AutoTimestampServiceV2 {
  private whisperService = getWhisperService();
  
  /**
   * MAGIC MODE: Process audio and add timestamps to user-provided lyrics
   * 
   * @param audioUri - Path to audio file
   * @param userLyrics - Plain text lyrics from user
   * @param onProgress - Progress callback
   * @returns Promise<AutoTimestampResult> - Timestamped lyrics
   */
  async processAudio(
    audioUri: string,
    userLyrics: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<AutoTimestampResult> {
    
    console.log('[AutoTimestamp V2] Starting Magic Mode...');
    const startTime = Date.now();
    
    try {
      // STEP 1: Initialize Whisper (download model if needed)
      onProgress?.('Initializing Whisper...', 0.1);
      await this.whisperService.initialize((progress) => {
        onProgress?.('Downloading AI model...', 0.1 + (progress * 0.2));
      });
      
      // STEP 2: Transcribe audio with Whisper
      onProgress?.('Analyzing audio...', 0.3);
      const transcription = await this.whisperService.transcribe(audioUri);
      
      onProgress?.('Processing lyrics...', 0.7);
      
      // STEP 3: Parse user lyrics
      const lyricLines = this.parseUserLyrics(userLyrics);
      
      if (lyricLines.length === 0) {
        throw new Error('No valid lyrics found. Please provide lyrics text.');
      }
      
      console.log('[AutoTimestamp V2] Parsed', lyricLines.length, 'lyric lines');
      
      // STEP 4: Align using DTW
      const whisperWords = this.whisperService.getWordsFromResult(transcription);
      
      if (whisperWords.length === 0) {
        if (transcription.segments.length > 0) {
            throw new Error('AI detected only music/noise. Audio might be instrumental or vocal volume too low.');
        } else {
            throw new Error('AI detected silence. Please check audio file.');
        }
      }

      const aligned = this.alignLyricsWithDTW(
        whisperWords,
        lyricLines
      );
      
      const processingTime = (Date.now() - startTime) / 1000;
      
      onProgress?.('Complete!', 1.0);
      
      return {
        ...aligned,
        processingTime
      };
      
    } catch (error: any) {
      console.error('[AutoTimestamp V2] Error:', error);
      throw new Error(`Auto-timestamp failed: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * PURE MAGIC MODE: Auto-generate lyrics + timestamps from audio
   * (No user lyrics needed)
   * 
   * @param audioUri - Path to audio file
   * @param onProgress - Progress callback
   * @returns Promise<AutoTimestampResult> - Extracted lyrics with timestamps
   */
  async autoGenerateLyrics(
    audioUri: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<AutoTimestampResult> {
    
    console.log('[AutoTimestamp V2] Starting Pure Magic Mode...');
    const startTime = Date.now();
    
    try {
      // STEP 1: Initialize Whisper
      onProgress?.('Initializing AI...', 0.1);
      await this.whisperService.initialize((progress) => {
        onProgress?.('Downloading AI model...', 0.1 + (progress * 0.2));
      });
      
      // STEP 2: Transcribe audio with Whisper
      onProgress?.('Extracting lyrics from audio...', 0.4);
      const transcription = await this.whisperService.transcribe(audioUri);
      
      onProgress?.('Formatting lyrics...', 0.8);
      
      // STEP 3: Convert Whisper segments to lyric lines
      const lyrics = this.convertTranscriptionToLyrics(transcription);
      
      if (lyrics.length === 0) {
        throw new Error('Could not extract lyrics from audio. Audio may be instrumental or unclear.');
      }
      
      console.log('[AutoTimestamp V2] Extracted', lyrics.length, 'lyric lines');
      
      const processingTime = (Date.now() - startTime) / 1000;
      
      onProgress?.('Complete!', 1.0);
      
      return {
        lyrics,
        overallConfidence: this.calculateWhisperConfidence(transcription),
        warnings: this.generateWhisperWarnings(transcription),
        successfulMatches: lyrics.length,
        totalLines: lyrics.length,
        processingTime
      };
      
    } catch (error: any) {
      console.error('[AutoTimestamp V2] Pure Magic error:', error);
      throw new Error(`Pure Magic failed: ${error.message || 'Unknown error'}`);
    }
  }
  
  // ==========================================================================
  // LYRICS PARSING
  // ==========================================================================
  
  /**
   * Parse user lyrics into clean lines
   */
  private parseUserLyrics(rawLyrics: string): string[] {
    return rawLyrics
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !this.isTimestamp(line))
      .filter(line => !this.isMetadata(line));
  }
  
  /**
   * Check if line is a timestamp
   */
  private isTimestamp(line: string): boolean {
    // Permissive regex to catch [00:00.00] and loose 0:3.75 timestamps
    // Checks if the line is *mostly* a timestamp
    const timestampRegex = /^[\[\(]?\d{1,2}[:.]\d{1,2}(\.\d+)?[\]\)]?$/;
    return timestampRegex.test(line.trim());
  }
  
  /**
   * Check if line is metadata (e.g., [Chorus], [Verse 1])
   */
  private isMetadata(line: string): boolean {
    return /^\[.*\]$/.test(line.trim()) && !this.isTimestamp(line);
  }
  
  // ==========================================================================
  // DTW ALIGNMENT ALGORITHM
  // ==========================================================================
  
  /**
   * Align lyrics using Constrained Window Search (The "Leash" Approach)
   */
  private alignLyricsWithDTW(
    transcription: WhisperWord[],
    lyricLines: string[]
  ): Omit<AutoTimestampResult, 'processingTime'> {
    
    const alignedLyrics: LyricLine[] = [];
    const warnings: string[] = [];
    
    // THE ANCHOR: The timestamp where the LAST high-confidence match ended.
    // We start searching from here.
    let searchStartTimestamp = 0.0;
    let searchStartIndex = 0;
    
    let successfulMatches = 0;
    
    console.log(`[Aligner] Aligning ${lyricLines.length} lines with ${transcription.length} words...`);
    
    for (let i = 0; i < lyricLines.length; i++) {
      const line = lyricLines[i];
      const lineNumber = i + 1;
      
      // 1. Define the "Leash" (Window)
      // Look from [Anchor] ... [Anchor + 15s]
      const WINDOW_DURATION_SECONDS = 15.0; 
      const windowEndTimestamp = searchStartTimestamp + WINDOW_DURATION_SECONDS;
      
      // Get words for Primary Window (15s)
      const primaryWindowWords = this.getWordsInWindow(transcription, searchStartTimestamp, windowEndTimestamp, searchStartIndex);
      
      // 2. Find best match strictly WITHIN the 15s window
      let match = this.findBestInWindow(line, primaryWindowWords);
      
      // 3. Instrumental Safety Net (Expanding Fallback)
      // If NO match found in 15s (very low confidence), try 60s window for instrumentals
      if (match.confidence < 0.4) {
          console.log(`[Aligner] Line ${lineNumber}: No match in 15s window. Trying 60s fallback (Instrumental check)...`);
          const EXPANDED_WINDOW = 60.0;
          const expandedEnd = searchStartTimestamp + EXPANDED_WINDOW;
          const expandedWords = this.getWordsInWindow(transcription, searchStartTimestamp, expandedEnd, searchStartIndex);
          
          const fallbackMatch = this.findBestInWindow(line, expandedWords);
          
          // Strict requirement for fallback: must be VERY confident (> 0.8) to jump
          if (fallbackMatch.confidence > 0.8) {
              console.log(`[Aligner]   -> FALLBACK MATCH found in 60s window! (Conf: ${(fallbackMatch.confidence*100).toFixed(0)}%)`);
              match = fallbackMatch;
          }
      }

      // 4. Anchor Logic (Anti-Drift)
      if (match.confidence >= 0.6) {
        // High/Medium Confidence: We found it!
        // Move the anchor to the end of this match so next line searches AFTER this.
        
        // Map local window index back to global index/timestamp
        // match.endIndex is relative to windowWords... NO, wait.
        // `findBestInWindow` returns endIndex relative to the window. 
        // We need to match it back to global.
        
        // Re-calculate global index based on the window used (primary or expanded)
        const usedWindow = (match === match /* just a reference check */ && match.confidence < 0.4) ? [] : primaryWindowWords; 
        // Actually, simpler: findBestInWindow returns the *timestamp*. 
        // We can just find that timestamp in the global array to set the index.
        
        searchStartTimestamp = match.timestamp + 0.1; // approximate end, or we can look up exact word end
        // Let's rely on timestamp more than index to be safe.
        
        // Update Search Index for optimization
        // Find index of word starting at match.timestamp
        let specificWordIndex = searchStartIndex;
        while(specificWordIndex < transcription.length && transcription[specificWordIndex].start < match.timestamp) {
            specificWordIndex++;
        }
        searchStartIndex = specificWordIndex;
        
        successfulMatches++;
        
        alignedLyrics.push({
            text: line,
            timestamp: match.timestamp,
            order: i,
            confidence: match.confidence
        });
        console.log(`[Aligner]   -> MATCH: ${match.timestamp.toFixed(2)}s (Conf: ${(match.confidence*100).toFixed(0)}%)`);

      } else {
        // Low Confidence (The "Benz/Pants" Scenario)
        // ... (rest of logic same)
        
        if (match.confidence > 0.3) {
             console.log(`[Aligner]   -> WEAK MATCH: ${match.timestamp.toFixed(2)}s (Conf: ${(match.confidence*100).toFixed(0)}%) - Keeping Anchor at: ${searchStartTimestamp.toFixed(2)}s`);
             // Move anchor slightly
             searchStartTimestamp += 2.0; 
             alignedLyrics.push({
                text: line,
                timestamp: match.timestamp,
                order: i,
                confidence: match.confidence
            });
        } else {
             console.log(`[Aligner]   -> NOT FOUND.`);
             alignedLyrics.push({ text: line, timestamp: 0, order: i, confidence: 0 });
             searchStartTimestamp += 1.0; 
        }
        warnings.push(`Line ${lineNumber}: Low confirm.`);
      }
    }
    
    // 5. Post-Processing: Fix Pile-Ups (The "VAD-Enforced Elastic Stretch")
    
    // Step 5a: Generate "VAD Segments" (Voice Zones) from the raw transcription
    // We treat any valid word segment as "Voice". Gaps between them are "Silence".
    const vadSegments = this.inferVADSegments(transcription);
    
    // Step 5b: Interpolate with VAD awareness
    this.interpolateTimestamps(alignedLyrics, vadSegments);

    const overallConfidence = successfulMatches / lyricLines.length;
    
    return {
      lyrics: alignedLyrics,
      overallConfidence,
      warnings,
      successfulMatches,
      totalLines: lyricLines.length
    };
  }

  /**
   * 🧠 VAD ESTIMATOR: Infers Voice Activity from Whisper Segments
   * Merges close segments to create "Voice Zones".
   * Gaps larger than 2.0s are considered "Instrumental Breaks".
   */
  private inferVADSegments(words: WhisperWord[]): {start: number, end: number}[] {
      if (!words.length) return [];
      
      const segments: {start: number, end: number}[] = [];
      let currentStart = words[0].start;
      let currentEnd = words[0].end;
      
      for (let i = 1; i < words.length; i++) {
          const w = words[i];
          
          // If the gap is small (< 2.0s), merge it into the current segment
          if (w.start - currentEnd < 2.0) {
              currentEnd = Math.max(currentEnd, w.end);
          } else {
              // Gap is large (> 2.0s) -> Push valid segment and start new one
              segments.push({ start: currentStart, end: currentEnd });
              currentStart = w.start;
              currentEnd = w.end;
          }
      }
      segments.push({ start: currentStart, end: currentEnd });
      
      return segments;
  }

  /**
   * 🎯 PRECISION FIX V3: VAD-Enforced Elastic Stretch
   * 1. Invalidates "Anchors" that are physically impossible.
   * 2. Stretches invalid lines between anchors.
   * 3. [NEW] Skips "Silence Zones" (Instrumental Breaks) defined by VAD.
   */
  private interpolateTimestamps(lines: LyricLine[], vadSegments: {start: number, end: number}[]) {
      const HIGH_CONFIDENCE_THRESHOLD = 0.75; 

      // Step 1: Identify VALID Anchors
      const anchors = lines.map((line, index) => {
          let isAnchor = (line.confidence || 0) >= HIGH_CONFIDENCE_THRESHOLD;

          if (index === 0 || index === lines.length - 1) {
              isAnchor = true;
          }

          // PHYSICS CHECK
          if (index > 0) {
              const prevTime = lines[index - 1].timestamp;
              if (line.timestamp - prevTime < 0.5) {
                  isAnchor = false; 
              }
          }

          return { index, time: line.timestamp, isAnchor };
      });

      // Step 2: The Elastic Loop
      let lastAnchorIndex = 0;

      for (let i = 1; i < anchors.length; i++) {
          if (anchors[i].isAnchor) {
              const prevAnchor = anchors[lastAnchorIndex];
              const nextAnchor = anchors[i];

              const timeGap = nextAnchor.time - prevAnchor.time;
              const indexGap = nextAnchor.index - prevAnchor.index;

              if (indexGap > 1) {
                  const step = timeGap / indexGap;
                  
                  console.log(`[Stretch] Fixing ${indexGap - 1} lines between ${prevAnchor.time} and ${nextAnchor.time}`);

                  for (let j = 1; j < indexGap; j++) {
                      const targetIndex = prevAnchor.index + j;
                      
                      // 1. Calculate naive elastic timestamp
                      let proposedTime = prevAnchor.time + (step * j);

                      // 2. VAD CHECK: Is this inside a "Voice Zone"?
                      // We want proposedTime to be INSIDE a segment.
                      // If it falls in a gap, we push it forward to the start of the NEXT segment.
                      
                      const inVoiceZone = vadSegments.some(seg => 
                          proposedTime >= seg.start && proposedTime <= seg.end
                      );
                      
                      if (!inVoiceZone) {
                           // Find the next valid voice segment start
                           const nextSegment = vadSegments.find(seg => seg.start > proposedTime);
                           if (nextSegment) {
                               // JUMP THE GAP!
                               proposedTime = nextSegment.start + (0.1 * j); // Stagger slightly so they don't pile up
                           }
                      }

                      lines[targetIndex].timestamp = parseFloat(proposedTime.toFixed(2));
                      lines[targetIndex].confidence = 0.5; 
                  }
              }

              lastAnchorIndex = i;
          }
      }
  }
  // Refactored helper to get words within a timeframe
  private getWordsInWindow(allWords: WhisperWord[], start: number, end: number, hintIndex: number): WhisperWord[] {
      const words: WhisperWord[] = [];
      let i = hintIndex;
      while (i < allWords.length && allWords[i].end < start) i++;
      while (i < allWords.length && allWords[i].start <= end) {
          words.push(allWords[i]);
          i++;
      }
      return words;
  }
  
  /**
   * Find best alignment strictly within the provided Window of words
   */
  private findBestInWindow(
    lyricLine: string,
    windowWords: WhisperWord[]
  ): { timestamp: number; confidence: number; endIndex: number } {
    
    const lyricWords = this.tokenize(lyricLine);
    if (lyricWords.length === 0) return { timestamp: 0, confidence: 0, endIndex: 0 };
    if (windowWords.length === 0) return { timestamp: 0, confidence: 0, endIndex: 0 };

    let bestMatch = {
      timestamp: 0,
      confidence: 0,
      endIndex: 0
    };
    
    // We search the entire `windowWords` array because it is already constrained (The "Leash").
    // Standard sliding window over the audio words.
    
    // Allow window size variation (audio might have more/fewer words than text due to hallucinations/mumbling)
    // We try to match `lyricWords.length` +/- margin
    
    for (let len = Math.max(1, lyricWords.length - 2); len <= lyricWords.length + 3; len++) {
        
        for (let i = 0; i <= windowWords.length - len; i++) {
            const candidateSegment = windowWords.slice(i, i + len);
            
            // DTW Score
            const dtwScore = this.computeDTW(
                lyricWords,
                candidateSegment.map(w => w.word) // .word is raw text
            );
            
            // Similarity 0..1
            const similarity = 1 / (1 + dtwScore);
            
            // Whisper Probability (if avail)
            const avgProb = candidateSegment.reduce((s, w) => s + (w.probability || 0.5), 0) / len;
            
            // Final Score
            // We favor similarity heavily here because we are already temporally constrained.
            const score = (similarity * 0.8) + (avgProb * 0.2);
            
            if (score > bestMatch.confidence) {
                bestMatch = {
                    timestamp: candidateSegment[0].start,
                    confidence: score,
                    endIndex: i + len // local index in windowWords
                };
            }
        }
    }
    
    return bestMatch;
  }
  
  /**
   * Dynamic Time Warping algorithm
   * Computes optimal alignment between two sequences
   */
  private computeDTW(seq1: string[], seq2: string[]): number {
    const n = seq1.length;
    const m = seq2.length;
    
    // Initialize DTW matrix
    const dtw: number[][] = Array(n + 1).fill(null).map(() => 
      Array(m + 1).fill(Infinity)
    );
    
    dtw[0][0] = 0;
    
    // Fill DTW matrix
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = this.wordDistance(seq1[i - 1], seq2[j - 1]);
        dtw[i][j] = cost + Math.min(
          dtw[i - 1][j],      // Insertion
          dtw[i][j - 1],      // Deletion
          dtw[i - 1][j - 1]   // Match
        );
      }
    }
    
    // Return normalized distance
    return dtw[n][m] / Math.max(n, m);
  }
  
  /**
   * Calculate distance between two words
   */
  private wordDistance(word1: string, word2: string): number {
    word1 = word1.toLowerCase().replace(/[^a-z]/g, '');
    word2 = word2.toLowerCase().replace(/[^a-z]/g, '');
    
    if (word1 === word2) return 0;
    if (this.soundsLike(word1, word2)) return 0.2;
    
    const lev = this.levenshteinDistance(word1, word2);
    return lev / Math.max(word1.length, word2.length);
  }
  
  /**
   * Phonetic similarity check (homophones)
   */
  private soundsLike(word1: string, word2: string): boolean {
    const homophones = [
      ['to', 'too', 'two'],
      ['their', 'there', 'theyre'],
      ['your', 'youre'],
      ['here', 'hear'],
      ['no', 'know'],
      ['for', 'four'],
      ['be', 'bee'],
      ['see', 'sea'],
      ['write', 'right'],
      ['night', 'knight']
    ];
    
    return homophones.some(group => 
      group.includes(word1) && group.includes(word2)
    );
  }
  
  /**
   * Levenshtein distance (edit distance)
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2[i - 1] === str1[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // Substitution
            matrix[i][j - 1] + 1,     // Insertion
            matrix[i - 1][j] + 1      // Deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }
  
  // ==========================================================================
  // PURE MAGIC MODE HELPERS
  // ==========================================================================
  
  /**
   * Convert Whisper transcription to timestamped lyric lines
   */
  private convertTranscriptionToLyrics(transcription: WhisperResult): LyricLine[] {
    const lyrics: LyricLine[] = [];
    
    transcription.segments.forEach((segment) => {
      const text = segment.text.trim();
      if (!text) return;
      
      // Rule 4: If the segment ITSELF is too long (> 45 chars), we must split it forcefully
      // This happens when Whisper returns a 10s block as one segment.
      
      const MAX_LEN = 45;
      
      if (text.length > MAX_LEN) {
          // It's a "Subtitle Block". Split it into sub-segments.
          const words = text.split(' ');
          let currentLine = "";
          let currentStart = segment.start;
          const durationPerChar = (segment.end - segment.start) / text.length;
          
          words.forEach((w, i) => {
              if ((currentLine.length + w.length) > MAX_LEN) {
                  // Push current line
                  lyrics.push({
                      text: this.normalizeLyricText(currentLine),
                      timestamp: currentStart, // Approximation
                      order: lyrics.length,
                      confidence: this.calculateSegmentConfidence(segment)
                  });
                  
                  // Update start time for next chunk (rough approx)
                  currentStart += (currentLine.length * durationPerChar);
                  currentLine = w;
              } else {
                  currentLine += (currentLine ? " " : "") + w;
              }
          });
          
          // Push remaining
          if (currentLine) {
             lyrics.push({
                  text: this.normalizeLyricText(currentLine),
                  timestamp: currentStart,
                  order: lyrics.length,
                  confidence: this.calculateSegmentConfidence(segment)
              });
          }
          return; // Done with this huge segment
      }

      // Merge logic: ONLY merge if very close and short to avoid chunking
      // Rule 1: Gap must be tiny (< 0.25s)
      // Rule 2: Max line length 45 chars
      // Rule 3: Do NOT merge if last line ended in punctuation
      
      const lastLyric = lyrics.length > 0 ? lyrics[lyrics.length - 1] : null;
      
      if (lastLyric && 
          (segment.start - lastLyric.timestamp) < 0.25 &&
          (lastLyric.text.length + text.length) < 45 &&
          !/[.!?]$/.test(lastLyric.text) // Force split on punctuation
      ) {
         lastLyric.text += ' ' + text;
      } else {
        // Otherwise add as new line (default behavior for better granularity)
        lyrics.push({
          text: this.normalizeLyricText(text),
          timestamp: segment.start,
          order: lyrics.length,
          confidence: this.calculateSegmentConfidence(segment)
        });
      }
    });

    return lyrics;
  }

  /**
   * Normalize lyric text (capitalize first letter, trim)
   */
  private normalizeLyricText(text: string): string {
    let clean = text.trim();
    if (clean.length === 0) return '';
    
    // Capitalize first letter if it's lowercase
    if (/^[a-z]/.test(clean)) {
      clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    
    return clean;
  }
  
  /**
   * Calculate average confidence from Whisper result
   */
  private calculateWhisperConfidence(transcription: WhisperResult): number {
    let totalConfidence = 0;
    let wordCount = 0;
    
    transcription.segments.forEach(segment => {
      segment.words.forEach(word => {
        totalConfidence += word.probability;
        wordCount++;
      });
    });
    
    return wordCount > 0 ? totalConfidence / wordCount : 0.8;
  }
  
  /**
   * Calculate confidence for a single segment
   */
  private calculateSegmentConfidence(segment: WhisperSegment): number {
    if (segment.words.length === 0) return 0.8;
    
    const avgProbability = segment.words.reduce((sum, word) => 
      sum + word.probability, 0
    ) / segment.words.length;
    
    return avgProbability;
  }
  
  /**
   * Generate warnings for low-confidence segments
   */
  private generateWhisperWarnings(transcription: WhisperResult): string[] {
    const warnings: string[] = [];
    
    transcription.segments.forEach((segment, index) => {
      const confidence = this.calculateSegmentConfidence(segment);
      
      if (confidence < 0.7) {
        warnings.push(
          `Line ${index + 1}: "${segment.text.substring(0, 40)}..." - ` +
          `Whisper confidence ${(confidence * 100).toFixed(0)}%. May need review.`
        );
      }
    });
    
    return warnings;
  }

  /**
   * Stop an active process
   */
  stop(): void {
    this.whisperService.stop();
  }

  /**
   * Release resources
   */
  async release(): Promise<void> {
    await this.whisperService.release();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let autoTimestampServiceInstance: AutoTimestampServiceV2 | null = null;

/**
 * Get singleton instance of AutoTimestampServiceV2
 */
export function getAutoTimestampService(): AutoTimestampServiceV2 {
  if (!autoTimestampServiceInstance) {
    autoTimestampServiceInstance = new AutoTimestampServiceV2();
  }
  return autoTimestampServiceInstance;
}
