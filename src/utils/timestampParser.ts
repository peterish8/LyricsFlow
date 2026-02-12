/**
 * LyricFlow - Timestamp Parser Utility
 * Parses lyrics text with timestamps into structured LyricLine array
 * 
 * Supports formats:
 * - 0:01, 0:15, 1:23
 * - 00:01, 00:15, 01:23
 * - With or without brackets [0:01]
 * - With dialogue prefixes (- Speaker:)
 */

import { LyricLine } from '../types/song';

// Regex patterns for timestamp detection (Supports 00:00.00 and 00:00)
// Regex patterns for timestamp detection (Supports 00:00.00 and 00:00)
// Now permissive for 1-digit seconds to handle "dirty" lyrics like [0:3.75]
const TIMESTAMP_REGEX = /[[(]?(\d{1,2})[:.](\d{1,2})(\.\d+)?[\])]?/g;
const SINGLE_TIMESTAMP_REGEX = /[[(]?(\d{1,2})[:.](\d{1,2})(\.\d+)?[\])]?/;

/**
 * Parse a timestamp string into seconds
 * @param minutes - minutes part
 * @param seconds - seconds part
 * @param milliseconds - optional milliseconds part (e.g. ".75" or ".750")
 * @returns total seconds
 */
const parseTimeToSeconds = (minutes: string, seconds: string, milliseconds?: string): number => {
  const secs = parseFloat(seconds + (milliseconds || ''));
  return parseInt(minutes, 10) * 60 + secs;
};

/**
 * Parse raw lyrics text with timestamps into structured LyricLine array
 * Detects timestamps at any position in a line and strips them from display text.
 * 
 * @param rawText - Raw lyrics text with timestamps
 * @returns Array of LyricLine objects
 */
export const parseTimestampedLyrics = (rawText: string): LyricLine[] => {
  const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean);
  const lyrics: LyricLine[] = [];
  
  let currentTimestamp = 0;
  let currentTextLines: string[] = [];
  let lineOrder = 0;
  
  // First check if there are ANY timestamps
  const hasTimestamps = rawText.match(TIMESTAMP_REGEX);
  
  if (!hasTimestamps) {
    // If no timestamps, treat every line as a separate lyric line
    return lines.map((text, index) => ({
      timestamp: 0,
      text,
      lineOrder: index,
    }));
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Search for the first timestamp in this line
    const match = line.match(SINGLE_TIMESTAMP_REGEX);
    
    if (match) {
      // Save previous lyrics block if any
      if (currentTextLines.length > 0) {
        lyrics.push({
          timestamp: currentTimestamp,
          text: currentTextLines.join('\n'),
          lineOrder: lineOrder++,
        });
        currentTextLines = [];
      }
      
      // Parse new timestamp
      currentTimestamp = parseTimeToSeconds(match[1], match[2], match[3]);
      
      // Clean the line text by removing ALL timestamps and common separators
      let cleanedText = line.replace(TIMESTAMP_REGEX, '').trim();
      // Remove leading/trailing symbols commonly used as separators (-, :, |, .)
      cleanedText = cleanedText.replace(/^[ -:.|]+|[ -:.|]+$/g, '').trim();

      if (cleanedText.length > 0) {
        // Inline timestamp with text
        currentTextLines.push(cleanedText);
      }
      // If cleanedText is empty, it was a timestamp-only line, currentTimestamp is updated for next block
    } else {
      // Regular text line - add to current block
      currentTextLines.push(line);
    }
  }
  
  // Don't forget the last block
  if (currentTextLines.length > 0) {
    lyrics.push({
      timestamp: currentTimestamp,
      text: currentTextLines.join('\n'),
      lineOrder: lineOrder,
    });
  }
  
  return lyrics;
};

/**
 * Calculate total duration from lyrics (last timestamp + estimated reading time)
 * @param lyrics - Array of LyricLine objects
 * @returns Duration in seconds
 */
export const calculateDuration = (lyrics: LyricLine[]): number => {
  if (lyrics.length === 0) return 0;
  
  const lastLine = lyrics[lyrics.length - 1];
  // Add 10 seconds after the last timestamp for reading time
  return lastLine.timestamp + 10;
};

/**
 * Get the current line index based on elapsed time
 * @param lyrics - Array of LyricLine objects
 * @param currentTime - Current time in seconds
 * @returns Index of the current lyric line
 */
export const getCurrentLineIndex = (lyrics: LyricLine[], currentTime: number): number => {
  if (lyrics.length === 0) return -1;
  
  // Find the last line whose timestamp is <= currentTime
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (lyrics[i].timestamp <= currentTime) {
      return i;
    }
  }
  
  return 0; // Default to first line
};

/**
 * Convert lyrics array back to raw text format for editing
 * @param lyrics - Array of LyricLine objects
 * @returns Raw text with timestamps
 */
export const lyricsToRawText = (lyrics: LyricLine[]): string => {
  // Check if all timestamps are 0 (likely no timestamps were provided)
  const allZero = lyrics.every(line => line.timestamp === 0);
  
  if (allZero) {
    return lyrics.map(line => line.text).join('\n');
  }

  return lyrics
    .map((line) => {
      const minutes = Math.floor(line.timestamp / 60);
      const seconds = (line.timestamp % 60).toFixed(2); // Keep milliseconds
      const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(5, '0')}]`;
      return `${timeStr} ${line.text}`;
    })
    .join('\n');
};

/**
 * Validate if raw text contains valid timestamps
 * @param rawText - Raw lyrics text
 * @returns true if at least one valid timestamp is found
 */
export const hasValidTimestamps = (rawText: string): boolean => {
  return TIMESTAMP_REGEX.test(rawText);
};
