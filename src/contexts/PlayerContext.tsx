import React, { createContext, useContext, useEffect } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { usePlayerStore } from '../store/playerStore';
import { useSongsStore } from '../store/songsStore';

const PlayerContext = createContext<any>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const player = useAudioPlayer();
  const setControls = usePlayerStore(state => state.setControls);



  useEffect(() => {
    if (player) {
        setControls({
            play: () => player.play(),
            pause: () => player.pause(),
            seekTo: (pos: number) => player.seekTo(pos)
        });
    }
  }, [player, setControls]);

  // ... (Lock Screen Effect remains same) ...

  // Stop playback (Effect remains same)

  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (status) {
      const { currentTime, duration, playing, playbackState } = status;
      
      const store = usePlayerStore.getState();
      
      // Batch updates if possible, or only update if changed significantly
      // Position changes constantly, so we update it, but we should be careful
      // as it will trigger re-renders in components listening to 'position'.
      store.updateProgress(currentTime, duration);
      
      if (store.isPlaying !== playing) {
        store.setIsPlaying(playing);
      }

      if (playbackState === 'finished') {
        console.log('[PlayerContext] Song finished, playing next...');
        store.nextInPlaylist();
      }
    }
  }, [status]); // status contains currentTime, so this runs frequently. 
                // Now that PlayerProvider is NOT listening to the whole store, this won't loop.

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => useContext(PlayerContext);
