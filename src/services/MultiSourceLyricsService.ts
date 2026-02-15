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
            // We want to return AS SOON AS we find "Synced" lyrics.
            // But we also want to collect all results if only "Plain" lyrics are found, to choose the best one.
            
            const results: LyricaResult[] = [];
            let finishedCount = 0;
            const totalSources = 2; // Lyrica + Saavn
            
            return new Promise((resolve) => {
                const checkCompletion = () => {
                    finishedCount++;
                    if (finishedCount >= totalSources) {
                        // All done, return whatever we have
                        resolve(results); 
                    }
                };

                // 1. Lyrica Service
                lyricaService.fetchLyrics(title, artist)
                    .then(res => {
                        if (res) {
                            results.push(res);
                            // If we found SYNCED lyrics, stop waiting and return immediately!
                            if (/[[(]?\d{1,2}[:.]\d{1,2}[\])]?/.test(res.lyrics)) {
                                console.log('[LyricsEngine] ⚡ Fast exit: Found synced lyrics via Lyrica');
                                resolve([res]); // Return just this one (or we could wait for others but why?)
                                return;
                            }
                        }
                    })
                    .catch(e => console.warn('[LyricsEngine] Lyrica failed:', e))
                    .finally(checkCompletion);

                // 2. JioSaavn Service
                JioSaavnLyricsService.getLyrics(title, artist, duration)
                    .then(res => {
                        if (res) {
                            const result = {
                                lyrics: res.lyrics,
                                source: `JioSaavn (${res.source})`,
                                metadata: res.metadata
                            } as LyricaResult;
                            results.push(result);
                            
                            // If we found SYNCED lyrics and haven't resolved yet
                            if (/[[(]?\d{1,2}[:.]\d{1,2}[\])]?/.test(res.lyrics)) {
                                console.log('[LyricsEngine] ⚡ Fast exit: Found synced lyrics via Saavn');
                                resolve([results[0]]); // Return just this one (or we could wait for others but why?)
                                return;
                            }
                        }
                    })
                    .catch(e => console.warn('[LyricsEngine] JioSaavn failed:', e))
                    .finally(checkCompletion);

                // 3. Timeout (8s) - redundancy in case logic fails
                setTimeout(() => {
                    if (finishedCount < totalSources) {
                        console.log('[LyricsEngine] Timeout reached, returning collected results');
                        resolve(results);
                    }
                }, 8000);
            });

        } catch (error) {
             console.error('[LyricsEngine] Critical failure in fetchLyricsParallel:', error);
             return [];
        }
    }
};
