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
      
      // Priority: Synced (fast) > Synced (slow) > Plain text
      const strategies = [
        { timestamps: true, fast: true, label: 'synced-fast' },
        { timestamps: true, fast: false, label: 'synced-slow' },
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
          
          if (data.status === 'success' && data.data?.lyrics) {
            console.log(`[Lyrica] ✓ Found via ${data.data.source || strategy.label}`);
            return {
              lyrics: data.data.lyrics,
              source: data.data.source || 'Lyrica',
              metadata: data.metadata,
            };
          }
        } catch (err) {
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

  parseLrc(lrcContent: string): LyricLine[] {
    if (!lrcContent) return [];
    
    const lines = lrcContent.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    lines.forEach((line, index) => {
      const match = line.match(timeRegex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
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
    
    return result.map((line, idx) => ({ ...line, lineOrder: idx }));
  }

  hasTimestamps(lyrics: string): boolean {
    return /\[\d{2}:\d{2}\.\d{2,3}\]/.test(lyrics);
  }
}

export const lyricaService = new LyricaService();
