/**
 * DownloadManager.ts
 * 
 * Handles the physical downloading of assets and atomic database updates.
 * Ensures that a song is only added to the library if all files (audio, cover, lyrics) 
 * are successfully written to disk.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Song } from '../types/song';
import { StagingSong } from '../hooks/useSongStaging';
import { lyricaService } from '../services/LyricaService';
import { useSongsStore } from '../store/songsStore';

class DownloadManager {
    private activeDownloads: Map<string, FileSystem.DownloadResumable> = new Map();

    async pauseDownload(id: string) {
        const download = this.activeDownloads.get(id);
        if (download) {
            try {
                await download.pauseAsync();
                console.log(`[DownloadManager] Paused: ${id}`);
            } catch (e) {
                console.error(`[DownloadManager] Pause failed: ${id}`, e);
            }
        }
    }

    async resumeDownload(id: string) {
        const download = this.activeDownloads.get(id);
        if (download) {
            try {
                await download.resumeAsync();
                console.log(`[DownloadManager] Resumed: ${id}`);
            } catch (e) {
                console.error(`[DownloadManager] Resume failed: ${id}`, e);
            }
        }
    }

    /**
     * Finalize the download process
     * @param staging - The fully prepped staging object
     * @param onProgress - Callback for download progress
     */
    async finalizeDownload(
        staging: StagingSong, 
        onProgress: (progress: number) => void
    ): Promise<Song> {
        
        if (!staging.selectedQuality) throw new Error('No quality selected');

        const songDir = `${FileSystem.documentDirectory}music/${staging.id}/`;
        
        // Helper to update progress with small delay for UI rendering
        const updateProgress = async (progress: number) => {
            onProgress(progress);
            await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay for UI
        };
        
        // 1. Prepare Directory
        await updateProgress(0.05); // 5% - Starting
        // Clean up if exists (atomic retry)
        const dirInfo = await FileSystem.getInfoAsync(songDir);
        if (dirInfo.exists) {
            await FileSystem.deleteAsync(songDir);
        }
        await FileSystem.makeDirectoryAsync(songDir, { intermediates: true });

        try {
            // 2. Resolve & Download Audio
            await updateProgress(0.1); // 10% - Directory ready
            let downloadUrl = staging.selectedQuality.url;
            const format = staging.selectedQuality.format || 'mp3';
            const audioFile = `${songDir}audio.${format}`;
            
            console.log(`[DownloadManager] Downloading Audio: ${downloadUrl.substring(0, 80)}...`);

            const audioDownload = FileSystem.createDownloadResumable(
                downloadUrl,
                audioFile,
                {},
                async (downloadProgress) => {
                    const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                    await updateProgress(0.1 + (progress * 0.7)); // 10% to 80%
                }
            );

            this.activeDownloads.set(staging.id, audioDownload);
            
            try {
                await audioDownload.downloadAsync();
                await updateProgress(0.8); // 80% - Audio downloaded
            } finally {
                this.activeDownloads.delete(staging.id);
            }


            // 3. Download Cover Art
            await updateProgress(0.85); // 85% - Starting cover download
            let coverLocalUri: string | undefined = undefined;
            if (staging.selectedCoverUri) {
                const coverFile = `${songDir}cover.jpg`;
                const coverDownload = FileSystem.createDownloadResumable(staging.selectedCoverUri, coverFile);
                await coverDownload.downloadAsync();
                coverLocalUri = coverFile;
            }
            await updateProgress(0.9); // 90% - Cover downloaded


            // 4. Save Lyrics
            await updateProgress(0.95); // 95% - Saving lyrics
            if (staging.selectedLyrics) {
                const lyricsFile = `${songDir}lyrics.lrc`;
                await FileSystem.writeAsStringAsync(lyricsFile, staging.selectedLyrics);
            }

            // 5. Atomic Store Update
            // Construct the final Song object
            const newSong: Song = {
                id: staging.id,
                title: staging.title,
                artist: staging.artist,
                album: staging.album, 
                duration: staging.duration,
                coverImageUri: coverLocalUri,
                audioUri: audioFile,
                playCount: 0,
                dateCreated: new Date().toISOString(),
                dateModified: new Date().toISOString(),
                lyrics: staging.selectedLyrics ? lyricaService.parseLrc(staging.selectedLyrics, staging.duration) : [],
                gradientId: Math.floor(Math.random() * 5).toString() // Random gradient
            };

            await updateProgress(1.0); // 100% - Complete
            return newSong;

        } catch (error) {
            // Cleanup on failure
            await FileSystem.deleteAsync(songDir, { idempotent: true });
            throw error;
        }
    }
}

export const downloadManager = new DownloadManager();
