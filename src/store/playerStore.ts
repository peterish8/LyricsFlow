import { create } from 'zustand';
import * as queries from '../database/queries';
import { Song } from '../types/song';

interface PlayerState {
  currentSongId: string | null;
  currentSong: Song | null;
  loadedAudioId: string | null; // Tracks what is actually loaded in the player
  showTransliteration: boolean;
  hideMiniPlayer: boolean;
  // Controls exposed by PlayerContext
  play: () => void;
  pause: () => void;
  seekTo: (position: number) => void;
  setControls: (controls: { play: () => void; pause: () => void; seekTo: (pos: number) => void }) => void;
  
  loadSong: (songId: string) => Promise<void>;
  setInitialSong: (song: Song) => void;
  setLoadedAudioId: (songId: string | null) => void;
  updateCurrentSong: (updates: Partial<Song>) => void;
  toggleShowTransliteration: () => void;
  setMiniPlayerHidden: (hidden: boolean) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentSongId: null,
  currentSong: null,
  loadedAudioId: null,
  showTransliteration: false,
  hideMiniPlayer: false,
  
  // Default no-ops
  play: () => console.warn('Player not initialized'),
  pause: () => console.warn('Player not initialized'),
  seekTo: () => console.warn('Player not initialized'),
  
  setControls: (controls) => set({ 
      play: controls.play, 
      pause: controls.pause, 
      seekTo: controls.seekTo 
  }),
  
  loadSong: async (songId: string) => {
    // We need to import the query function. The prompt uses 'queries.getSongById'.
    // Assuming getSongById is exported from '../database/queries'
    const song = await queries.getSongById(songId);
    set({ currentSongId: songId, currentSong: song });
  },

  setInitialSong: (song: Song) => {
      set({ currentSongId: song.id, currentSong: song });
  },
  
  setLoadedAudioId: (id) => set({ loadedAudioId: id }),

  // ✅ Allow updating the current song (e.g. lyrics changed) without reloading audio
  updateCurrentSong: (updates: Partial<Song>) => set((state) => ({
    currentSong: state.currentSong ? { ...state.currentSong, ...updates } : null
  })),

  toggleShowTransliteration: () => set((state) => ({ showTransliteration: !state.showTransliteration })),
  
  setMiniPlayerHidden: (hidden: boolean) => set({ hideMiniPlayer: hidden }),

  reset: () => set({ currentSongId: null, currentSong: null, loadedAudioId: null }),
}));
