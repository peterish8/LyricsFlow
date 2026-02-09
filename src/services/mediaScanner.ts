/**
 * LyricFlow - Media Library Scanner
 * Scans and imports local audio files
 */

import * as MediaLibrary from 'expo-media-library';
import TrackPlayer from 'react-native-track-player';
import { generateId } from '../utils/formatters';
import { DEFAULT_GRADIENT_ID } from '../constants/gradients';
import { Song } from '../types/song';

export interface AudioFile {
  id: string;
  filename: string;
  uri: string;
  duration: number;
  albumId?: string;
  album?: string;
  artist?: string;
  albumArt?: string;
}

export const requestMediaLibraryPermissions = async (): Promise<boolean> => {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === 'granted';
};

export const scanAudioFiles = async (): Promise<AudioFile[]> => {
  try {
    const hasPermission = await requestMediaLibraryPermissions();
    if (!hasPermission) {
      throw new Error('Media library permission denied');
    }

    const media = await MediaLibrary.getAssetsAsync({
      mediaType: 'audio',
      first: 1000,
    });

    const audioFiles: AudioFile[] = [];
    
    // Initialize TrackPlayer
    try {
      await TrackPlayer.setupPlayer();
    } catch (e) {
      console.log('TrackPlayer already setup');
    }
    
    for (const asset of media.assets) {
      let albumArt: string | undefined;
      let artist: string | undefined;
      
      // Try to get metadata from audio file
      try {
        await TrackPlayer.add({
          id: asset.id,
          url: asset.uri,
          title: asset.filename,
        });
        
        const track = await TrackPlayer.getTrack(asset.id);
        if (track) {
          albumArt = track.artwork as string | undefined;
          artist = track.artist;
        }
        
        await TrackPlayer.remove(asset.id);
      } catch (e) {
        console.log('Could not extract metadata for:', asset.filename);
      }
      
      audioFiles.push({
        id: asset.id,
        filename: asset.filename,
        uri: asset.uri,
        duration: asset.duration,
        albumId: asset.albumId,
        album: asset.album,
        artist,
        albumArt,
      });
    }

    console.log('Total audio files:', audioFiles.length, 'With art:', audioFiles.filter(f => f.albumArt).length);
    return audioFiles;
  } catch (error) {
    console.error('Failed to scan audio files:', error);
    throw error;
  }
};

export const convertAudioFileToSong = (audioFile: AudioFile): Song => {
  const now = new Date().toISOString();
  const title = audioFile.filename.replace(/\.[^/.]+$/, ''); // Remove extension

  return {
    id: generateId(),
    title,
    artist: audioFile.artist || audioFile.album || 'Unknown Artist',
    album: audioFile.album,
    gradientId: DEFAULT_GRADIENT_ID,
    duration: Math.floor(audioFile.duration),
    dateCreated: now,
    dateModified: now,
    playCount: 0,
    lyrics: [],
    audioUri: audioFile.uri,
    coverImageUri: audioFile.albumArt,
  };
};
