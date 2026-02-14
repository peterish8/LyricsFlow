import React, { createContext, useContext, useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { usePlayerStore } from '../store/playerStore';
import { useSongsStore } from '../store/songsStore';

const PlayerContext = createContext<any>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const player = useAudioPlayer();
  const { currentSong, setControls } = usePlayerStore();
  const { songs, setCurrentSong } = useSongsStore();

  useEffect(() => {
    if (player) {
        setControls({
            play: () => player.play(),
            pause: () => player.pause(),
            seekTo: (pos: number) => player.seekTo(pos)
        });
    }
  }, [player, setControls]);

  useEffect(() => {
    if (!player || !currentSong) return;

    // claim Lock Screen and set Metadata
    try {
        player.setActiveForLockScreen(true, {
            title: currentSong.title,
            artist: currentSong.artist || 'Unknown Artist',
            artworkUrl: currentSong.coverImageUri || undefined,
            albumTitle: 'LuvLyrics',
        }, {
            showSeekForward: true,
            showSeekBackward: true
        });
    } catch (e) {
        console.warn('[PlayerContext] Failed to set lock screen active:', e);
    }

    return () => {
      try {
          // Extra safety check: ensure player is still valid and not just an ID/Integer
          if (player && typeof (player as any).setActiveForLockScreen === 'function') {
              player.setActiveForLockScreen(false);
          }
      } catch (e) {
          console.log('[PlayerContext] Failed to cleanup lock screen:', e);
      }
    };
  }, [player, currentSong]);

  // Stop playback if currentSong is cleared (e.g. deleted)
  useEffect(() => {
    if (!currentSong && player) {
        if (player.playing) {
            player.pause();
        }
        // Purge the audio buffer and truly turn "off" the audio by loading an empty string
        player.replace('');
        console.log('[PlayerContext] Audio aggressively terminated as current song was removed.');
    }
  }, [currentSong, player]);

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => useContext(PlayerContext);
