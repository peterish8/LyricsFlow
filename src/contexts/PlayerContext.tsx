import React, { createContext, useContext } from 'react';
import { useAudioPlayer } from 'expo-audio';

const PlayerContext = createContext<any>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const player = useAudioPlayer();
  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => useContext(PlayerContext);
