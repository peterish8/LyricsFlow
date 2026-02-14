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
        
        // 1. Prepare Directory
        // Clean up if exists (atomic retry)
        const dirInfo = await FileSystem.getInfoAsync(songDir);
        if (dirInfo.exists) {
            await FileSystem.deleteAsync(songDir);
        }
        await FileSystem.makeDirectoryAsync(songDir, { intermediates: true });

        try {
            // 2. Resolve & Download Audio
            // Cobalt returns direct download URLs (tunnels or CDN links)
            let downloadUrl = staging.selectedQuality.url;
            const audioFormat = staging.selectedQuality.format || 'mp3';
            
            // Warn only if we somehow still have a raw YouTube URL
            if (downloadUrl.includes('youtube.com/watch') || downloadUrl.includes('youtu.be/')) {
                 console.error('[DownloadManager] ERROR: Raw YouTube URL detected — Cobalt was supposed to resolve this!');
                 throw new Error('Cannot download raw YouTube URL. Audio extraction failed.');
            }

            console.log(`[DownloadManager] Downloading Audio: ${downloadUrl.substring(0, 80)}...`);

            const audioFile = `${songDir}audio.${audioFormat}`;
            const audioDownload = FileSystem.createDownloadResumable(
                downloadUrl,
                audioFile,
                {},
                (downloadProgress) => {
                    const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                    onProgress(progress * 0.8); // Audio is 80% of the work
                }
            );
            await audioDownload.downloadAsync();


            // 3. Download Cover Art
            let coverLocalUri: string | undefined = undefined;
            if (staging.selectedCoverUri) {
                const coverFile = `${songDir}cover.jpg`;
                const coverDownload = FileSystem.createDownloadResumable(staging.selectedCoverUri, coverFile);
                await coverDownload.downloadAsync();
                coverLocalUri = coverFile;
            }


            // 4. Save Lyrics
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
                album: 'Downloaded',
                duration: staging.duration,
                coverImageUri: coverLocalUri,
                audioUri: audioFile,
                playCount: 0,
                dateCreated: new Date().toISOString(),
                dateModified: new Date().toISOString(),
                lyrics: staging.selectedLyrics ? lyricaService.parseLrc(staging.selectedLyrics, staging.duration) : [],
                gradientId: Math.floor(Math.random() * 5).toString() // Random gradient
            };

            // Call the store action directly here or return for caller to handle?
            // "Save the text lyrics and local file paths into the app's local... store."
            // We'll return the object so the hook can call the store hook (since we can't use hooks in a class easily)
            return newSong;

        } catch (error) {
            // Cleanup on failure
            await FileSystem.deleteAsync(songDir, { idempotent: true });
            throw error;
        }
    }
}

export const downloadManager = new DownloadManager();
