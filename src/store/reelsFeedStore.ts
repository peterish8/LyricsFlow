/**
 * Reels Feed Store
 * Manages the infinite feed queue, vault (liked reels), and current playback index
 */

import { create } from 'zustand';
import { UnifiedSong } from '../types/song';

interface ReelsFeedState {
  feedSongs: UnifiedSong[];
  currentIndex: number;
  vault: UnifiedSong[]; // Liked/saved songs for batch download
  isLoading: boolean;
  
  // Actions
  setFeedSongs: (songs: UnifiedSong[]) => void;
  appendFeedSongs: (songs: UnifiedSong[]) => void;
  setCurrentIndex: (index: number) => void;
  addToVault: (song: UnifiedSong) => void;
  removeFromVault: (id: string) => void;
  clearVault: () => void;
  setIsLoading: (loading: boolean) => void;
  isInVault: (id: string) => boolean;
}

export const useReelsFeedStore = create<ReelsFeedState>((set, get) => ({
  feedSongs: [],
  currentIndex: 0,
  vault: [],
  isLoading: false,

  setFeedSongs: (songs) => set({ feedSongs: songs }),
  
  appendFeedSongs: (songs) => set((state) => ({
    feedSongs: [...state.feedSongs, ...songs],
  })),
  
  setCurrentIndex: (index) => set({ currentIndex: index }),
  
  addToVault: (song) => set((state) => {
    // Prevent duplicates
    if (state.vault.find(s => s.id === song.id)) {
      return state;
    }
    return { vault: [...state.vault, song] };
  }),
  
  removeFromVault: (id) => set((state) => ({
    vault: state.vault.filter(s => s.id !== id),
  })),
  
  clearVault: () => set({ vault: [] }),
  
  setIsLoading: (loading) => set({ isLoading: loading }),
  
  isInVault: (id) => {
    const state = get();
    return state.vault.some(s => s.id === id);
  },
}));
