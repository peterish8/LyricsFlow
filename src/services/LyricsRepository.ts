/**
 * LyricsRepository
 * Simplified with Lyrica API (aggregates LRCLIB, YouTube Music, Genius, JioSaavn)
 */

import { lyricaService, LyricaResult } from './LyricaService';
import { SmartLyricMatcher } from './SmartLyricMatcher';

export interface SearchResult {
  id: string;
  source: string;
  type: 'synced' | 'plain';
  trackName: string;
  artistName: string;
  albumName?: string;
  plainLyrics: string;
  syncedLyrics?: string;
  matchScore: number;
  matchReason: string;
  duration?: number;
  albumArt?: string;
  url?: string;
}

export const LyricsRepository = {
  searchSmart: async (
    query: string,
    targetMetadata: { title: string; artist: string; duration: number },
    onProgress?: (status: string) => void
  ): Promise<SearchResult[]> => {
    const results: SearchResult[] = [];
    
    onProgress?.('Searching global databases...');
    
    try {
      const lyricaResult = await lyricaService.fetchLyrics(
        targetMetadata.title,
        targetMetadata.artist
      );
      
      if (!lyricaResult) {
        onProgress?.('No lyrics found');
        return [];
      }

      const hasTimestamps = lyricaService.hasTimestamps(lyricaResult.lyrics);
      const parsedLyrics = hasTimestamps 
        ? lyricaService.parseLrc(lyricaResult.lyrics)
        : [];

      const scored = SmartLyricMatcher.calculateScore(
        {
          id: 1,
          trackName: lyricaResult.metadata?.title || targetMetadata.title,
          artistName: lyricaResult.metadata?.artist || targetMetadata.artist,
          duration: lyricaResult.metadata?.duration || targetMetadata.duration,
          plainLyrics: lyricaResult.lyrics,
          syncedLyrics: hasTimestamps ? lyricaResult.lyrics : '',
          albumName: lyricaResult.metadata?.album || '',
          instrumental: false,
        },
        null,
        targetMetadata
      );

      results.push({
        id: 'lyrica-1',
        source: lyricaResult.source,
        type: hasTimestamps ? 'synced' : 'plain',
        trackName: lyricaResult.metadata?.title || targetMetadata.title,
        artistName: lyricaResult.metadata?.artist || targetMetadata.artist,
        albumName: lyricaResult.metadata?.album,
        plainLyrics: lyricaResult.lyrics,
        syncedLyrics: hasTimestamps ? lyricaResult.lyrics : undefined,
        matchScore: scored.matchScore,
        matchReason: scored.matchReason,
        duration: lyricaResult.metadata?.duration,
        albumArt: lyricaResult.metadata?.coverArt,
      });

      onProgress?.(`Found lyrics from ${lyricaResult.source}`);
    } catch (error) {
      console.error('[LyricsRepository] Error:', error);
      onProgress?.('Search failed');
    }

    return results;
  }
};
