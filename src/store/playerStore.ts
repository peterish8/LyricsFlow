import { create } from 'zustand';
import * as queries from '../database/queries';
import { Song } from '../types/song';

interface PlayerState {
  currentSongId: string | null;
  currentSong: Song | null;
  loadedAudioId: string | null; // Tracks what is actually loaded in the player
  
  loadSong: (songId: string) => Promise<void>;
  setLoadedAudioId: (songId: string | null) => void;
  updateCurrentSong: (updates: Partial<Song>) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentSongId: null,
  currentSong: null,
  loadedAudioId: null,
  
  loadSong: async (songId: string) => {
    // We need to import the query function. The prompt uses 'queries.getSongById'.
    // Assuming getSongById is exported from '../database/queries'
    const song = await queries.getSongById(songId);
    set({ currentSongId: songId, currentSong: song });
  },
  
  setLoadedAudioId: (id) => set({ loadedAudioId: id }),

  // ✅ Allow updating the current song (e.g. lyrics changed) without reloading audio
  updateCurrentSong: (updates: Partial<Song>) => set((state) => ({
    currentSong: state.currentSong ? { ...state.currentSong, ...updates } : null
  })),
}));
