/**
 * LyricFlow - Player Provider
 * Manages persistent audio player instance across the app
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { useSongsStore } from '../store/songsStore';
import { usePlayerStore } from '../store/playerStore';
import { audioService } from '../services/audioService';

interface PlayerContextType {
  // Context can be extended if needed
}

const PlayerContext = createContext<PlayerContextType>({});

export const usePlayerContext = () => useContext(PlayerContext);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentSong } = useSongsStore();
  const { isPlaying, seek, setDuration, setIsPlaying } = usePlayerStore();
  const [sound, setSound] = useState<any>(null); // Keep track of sound instance
  const lastLoadedUriRef = React.useRef<string | null>(null);

  // Load audio when currentSong changes
  useEffect(() => {
    const loadAudio = async () => {
      const uri = currentSong?.audioUri;
      
      // OPTIMIZATION: Don't reload if it's the same URI
      if (!uri || uri === lastLoadedUriRef.current) return;
      
      try {
        console.log('[PLAYER PROVIDER] Loading audio:', uri);
        
        // Unload previous if exists
        if (sound) {
           await sound.unloadAsync();
        }

        // Pre-load the new audio
        // We use audioService as a singleton wrapper, but here we might need direct access 
        // if we want to control the instance lifecycle more closely.
        // For now, let's stick to the service but ensure it's not blocking.
        
        await audioService.loadAudio(uri);
        lastLoadedUriRef.current = uri;
        
        // Update duration in store once loaded
        const duration = await audioService.getDuration();
        if (duration > 0) {
            setDuration(duration);
        }

        audioService.setLockScreenActive({
          title: currentSong.title || 'Unknown',
          artist: currentSong.artist || 'LyricFlow',
        });
        
        console.log('[PLAYER PROVIDER] Audio loaded successfully');
        
        // Auto-play if supposed to be playing
        if (isPlaying) {
            await audioService.play();
        }
        
      } catch (error) {
        console.error('[PLAYER PROVIDER] Failed to load audio:', error);
        lastLoadedUriRef.current = null; // Reset on error so we can try again
      }
    };

    loadAudio();
    
    // Cleanup on unmount
    return () => {
        // Optional: Unload audio when provider unmounts (app close)
    };
  }, [currentSong?.id, currentSong?.audioUri]);

  // Sync Play/Pause state
  useEffect(() => {
      const syncPlayState = async () => {
        if (!currentSong?.audioUri) return;
        
        if (isPlaying) {
            await audioService.play();
        } else {
            await audioService.pause();
        }
      };
      syncPlayState();
  }, [isPlaying]);

  // Sync player position with store (polling)
  useEffect(() => {
    if (!currentSong?.audioUri) return;

    const interval = setInterval(async () => {
        // Don't sync if user is actively scrubbing
        // (We can check a ref or store state for isScrubbing)
        if (usePlayerStore.getState().isScrubbing) return;

        const time = await audioService.getPosition();
        if (time !== null && time !== undefined) {
             seek(time, true); // true = update state only, don't seek audio
        }
    }, 500); // Poll every 500ms (100ms was too aggressive for JS thread)
    
    return () => clearInterval(interval);
  }, [currentSong?.audioUri]);

  return (
    <PlayerContext.Provider value={{}}>
      {children}
    </PlayerContext.Provider>
  );
};

export default PlayerProvider;
