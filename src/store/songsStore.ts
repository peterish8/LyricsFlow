/**
 * LyricFlow - Songs Store (Zustand)
 * Manages the song library state and CRUD operations
 */

import { create } from 'zustand';
import { Song, SortOption } from '../types/song';
import * as queries from '../database/queries';
import { useDailyStatsStore } from './dailyStatsStore';

interface SongsState {
  // State
  songs: Song[];
  hiddenSongs: Song[];
  currentSong: Song | null;
  isLoading: boolean;
  error: string | null;
  sortBy: SortOption;
  
  // Actions
  fetchSongs: () => Promise<void>;
  fetchHiddenSongs: () => Promise<void>;
  getSong: (id: string) => Promise<Song | null>;
  addSong: (song: Song) => Promise<void>;
  updateSong: (song: Song) => Promise<void>;
  deleteSong: (id: string) => Promise<void>;
  hideSong: (id: string, hide: boolean) => Promise<void>;
  setCurrentSong: (song: Song | null) => void;
  setSortBy: (sort: SortOption) => void;
  searchSongs: (query: string) => Promise<Song[]>;
  toggleLike: (songId: string) => Promise<void>;
  clearError: () => void;
}

export const useSongsStore = create<SongsState>((set, get) => ({
  // Initial state
  songs: [],
  hiddenSongs: [],
  currentSong: null,
  isLoading: false,
  error: null,
  sortBy: 'recent',
  
  // Fetch all songs
  fetchSongs: async () => {
    set({ isLoading: true, error: null });
    try {
      const songs = await queries.getAllSongs();
      console.log('[STORE] Fetched songs:', songs.length);
      set({ songs, isLoading: false });
    } catch (error) {
      console.error('[STORE] Fetch error:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch songs', 
        isLoading: false 
      });
    }
  },

  // Fetch hidden songs
  fetchHiddenSongs: async () => {
    set({ isLoading: true, error: null });
    try {
      const hiddenSongs = await queries.getHiddenSongs();
      console.log('[STORE] Fetched hidden songs:', hiddenSongs.length);
      set({ hiddenSongs, isLoading: false });
    } catch (error) {
      console.error('[STORE] Fetch hidden error:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch hidden songs', 
        isLoading: false 
      });
    }
  },
  
  // Get single song with lyrics
  getSong: async (id: string) => {
    try {
      const song = await queries.getSongById(id);
      if (song) {
        set({ currentSong: song });
      }
      return song;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to get song' });
      return null;
    }
  },
  
  // Add new song
  addSong: async (song: Song) => {
    set({ isLoading: true, error: null });
    try {
      console.log('[STORE] Adding song:', song.title);
      await queries.insertSong(song);
      await get().fetchSongs();
      set({ isLoading: false });
    } catch (error) {
      console.error('[STORE] Add error:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to add song', 
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Update existing song
  updateSong: async (song: Song) => {
    set({ isLoading: true, error: null });
    try {
      await queries.updateSong(song);
      await get().fetchSongs();
      if (get().currentSong?.id === song.id) {
        set({ currentSong: song, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update song', 
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Delete song
  deleteSong: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await queries.deleteSong(id);
      
      // Clear current song if it was deleted
      if (get().currentSong?.id === id) {
        set({ currentSong: null });
      }

      // ✅ Sync with playerStore: Clear the active song if it was deleted
      const { usePlayerStore } = await import('./playerStore');
      const playerState = usePlayerStore.getState();
      if (playerState.currentSong?.id === id) {
          playerState.reset();
      }

      await get().fetchSongs();
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete song', 
        isLoading: false 
      });
      throw error;
    }
  },

  // Hide/Unhide song
  hideSong: async (id: string, hide: boolean) => {
    set({ isLoading: true, error: null });
    try {
      await queries.hideSong(id, hide);
      
      // Clear from player if hidden
      if (hide) {
        const { usePlayerStore } = await import('./playerStore');
        const playerState = usePlayerStore.getState();
        if (playerState.currentSong?.id === id) {
          playerState.reset();
        }
      }

      await get().fetchSongs();
      await get().fetchHiddenSongs();
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to hide song', 
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Set current song for Now Playing
  setCurrentSong: (song: Song | null) => {
    set({ currentSong: song });
    // Update play stats if song is selected
    if (song) {
      queries.updatePlayStats(song.id).catch(console.error);
      useDailyStatsStore.getState().incrementDailyPlay(song.id);
    }
  },
  
  // Set sort option
  setSortBy: (sortBy: SortOption) => {
    set({ sortBy });
  },
  
  // Search songs
  searchSongs: async (query: string) => {
    if (!query.trim()) {
      return get().songs;
    }
    try {
      return await queries.searchSongs(query);
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  },

  // Toggle like status
  toggleLike: async (songId: string) => {
    try {
      const song = await queries.getSongById(songId);
      if (song) {
        const updatedSong = { ...song, isLiked: !song.isLiked };
        await queries.updateSong(updatedSong);
        
        // Update local state for immediate feedback
        set((state) => ({
          songs: state.songs.map(s => s.id === songId ? updatedSong : s),
          currentSong: state.currentSong?.id === songId ? updatedSong : state.currentSong
        }));

        // ✅ IMPORTANT: Sync with playerStore so NowPlayingScreen (which uses playerStore) updates immediately
        const { usePlayerStore } = await import('./playerStore');
        const playerState = usePlayerStore.getState();
        if (playerState.currentSong?.id === songId) {
          playerState.updateCurrentSong({ isLiked: updatedSong.isLiked });
        }
        
        console.log(`[STORE] Toggled like for ${song.title}: ${updatedSong.isLiked}`);
      }
    } catch (error) {
      console.error('[STORE] Toggle like error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to toggle like' });
    }
  },
  
  // Clear error
  clearError: () => set({ error: null }),
}));
