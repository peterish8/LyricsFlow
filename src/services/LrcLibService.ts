/**
 * Service for interacting with LRCLIB API
 * https://lrclib.net/docs
 */

import { LyricLine } from '../types/song';

const BASE_URL = 'https://lrclib.net/api';

export interface LrcLibTrack {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
}

export const LrcLibService = {
  /**
   * Search for lyrics by query or specific fields
   */
  search: async (params: string | { track_name?: string; artist_name?: string; album_name?: string; q?: string }): Promise<LrcLibTrack[]> => {
    try {
      let queryPath = '';
      if (typeof params === 'string') {
        queryPath = `/search?q=${encodeURIComponent(params)}`;
      } else {
        const querySegments = Object.entries(params)
          .filter(([_, v]) => v)
          .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`);
        queryPath = `/search?${querySegments.join('&')}`;
      }

      const searchUrl = `${BASE_URL}${queryPath}`;
      console.log('[LrcLibService] Searching LRCLIB:', searchUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(searchUrl, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`LRCLIB Search failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[LrcLibService] Search error:', error);
      return [];
    }
  },

  /**
   * Get specific lyrics by parameters (more precise than search)
   */
  getLyrics: async (
    trackName: string, 
    artistName: string, 
    albumName?: string, 
    duration?: number
  ): Promise<LrcLibTrack | null> => {
    try {
      // LRCLIB API uses specific query parameters
      let url = `${BASE_URL}/get?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName)}`;
      if (albumName) url += `&album_name=${encodeURIComponent(albumName)}`;
      if (duration) url += `&duration=${duration}`;
      
      console.log('[LrcLibService] Getting lyrics from:', url);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`LRCLIB Get failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[LrcLibService] GetLyrics error:', error);
      return null;
    }
  },

  /**
   * Parse LRC format string into LyricLine[]
   */
  parseLrc: (lrcContent: string): LyricLine[] => {
    if (!lrcContent) return [];
    
    const lines = lrcContent.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    lines.forEach((line, index) => {
      const match = line.match(timeRegex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3].padEnd(3, '0'), 10); // Handle 2 or 3 digit ms
        const timestamp = minutes * 60 + seconds + milliseconds / 1000;
        const text = line.replace(timeRegex, '').trim();

        if (text) {
          result.push({
            id: undefined, // Generated later or by DB
            timestamp,
            text,
            lineOrder: index // Temporary order
          });
        }
      }
    });
    
    // Re-index line orders
    return result.map((line, idx) => ({ ...line, lineOrder: idx }));
  }
};
