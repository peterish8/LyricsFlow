/**
 * LyricsRepository
 * Central controller for fetching lyrics with Waterfall Strategy:
 * 1. Tier 1: LRCLIB (Synced)
 * 2. Tier 2: Genius (Fallback - Plain Text)
 */

import { LrcLibService, LrcLibTrack } from './LrcLibService';
import { GeniusService, GeniusTrack } from './GeniusService';
import { SmartLyricMatcher, ScoredResult } from './SmartLyricMatcher';
import { Song } from '../types/song';

export interface SearchResult {
  id: string;
  source: 'LRCLIB' | 'Genius';
  type: 'synced' | 'plain';
  trackName: string;
  artistName: string;
  albumName?: string;
  plainLyrics: string;
  syncedLyrics?: string; // Only for LRCLIB
  matchScore: number;
  matchReason: string;
  duration?: number;
  url?: string; // For Genius
  albumArt?: string; // For Genius
}

export const LyricsRepository = {
  /**
   * Search and return ranking of best matches from all sources
   */
  searchSmart: async (
    query: string,
    targetMetadata: { title: string; artist: string; duration: number },
    onProgress?: (status: string) => void
  ): Promise<SearchResult[]> => {
    const results: SearchResult[] = [];
    
    // 1. Search LRCLIB (Tier 1)
    onProgress?.('Searching LRCLIB (Synced)...');
    let lrcResults: LrcLibTrack[] = [];
    try {
      lrcResults = await LrcLibService.search(query);
    } catch (error) {
      console.error('[LyricsRepository] LRCLIB network/error:', error);
      onProgress?.('LRCLIB unavailable. Trying Genius...');
    }
    
    // Score LRCLIB results
    const scoredLrc = lrcResults.map(res => {
      const scored = SmartLyricMatcher.calculateScore(
        res, 
        null, // No user lyrics to compare yet (unless we pass them)
        targetMetadata
      );
      
      return {
        id: `lrc-${res.id}`,
        source: 'LRCLIB' as const,
        type: (res.syncedLyrics ? 'synced' : 'plain') as 'synced' | 'plain',
        trackName: res.trackName,
        artistName: res.artistName,
        albumName: res.albumName,
        plainLyrics: res.plainLyrics,
        syncedLyrics: res.syncedLyrics,
        matchScore: scored.matchScore,
        matchReason: scored.matchReason,
        duration: res.duration
      };
    });

    results.push(...scoredLrc);

    // 2. Check if we have a good match
    const bestMatch = scoredLrc.sort((a, b) => b.matchScore - a.matchScore)[0];
    const hasGoodSynced = bestMatch && bestMatch.matchScore > 60 && bestMatch.type === 'synced';

    // 3. Fallback to Genius (Tier 2) if necessary
    // We fetch Genius if we don't have a good synced match, OR just to offer alternatives
    // To save bandwidth, maybe only if top score < 80? But user wants "Waterfall".
    // Let's being robust: If score < 80 (likely no perfect sync), fetch Genius.
    if (!hasGoodSynced || scoredLrc.length === 0) {
      onProgress?.('Verification finished. Checking Genius...');

      try {
        const geniusHits = await GeniusService.searchGenius(query);

        // We only take top 3 Genius hits to avoid scraping too much
        const topGenius = geniusHits.slice(0, 3);

        for (const hit of topGenius) {
          onProgress?.(`Fetching text for: ${hit.title}...`);

          // Never allow one failed page fetch to abort the whole search.
          let lyricsText: string | null = null;
          try {
            lyricsText = await GeniusService.scrapeGeniusLyrics(hit.url);
          } catch (error) {
            console.error(`[LyricsRepository] Genius scrape failed for ${hit.url}:`, error);
            continue;
          }

          if (lyricsText) {
            const scoredGenius = SmartLyricMatcher.calculateScore(
              {
                id: hit.id,
                trackName: hit.title,
                artistName: hit.artist,
                duration: targetMetadata.duration, // Genius doesn't give duration easily, assume match
                plainLyrics: lyricsText,
                syncedLyrics: '',
                albumName: '',
                instrumental: false
              },
              null,
              targetMetadata
            );

            results.push({
              id: `gen-${hit.id}`,
              source: 'Genius',
              type: 'plain',
              trackName: hit.title,
              artistName: hit.artist,
              albumArt: hit.albumArt,
              plainLyrics: lyricsText,
              matchScore: scoredGenius.matchScore, // Usually high if title matches
              matchReason: 'Genius Metadata Match',
              url: hit.url
            });
          }
        }
      } catch (error) {
        console.error('[LyricsRepository] Genius network/error:', error);
        onProgress?.('Genius unavailable (network/rate limit). Showing available results.');
      }
    }

    // Return sorted by Score
    const sorted = results.sort((a, b) => b.matchScore - a.matchScore);
    onProgress?.(sorted.length > 0 ? `Found ${sorted.length} result(s)` : 'No lyrics found from online sources');
    return sorted;
  }
};
