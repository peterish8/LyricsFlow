import { lyricaService, LyricaResult } from './LyricaService';
// import { LrcLibService } from './LrcLibService';
import { JioSaavnLyricsService } from './JioSaavnLyricsService';
import { GeniusService } from './GeniusService';
import { UnifiedSong } from '../types/song';

/**
 * Service to race multiple lyric providers and aggregate results
 * User Requirement: "Show all lyrics so they can preview and select"
 */
export const MultiSourceLyricsService = {
    
    fetchLyricsParallel: async (title: string, artist: string, duration?: number): Promise<LyricaResult[]> => {
        try {
            let lyricaResult: LyricaResult | null = null;
            let saavnResult: LyricaResult | null = null;

            // 1. Lyrica Service (Wraps Lyrica Slow -> Fast -> Plain)
            const lyricaPromise = lyricaService.fetchLyrics(title, artist)
                .then(res => {
                    if (res) lyricaResult = res;
                })
                .catch(e => console.warn('[LyricsEngine] Lyrica failed:', e));

            // 2. JioSaavn Service
            const saavnPromise = JioSaavnLyricsService.getLyrics(title, artist, duration)
                .then(res => {
                    if (res) {
                        saavnResult = {
                            lyrics: res.lyrics,
                            source: `JioSaavn (${res.source})`,
                            metadata: res.metadata
                        } as LyricaResult;
                    }
                })
                .catch(e => console.warn('[LyricsEngine] JioSaavn failed:', e));

            // Race: All finished OR 8s timeout (User requested "Lyrica Slow", so give it time)
            await Promise.race([
                Promise.all([lyricaPromise, saavnPromise]),
                new Promise(resolve => setTimeout(resolve, 8000))
            ]);

            // Construct results with explicit priority: Lyrica > JioSaavn
            // This ensures logic downstream (which picks first synced) will prefer Lyrica
            const validResults: LyricaResult[] = [];
            if (lyricaResult) validResults.push(lyricaResult);
            if (saavnResult) validResults.push(saavnResult!);

            console.log(`[LyricsEngine] Found ${validResults.length} lyric sources for "${title}". Lyrica found: ${!!lyricaResult}`);
            return validResults;

        } catch (error) {
             console.error('[LyricsEngine] Critical failure in fetchLyricsParallel:', error);
             return [];
        }
    }
};
