/**
 * LyricFlow - Lyrica API Service
 * Single source for all lyrics (LRCLIB, YouTube Music, Genius, JioSaavn, etc.)
 */

import { LyricLine } from '../types/song';

const BASE_URL = 'https://test-0k.onrender.com/lyrics';

export interface LyricaResult {
  lyrics: string;
  source: string;
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;
    coverArt?: string;
  };
}

class LyricaService {
  async fetchLyrics(song: string, artist: string): Promise<LyricaResult | null> {
    try {
      // Clean song title - remove file extensions and extra metadata
      let cleanSong = song
        .replace(/\(Lyrics\)/gi, '')
        .replace(/\(Official.*?\)/gi, '')
        .replace(/\(MP3_\d+K\)/gi, '')
        .replace(/\(Audio\)/gi, '')
        .trim();
      
      // Clean artist - handle "Unknown Artist"
      let cleanArtist = artist === 'Unknown Artist' ? '' : artist;
      
      // If artist is empty and song has dash, split it
      if (!cleanArtist && cleanSong.includes(' - ')) {
        const parts = cleanSong.split(' - ');
        cleanArtist = parts[0].trim();
        cleanSong = parts.slice(1).join(' - ').trim();
      }
      
      console.log('[Lyrica] Cleaned - Artist:', cleanArtist, 'Song:', cleanSong);
      
      // Priority: Synced (slow) > Synced (fast) > Plain text
      // User request: "synced slow , then synced fats then plain"
      const strategies = [
        { timestamps: true, fast: false, label: 'synced-slow' },
        { timestamps: true, fast: true, label: 'synced-fast' },
        { timestamps: false, fast: false, label: 'plain' },
      ];
      
      for (const strategy of strategies) {
        const url = `${BASE_URL}/?artist=${encodeURIComponent(cleanArtist)}&song=${encodeURIComponent(cleanSong)}&timestamps=${strategy.timestamps}&fast=${strategy.fast}&metadata=true`;
        
        console.log(`[Lyrica] Trying ${strategy.label}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        try {
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            console.log(`[Lyrica] ${strategy.label} HTTP ${response.status}:`, errorText);
            continue;
          }

          const data = await response.json();
          console.log(`[Lyrica] ${strategy.label} response:`, JSON.stringify(data));
          
          if (data.status === 'success') {
            let finalLyrics = data.data?.lyrics;

            // Handle structured timed lyrics if plaintext is missing
            if (!finalLyrics && data.data?.timestamped) {
               console.log(`[Lyrica] Found 'timestamped' field, using as lyrics`);
               finalLyrics = data.data.timestamped;
            }

            // Handle structured timed lyrics array if plaintext is missing
            if (!finalLyrics && Array.isArray(data.data?.timed_lyrics)) {
              console.log(`[Lyrica] Converting ${data.data.timed_lyrics.length} timed lines to LRC`);
              finalLyrics = data.data.timed_lyrics
                .map((line: any) => {
                  const ms = line.start_time || 0;
                  const minutes = Math.floor(ms / 60000);
                  const seconds = Math.floor((ms % 60000) / 1000);
                  const hundredths = Math.floor((ms % 1000) / 10);
                  const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;
                  return `${timestamp} ${line.text || ''}`;
                })
                .join('\n');
            }

            if (finalLyrics) {
              console.log(`[Lyrica] ✓ Found via ${data.data.source || strategy.label}`);
              return {
                lyrics: finalLyrics,
                source: data.data.source || 'Lyrica',
                metadata: data.metadata,
              };
            }
          }
        } catch (err: any) {
          clearTimeout(timeoutId);
          console.log(`[Lyrica] ${strategy.label} failed:`, err.message);
        }
      }
      
      console.log('[Lyrica] All strategies exhausted');
      return null;
    } catch (error) {
      console.error('[Lyrica] Fetch error:', error);
      return null;
    }
  }

  parseLrc(lrcContent: string, duration: number = 180): LyricLine[] {
    if (!lrcContent) return [];
    
    const lines = lrcContent.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    // Check if ANY line has a timestamp first
    const hasTimestamps = lines.some(line => timeRegex.test(line));
    
    // Ensure valid duration for estimation (prevent 0 timestamps)
    const safeDuration = duration > 0 ? duration : 180;

    if (hasTimestamps) {
        // ... (standard parsing)
        // Standard LRC Parsing
        lines.forEach((line, index) => {
          const match = line.match(timeRegex);
          if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            // Normalize milliseconds: if 2 digits (e.g. 54) -> 540ms, if 3 digits (e.g. 540) -> 540ms
            const millisecondsStr = match[3].padEnd(3, '0'); 
            const milliseconds = parseInt(millisecondsStr, 10);
            
            const timestamp = minutes * 60 + seconds + milliseconds / 1000;
            let text = line.replace(timeRegex, '').trim();

            // Convert empty lines to [INSTRUMENTAL]
            if (!text) {
              text = '[INSTRUMENTAL]';
            }

            result.push({
              timestamp,
              text,
              lineOrder: index,
            });
          }
        });
    } else {
        // PLAIN TEXT AUTO-SCROLL LOGIC (Teleprompter Mode)
        // Distribute lines evenly across duration
        console.log(`[Lyrica] Parsing Plain Text (${lines.length} lines) over ${duration}s`);
        
        // Filter out empty lines to avoid gaps
        const meaningfulLines = lines.map(l => l.trim()).filter(l => l.length > 0);
        const totalLines = meaningfulLines.length;
        
        if (totalLines > 0) {
            const timePerLine = safeDuration / totalLines;
            
            meaningfulLines.forEach((text, index) => {
                result.push({
                    timestamp: index * timePerLine,
                    text: text,
                    lineOrder: index,
                    // Mark as 'estimated' if we had a flag, but for now standard format works
                });
            });
        }
    }
    
    return result.map((line, idx) => ({ ...line, lineOrder: idx }));
  }

  hasTimestamps(lyrics: string): boolean {
    return /\[\d{2}:\d{2}\.\d{2,3}\]/.test(lyrics);
  }
}

export const lyricaService = new LyricaService();
