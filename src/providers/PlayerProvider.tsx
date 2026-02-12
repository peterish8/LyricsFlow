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
  const { isPlaying, seek, setDuration } = usePlayerStore();
  
  const player = useAudioPlayer(currentSong?.audioUri || null);
  
  useEffect(() => {
    audioService.setPlayer(player);
    audioService.loadAudio(currentSong?.audioUri || '');
  }, [player]);

  useEffect(() => {
    if (player.duration > 0) {
      setDuration(player.duration / 1000);
    }
  }, [player.duration]);

  useEffect(() => {
    if (isPlaying && !player.playing) {
      player.play();
    } else if (!isPlaying && player.playing) {
      player.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!currentSong?.audioUri) return;

    const interval = setInterval(() => {
      const time = player.currentTime;
      if (time !== null && time !== undefined && time >= 0) {
        seek(time / 1000, true);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [currentSong?.audioUri]);

  return (
    <PlayerContext.Provider value={{}}>
      {children}
    </PlayerContext.Provider>
  );
};

export default PlayerProvider;
