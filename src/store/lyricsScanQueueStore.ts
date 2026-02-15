import { create } from 'zustand';
import { Song } from '../types/song';
import { MultiSourceLyricsService } from '../services/MultiSourceLyricsService';
import { useSongsStore } from './songsStore';
import { lyricaService } from '../services/LyricaService';
import * as FileSystem from 'expo-file-system/legacy';
import { parseTimestampedLyrics } from '../utils/timestampParser';

interface ScanJob {
  songId: string;
  title: string;
  artist: string;
  duration: number;
  audioUri: string;
  attempts: number;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  resultType?: 'synced' | 'plain' | 'none';
  log: string[];
}

interface LyricsScanQueueState {
  queue: ScanJob[];
  processing: boolean;
  
  addToQueue: (song: Song) => void;
  removeFromQueue: (songId: string) => void;
  processQueue: () => Promise<void>;
  getJobStatus: (songId: string) => ScanJob | undefined;
}

export const useLyricsScanQueueStore = create<LyricsScanQueueState>((set, get) => ({
  queue: [],
  processing: false,

  addToQueue: (song: Song) => {
    const { queue, processQueue } = get();
    const existing = queue.find(j => j.songId === song.id);
    
    if (existing) {
        if (existing.status === 'failed') {
            // Retry: Reset to pending and clear logs
            set(state => ({
                queue: state.queue.map(j => j.songId === song.id ? {
                    ...j,
                    status: 'pending',
                    attempts: 0,
                    log: ['Retrying...']
                } : j)
            }));
            if (!get().processing) processQueue();
        }
        return; 
    }

    const newJob: ScanJob = {
      songId: song.id,
      title: song.title,
      artist: song.artist || 'Unknown Artist',
      duration: song.duration,
      audioUri: song.audioUri || '',
      attempts: 0,
      status: 'pending',
      log: [`Queued`],
    };

    set({ queue: [...queue, newJob] });
    
    // Trigger processing if not running
    if (!get().processing) {
      processQueue();
    }
  },

  removeFromQueue: (songId: string) => {
    set(state => ({
      queue: state.queue.filter(j => j.songId !== songId)
    }));
  },
  
  getJobStatus: (songId: string) => {
      return get().queue.find(j => j.songId === songId);
  },

  processQueue: async () => {
    if (get().processing) return;
    set({ processing: true });

    try {
      while (true) {
        const { queue } = get();
        const nextJob = queue.find(j => j.status === 'pending');
        
        if (!nextJob) break;

        // Mark as scanning
        set(state => ({
          queue: state.queue.map(j => j.songId === nextJob.songId ? { ...j, status: 'scanning' } : j)
        }));

        // Helper to get latest job state to ensure logs are additive
        const updateJob = (updates: Partial<ScanJob> | ((prev: ScanJob) => Partial<ScanJob>)) => {
            set(state => ({
                queue: state.queue.map(j => {
                    if (j.songId === nextJob.songId) {
                         const newValues = typeof updates === 'function' ? updates(j) : updates;
                         return { ...j, ...newValues };
                    }
                    return j;
                })
            }));
        };

        // Logic: Try 3 times for Synced
        let bestResult = null;
        let finalType = 'none';
        
        for (let attempt = 1; attempt <= 3; attempt++) {
            updateJob(prev => ({ 
                attempts: attempt, 
                log: [...prev.log, `Attempt ${attempt} starting...`] 
            }));
            
            // Adjust query
            let searchTitle = nextJob.title;
            let searchArtist = nextJob.artist;
            
            if (attempt === 2) searchTitle = searchTitle.replace(/\(.*?\)/g, '').trim();
            if (attempt === 3) searchTitle = searchTitle.replace(/\[.*?\]/g, '').replace(/ft\..*/i, '').trim();

            const results = await MultiSourceLyricsService.fetchLyricsParallel(searchTitle, searchArtist, nextJob.duration);
            
            // Relaxed Regex: Match [00:00], (00:00), 00:00, 00.00
            const synced = results.find(l => /[[(]?\d{1,2}[:.]\d{1,2}[\])]?/.test(l.lyrics));
            
            if (synced) {
                bestResult = synced;
                finalType = 'synced';
                updateJob(prev => ({ log: [...prev.log, `✅ Found synced lyrics (Attempt ${attempt})`] }));
                break; 
            } else if (results.length > 0) {
                if (!bestResult) bestResult = results[0];
                updateJob(prev => ({ log: [...prev.log, `⚠️ Found plain lyrics (Attempt ${attempt})`] }));
            }
            
            if (attempt < 3 && !synced) {
                 updateJob(prev => ({ log: [...prev.log, `Retrying with refined query...`] }));
                 await new Promise(r => setTimeout(r, 1000)); // Reduced delay
            }
        }

        // Apply Result
        if (bestResult) {
             const type = /[[(]?\d{1,2}[:.]\d{1,2}[\])]?/.test(bestResult.lyrics) ? 'synced' : 'plain';
             
             try {
                 // Try 1: Save alongside audio file (Preferred)
                 let savedPath = null;
                 const songDir = nextJob.audioUri?.substring(0, nextJob.audioUri.lastIndexOf('/'));
                 
                 if (songDir && !nextJob.audioUri.startsWith('content:')) {
                    try {
                        const lyricsPath = `${songDir}/lyrics.lrc`;
                        await FileSystem.writeAsStringAsync(lyricsPath, bestResult.lyrics);
                        savedPath = lyricsPath;
                    } catch (e) {
                        console.warn("Could not write to song dir, trying cache...");
                    }
                 }
                 
                 // Try 2: Save to internal cache if Try 1 failed or invalid
                 if (!savedPath) {
                     const cacheDir = `${FileSystem.documentDirectory}lyrics/`;
                     await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
                     const lyricsPath = `${cacheDir}${nextJob.songId}.lrc`;
                     await FileSystem.writeAsStringAsync(lyricsPath, bestResult.lyrics);
                     savedPath = lyricsPath;
                 }
                 
                 // Update DB
                 // Use the standardized, permissive parser from utils
                 const parsedLyrics = parseTimestampedLyrics(bestResult.lyrics);
                 console.log(`[Queue] Parsed ${parsedLyrics?.length} lines for ${nextJob.title}`);
                 
                 if (parsedLyrics.length === 0) {
                     console.warn('[Queue] Parsed 0 lines! Lyrics content:', bestResult.lyrics.substring(0, 100));
                     // If parsing failed but we have text, fallback to saving as plain text lines
                     if (bestResult.lyrics.trim().length > 0) {
                        const fallbackLines = bestResult.lyrics.split('\n').map((line, idx) => ({
                            timestamp: 0,
                            text: line.trim(),
                            lineOrder: idx
                        })).filter(l => l.text.length > 0);
                        
                        if (fallbackLines.length > 0) {
                            console.log(`[Queue] Fallback: Used ${fallbackLines.length} plain text lines.`);
                            // Mutate parsedLyrics locally to use this fallback
                            parsedLyrics.push(...fallbackLines);
                        }
                     }
                 }
                 
                 // Fetch latest song data to ensure we don't overwrite other fields
                 // Use queries directly to avoid side effects of store.getSong()
                 const currentSong = await useSongsStore.getState().getSong(nextJob.songId);
                 
                 if (currentSong) {
                    console.log(`[Queue] Updating song ${nextJob.songId} in store...`);
                    await useSongsStore.getState().updateSong({
                        ...currentSong,
                        lyrics: parsedLyrics,
                        lyricSource: bestResult.source as any
                    });
                    console.log(`[Queue] Song updated successfully.`);
                    
                    updateJob(prev => ({ 
                        status: 'completed', 
                        resultType: type as any, 
                        log: [...prev.log, `Saved ${parsedLyrics.length} lines (${type})`] 
                    }));
                 } else {
                    console.error(`[Queue] Song ${nextJob.songId} not found in DB`);
                    updateJob(prev => ({ status: 'failed', log: [...prev.log, `Song not found in DB`] }));
                 }
             } catch (saveError: any) {
                 console.error("Save Error Detail:", saveError);
                 updateJob(prev => ({ status: 'failed', log: [...prev.log, `Save failed: ${saveError.message}`] }));
             }
        } else {
             updateJob(prev => ({ status: 'failed', log: [...prev.log, `No lyrics found after 3 attempts`] }));
        }
        
        // Remove from queue after delay to let user see status?
        // Or keep it marked as completed. 
        // Let's keep it in "completed" state so UI can show success checkmark.
        // Process next immediately
        // ⚡ Add delay to prevent DB locking if processing many songs rapidly
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) {
        console.error("Queue Processor Error", e);
    } finally {
        set({ processing: false });
    }
  }
}));
