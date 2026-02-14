import React, { createContext, useContext, useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { usePlayerStore } from '../store/playerStore';
import { useSongsStore } from '../store/songsStore';

const PlayerContext = createContext<any>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const player = useAudioPlayer();
  const { currentSong } = usePlayerStore();
  const { songs, setCurrentSong } = useSongsStore();

  useEffect(() => {
    if (!player || !currentSong) return;

    // claim Lock Screen and set Metadata
    player.setActiveForLockScreen(true, {
      title: currentSong.title,
      artist: currentSong.artist || 'Unknown Artist',
      artworkUrl: currentSong.coverImageUri || undefined,
      albumTitle: 'LuvLyrics'
    });

    // Listen to remote commands
    // We use any or ts-ignore because the types might be missing these bleeding-edge events
    const playSub = (player as any).addListener('playCommand', () => player.play());
    const pauseSub = (player as any).addListener('pauseCommand', () => player.pause());
    
    // @ts-ignore
    const nextSub = (player as any).addListener('nextCommand', () => {
      console.log('[Hardware] Next Command received');
      const storeSongs = useSongsStore.getState().songs;
      if (storeSongs.length <= 1) return;
      
      const currentIndex = storeSongs.findIndex(s => s.id === currentSong.id);
      if (currentIndex === -1) return;
      
      const nextIndex = (currentIndex + 1) % storeSongs.length;
      const nextSong = storeSongs[nextIndex];
      
      usePlayerStore.getState().loadSong(nextSong.id);
    });

    // @ts-ignore
    const prevSub = (player as any).addListener('previousCommand', () => {
      console.log('[Hardware] Previous Command received');
      const storeSongs = useSongsStore.getState().songs;
      if (storeSongs.length <= 1) return;
      
      const currentIndex = storeSongs.findIndex(s => s.id === currentSong.id);
      if (currentIndex === -1) return;
      
      const prevIndex = (currentIndex - 1 + storeSongs.length) % storeSongs.length;
      const prevSong = storeSongs[prevIndex];
      
      usePlayerStore.getState().loadSong(prevSong.id);
    });

    return () => {
      player.setActiveForLockScreen(false);
      playSub.remove();
      pauseSub.remove();
      nextSub.remove();
      prevSub.remove();
    };
  }, [player, currentSong]);

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => useContext(PlayerContext);
