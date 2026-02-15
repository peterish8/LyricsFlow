import React, { useEffect, useRef } from 'react';
import { useDownloadQueueStore } from '../store/downloadQueueStore';
import { downloadManager } from '../services/DownloadManager';
import { useSongsStore } from '../store/songsStore';
import { MultiSourceLyricsService } from '../services/MultiSourceLyricsService';
import { lyricaService } from '../services/LyricaService';
import * as FileSystem from 'expo-file-system/legacy';
import { usePlaylistStore } from '../store/playlistStore';
import { useKeepAwake } from 'expo-keep-awake';

// Wrapper component to conditionally use the hook
const KeepAwakeController = () => {
  useKeepAwake();
  return null;
};

export const BackgroundDownloader = () => {
    const { queue, updateItem } = useDownloadQueueStore();
    const { addSong, fetchSongs } = useSongsStore();
    const activeDownloads = useRef<Set<string>>(new Set());
    const MAX_CONCURRENT = 1; // Only 1 download at a time
    
    // Prevent screen from sleeping while downloading
    const hasActiveDownloads = queue.some(item => item.status === 'downloading' || item.status === 'pending');
    
    // Use the wrapper component to activate keep-awake only when needed
    // This avoids hook rule violations and import errors for non-existent static methods


    useEffect(() => {
        let isActive = true;

        // Cleanup: Remove IDs from activeDownloads that are no longer in the queue
        // This handles the case where a user removes a currently downloading song
        const queueIds = new Set(queue.map(q => q.id));
        for (const activeId of activeDownloads.current) {
            if (!queueIds.has(activeId)) {
                console.log(`[BackgroundDownloader] Detected removal of active item: ${activeId}`);
                // Stop the download to save bandwidth
                downloadManager.pauseDownload(activeId); 
                activeDownloads.current.delete(activeId);
            }
        }

        const processItem = async (item: any) => {
            // Check limits BEFORE adding to active set
            if (activeDownloads.current.has(item.id)) {
                console.log(`[BackgroundDownloader] ${item.id} already downloading`);
                return;
            }
            if (activeDownloads.current.size >= MAX_CONCURRENT) {
                console.log(`[BackgroundDownloader] Max concurrent (${MAX_CONCURRENT}) reached, waiting...`);
                return;
            }

            // Validate song has required fields
            if (!item.song.streamUrl) {
                console.error(`[BackgroundDownloader] ❌ No streamUrl for ${item.song.title}`);
                updateItem(item.id, { 
                    status: 'failed', 
                    error: 'No download URL available', 
                    stageStatus: 'Failed - No URL' 
                });
                return;
            }

            // Add to active set IMMEDIATELY (synchronously)
            activeDownloads.current.add(item.id);
            console.log(`[BackgroundDownloader] Starting download ${activeDownloads.current.size}/${MAX_CONCURRENT}: ${item.song.title}`);
            console.log(`[BackgroundDownloader] URL: ${item.song.streamUrl.substring(0, 80)}...`);

            try {
                // Log song object to debug cover art
                console.log(`[BackgroundDownloader] Song cover art URL:`, item.song.highResArt || item.song.thumbnail || 'NONE');
                
                // 1. Transform UnifiedSong to StagingSong format
                const stagingPayload: any = {
                    id: item.song.id,
                    title: item.song.title,
                    artist: item.song.artist,
                    album: item.song.album || '',
                    duration: item.song.duration || 0,
                    selectedQuality: {
                        url: item.song.streamUrl,
                        quality: '320kbps',
                        format: 'mp3'
                    },
                    // Try highResArt -> thumbnail -> empty
                    selectedCoverUri: item.song.highResArt || item.song.thumbnail || '',
                    selectedLyrics: '', // Fetch lyrics AFTER download (Phase 2)
                    status: 'downloading',
                    progress: 0
                };

                // 2. Start Download (Phase 1: Audio & Cover - 0% to 80%)
                updateItem(item.id, { status: 'downloading', stageStatus: 'Downloading Audio...', progress: 0 });
                
                const newSong = await downloadManager.finalizeDownload(stagingPayload, (progress) => {
                    // Map 0-100% download progress to 0-80% total progress
                    const scaledProgress = progress * 0.8;
                    if (isActive) {
                        updateItem(item.id, { progress: scaledProgress });
                    }
                });

                console.log(`[BackgroundDownloader] Audio download completed. Phase 2: Searching Lyrics...`);

                // 3. Fetch Lyrics (Phase 2: Lyrics - 80% to 100%)
                if (isActive) {
                    updateItem(item.id, { progress: 0.85, stageStatus: 'Searching lyrics...' });
                    
                    try {
                        const results = await MultiSourceLyricsService.fetchLyricsParallel(
                            item.song.title,
                            item.song.artist,
                            item.song.duration
                        );
                        
                        // Select best lyrics (Synced > Plain) using regex check
                        const isSynced = (text: string) => /\[\d{2}:\d{2}\.\d{2,3}\]/.test(text);
                        const bestLyrics = results.find(l => isSynced(l.lyrics)) || results[0];
                        
                        if (bestLyrics && bestLyrics.lyrics) {
                            const type = isSynced(bestLyrics.lyrics) ? 'Synced' : 'Plain';
                            console.log(`[BackgroundDownloader] ✅ Found lyrics (${type})`);
                            updateItem(item.id, { progress: 0.95, stageStatus: 'Saving lyrics...' });
                            
                            // Write to file
                            const songDir = newSong.audioUri?.substring(0, newSong.audioUri.lastIndexOf('/'));
                            if (songDir) {
                               const lyricsPath = `${songDir}/lyrics.lrc`;
                               await FileSystem.writeAsStringAsync(lyricsPath, bestLyrics.lyrics);
                               console.log(`[BackgroundDownloader] Wrote lyrics to: ${lyricsPath}`);
                               
                               // Update song object
                               newSong.lyrics = lyricaService.parseLrc(bestLyrics.lyrics, newSong.duration);
                               newSong.lyricSource = bestLyrics.source as any; 
                            }
                        } else {
                            console.log(`[BackgroundDownloader] ❌ No lyrics found`);
                            updateItem(item.id, { stageStatus: 'No lyrics found' });
                        }
                    } catch (e) {
                         console.warn(`[BackgroundDownloader] Lyrics fetch failed:`, e);
                         // Continue saving song even if lyrics fail
                    }
                }

                // 4. Complete
                console.log(`[BackgroundDownloader] ✅ Completed: ${item.song.title}`);
                
                // CRITICAL: Remove from active downloads BEFORE updating state
                // This ensures that when the effect re-runs due to status change, 
                // it sees that we have a free slot!
                activeDownloads.current.delete(item.id);
                console.log(`[BackgroundDownloader] Removed from active set. Active: ${activeDownloads.current.size}`);

                // CRITICAL: Double check if item is still in queue (it might have been removed during download)
                // We use the Ref of active downloads or check the store directly. 
                // Since we removed it from activeDownloads above, we should check if it was cancelled
                // But wait, we removed it from activeDownloads ourself!
                // So we need to check if the store still has it?
                // Actually, if the user invoked 'remove', the store updates 'queue' state.
                const currentQueue = useDownloadQueueStore.getState().queue;
                const isStillInQueue = currentQueue.some(q => q.id === item.id);
                
                if (!isStillInQueue) {
                    console.log(`[BackgroundDownloader] Item ${item.id} was removed from queue. Aborting save.`);
                    return;
                }

                console.log(`[BackgroundDownloader] Calling updateItem with status=completed...`);
                updateItem(item.id, { status: 'completed', progress: 1, stageStatus: 'Done' });
                
                console.log(`[BackgroundDownloader] Calling addSong...`);
                await addSong(newSong);
                console.log(`[BackgroundDownloader] addSong completed, calling fetchSongs...`);
                await fetchSongs();
                console.log(`[BackgroundDownloader] fetchSongs completed`);

                // 5. Add to Playlist if requested
                if (item.targetPlaylistId) {
                    try {
                        console.log(`[BackgroundDownloader] Adding to playlist: ${item.targetPlaylistId}`);
                        await usePlaylistStore.getState().addSongToPlaylist(item.targetPlaylistId, newSong.id);
                        console.log(`[BackgroundDownloader] Added to playlist successfully`);
                    } catch (e) {
                         console.error(`[BackgroundDownloader] Failed to add to playlist:`, e);
                    }
                }

            } catch (error: any) {
                console.error(`[BackgroundDownloader] ❌ Error for ${item.song.title}:`, error);
                console.error(`[BackgroundDownloader] Error stack:`, error.stack);
                
                // Also remove from active set on error before updating status
                activeDownloads.current.delete(item.id);
                
                updateItem(item.id, { status: 'failed', error: error.message, stageStatus: 'Failed' });
            } finally {
                // Double check cleanup just in case
                if (activeDownloads.current.has(item.id)) {
                    activeDownloads.current.delete(item.id);
                }
                console.log(`[BackgroundDownloader] Finished ${item.song.title} block`);
                // The effect will re-run due to queue changes (status update) and pick up next items
            }
        };

        // Find all pending items
        const pendingItems = queue.filter(item => item.status === 'pending');
        
        console.log(`[BackgroundDownloader] Pending: ${pendingItems.length}, Active: ${activeDownloads.current.size}/${MAX_CONCURRENT}`);
        
        // Start downloads up to the limit (don't await - let them run in parallel)
        for (const item of pendingItems) {
            if (activeDownloads.current.size < MAX_CONCURRENT && !activeDownloads.current.has(item.id)) {
                processItem(item); // Fire and forget - runs in background
            }
        }

        return () => {
            isActive = false;
        };
    }, [queue]);

    return (
        <>
            {hasActiveDownloads && <KeepAwakeController />}
        </>
    );
};
