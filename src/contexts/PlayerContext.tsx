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
            seekTo: (pos: number) => player.seekTo(Math.floor(pos * 1000))
        });
    }
  }, [player, setControls]);

  // ... (Lock Screen Effect remains same) ...

  // Stop playback (Effect remains same)

  // Auto-Play Logic: Native Event Listener (Optimized)
  useEffect(() => {
    if (!player) return;

    // cleanup old listeners just in case
    const subscription = player.addListener('playbackStatusUpdate', (status: any) => {
      if (status.didJustFinish) {
        console.log('[PlayerContext] Song finished (event), playing next...');
        usePlayerStore.getState().nextInPlaylist();
      }
      
      // Update Progress (High Frequency)
      if (status.positionMillis !== undefined) {
          // ... rest of logic
         const position = status.positionMillis / 1000;
         const duration = status.durationMillis ? status.durationMillis / 1000 : 0;
         
         // Batch updates if possible, or just call separate
         const store = usePlayerStore.getState();
         // Console log only every ~1 second to avoid spam (using Math.floor)
         if (Math.floor(position) % 5 === 0 && Math.floor(position) !== 0) {
             // console.log(`[PlayerContext] Progress: ${position.toFixed(1)} / ${duration.toFixed(1)}`);
         }
         store.updateProgress(position, duration);
         
         if (store.isPlaying !== status.isPlaying) {
             store.setIsPlaying(status.isPlaying);
         }
      }
    });

    return () => {
      subscription?.remove();
    };
  }, [player]);

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => useContext(PlayerContext);
