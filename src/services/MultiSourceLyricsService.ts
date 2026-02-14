import { lyricaService, LyricaResult } from './LyricaService';
import { LrcLibService } from './LrcLibService';
import { JioSaavnLyricsService } from './JioSaavnLyricsService';
import { UnifiedSong } from '../types/song';

/**
 * Service to race multiple lyric providers and aggregate results
 * User Requirement: "Show all lyrics so they can preview and select"
 */
export const MultiSourceLyricsService = {
    
    fetchLyricsParallel: async (title: string, artist: string, duration?: number): Promise<LyricaResult[]> => {
        console.log(`[LyricsEngine] 🚀 Starting Parallel Search: ${title} - ${artist}`);
        
        // 1. Lyrica Aggregator (Existing "All-in-One" - Test Backend)
        // Note: Lyrica already tries Synced Slow -> Synced Fast -> Plain internally
        const lyricaPromise = lyricaService.fetchLyrics(title, artist)
            .then(res => {
                if (res) {
                    // Tag it clearly
                    return { ...res, source: `Lyrica (${res.source})` };
                }
                return null;
            })
            .catch(e => {
                console.warn('[LyricsEngine] Lyrica failed:', e);
                return null;
            });

        // 2. Direct LrcLib (Official Instance)
        // User Request: "what if my lrcib suced"
        const lrcLibPromise = LrcLibService.getLyrics(title, artist, undefined, duration)
            .then(res => {
                if (res && (res.syncedLyrics || res.plainLyrics)) {
                     // LrcLib can return both synced and plain in one object. 
                     // We might want to split them into two options? 
                     // For now, prioritize synced.
                     const text = res.syncedLyrics || res.plainLyrics;
                     const isSynced = !!res.syncedLyrics;
                     
                     return {
                         lyrics: text,
                         source: `LRCLIB.net (${isSynced ? 'Synced' : 'Plain'})`,
                         metadata: {
                             title: res.trackName,
                             artist: res.artistName,
                             duration: res.duration
                         }
                     } as LyricaResult;
                }
                return null;
            })
            .catch(e => {
                 console.warn('[LyricsEngine] LRCLIB Direct failed:', e);
                 return null;
            });
            
        // 3. JioSaavn (Official API with synced lyrics)
        const saavnPromise = JioSaavnLyricsService.getLyrics(title, artist, duration)
            .then(res => {
                if (res) {
                    return {
                        lyrics: res.lyrics,
                        source: `JioSaavn (${res.source})`,
                        metadata: res.metadata
                    } as LyricaResult;
                }
                return null;
            })
            .catch(e => {
                console.warn('[LyricsEngine] JioSaavn failed:', e);
                return null;
            });

        // RACE CONDITION: Return results after 5s OR when all complete
        // This ensures fast sources aren't blocked by slow ones
        const results: LyricaResult[] = [];
        
        const collectResults = async () => {
            const outcomes = await Promise.allSettled([lyricaPromise, lrcLibPromise, saavnPromise]);
            outcomes.forEach(outcome => {
                if (outcome.status === 'fulfilled' && outcome.value) {
                    results.push(outcome.value);
                }
            });
        };
        
        // Race between: 1) All sources completing, 2) 5-second timeout
        await Promise.race([
            collectResults(),
            new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        
        // If timeout hit before all completed, collect whatever we have so far
        if (results.length === 0) {
            const outcomes = await Promise.allSettled([lyricaPromise, lrcLibPromise, saavnPromise]);
            outcomes.forEach(outcome => {
                if (outcome.status === 'fulfilled' && outcome.value) {
                    results.push(outcome.value);
                }
            });
        }

        // Deduplicate based on content overlap? 
        // For now, just return all. The user wants to "select".
        
        console.log(`[LyricsEngine] ✅ Found ${results.length} lyric options`);
        return results;
    }
};
