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
            const results: LyricaResult[] = [];
            let finishedCount = 0;
            let resolved = false;
            const totalSources = 2; // Lyrica + Saavn
            
            return new Promise((resolve) => {
                const safeResolve = (value: LyricaResult[]) => {
                    if (resolved) return;
                    resolved = true;
                    resolve(value);
                };

                const checkCompletion = () => {
                    finishedCount++;
                    if (finishedCount >= totalSources) {
                        safeResolve(results); 
                    }
                };

                // 1. Lyrica Service
                lyricaService.fetchLyrics(title, artist)
                    .then(res => {
                        if (res) {
                            results.push(res);
                            if (/[[(]?\d{1,2}[:.]\d{1,2}[\])]?/.test(res.lyrics)) {
                                console.log('[LyricsEngine] ⚡ Fast exit: Found synced lyrics via Lyrica');
                                safeResolve([res]);
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
                            
                            if (/[[(]?\d{1,2}[:.]\d{1,2}[\])]?/.test(res.lyrics)) {
                                console.log('[LyricsEngine] ⚡ Fast exit: Found synced lyrics via Saavn');
                                safeResolve([result]);
                                return;
                            }
                        }
                    })
                    .catch(e => console.warn('[LyricsEngine] JioSaavn failed:', e))
                    .finally(checkCompletion);

                // 3. Timeout (8s)
                setTimeout(() => {
                    if (!resolved) {
                        console.log('[LyricsEngine] Timeout reached, returning collected results');
                        safeResolve(results);
                    }
                }, 8000);
            });

        } catch (error) {
             console.error('[LyricsEngine] Critical failure in fetchLyricsParallel:', error);
             return [];
        }
    }
};
