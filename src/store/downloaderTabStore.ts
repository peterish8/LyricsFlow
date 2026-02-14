import { create } from 'zustand';
import { UnifiedSong } from '../types/song';

interface SearchTab {
  id: string;
  query: string;
  results: UnifiedSong[];
  remixResults?: UnifiedSong[]; // Separate remix/cover results for artist search
  scrollPosition: number;
  isSearching: boolean;
  status: string;
  selectedSongs: string[]; // IDs of selected songs in this tab
}

interface DownloaderTabStore {
  tabs: SearchTab[];
  activeTabId: string;
  
  createTab: (query: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<SearchTab>) => void;
  
  // Selection Logic
  toggleSelection: (tabId: string, songId: string) => void;
  clearAllSelections: () => void;
  getSelectedSongs: () => { song: UnifiedSong, tabId: string }[];
}

export const useDownloaderTabStore = create<DownloaderTabStore>((set, get) => ({
  tabs: [{
    id: 'default',
    query: '',
    results: [],
    scrollPosition: 0,
    isSearching: false,
    status: '',
    selectedSongs: []
  }],
  activeTabId: 'default',

  createTab: (initialQuery: string) => {
    const newTab: SearchTab = {
      id: Date.now().toString(),
      query: initialQuery,
      results: [],
      scrollPosition: 0,
      isSearching: false,
      status: '',
      selectedSongs: []
    };
    set(state => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id
    }));
  },

  closeTab: (id: string) => {
    set(state => {
      const newTabs = state.tabs.filter(t => t.id !== id);
      // If we closed the active tab, switch to the last one
      const newActiveId = id === state.activeTabId 
        ? newTabs[newTabs.length - 1]?.id || '' 
        : state.activeTabId;
      
      if (newTabs.length === 0) {
          // Always keep one tab open
          return {
              tabs: [{
                id: 'default',
                query: '',
                results: [],
                scrollPosition: 0,
                isSearching: false,
                status: '',
                selectedSongs: []
              }],
              activeTabId: 'default'
          };
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveId
      };
    });
  },

  setActiveTab: (id: string) => set({ activeTabId: id }),

  updateTab: (id: string, updates: Partial<SearchTab>) => {
    set(state => ({
      tabs: state.tabs.map(tab => tab.id === id ? { ...tab, ...updates } : tab)
    }));
  },

  toggleSelection: (tabId: string, songId: string) => {
      set(state => ({
          tabs: state.tabs.map(tab => {
              if (tab.id !== tabId) return tab;
              const isSelected = tab.selectedSongs.includes(songId);
              return {
                  ...tab,
                  selectedSongs: isSelected 
                    ? tab.selectedSongs.filter(id => id !== songId)
                    : [...tab.selectedSongs, songId]
              };
          })
      }));
  },

  clearAllSelections: () => {
      set(state => ({
          tabs: state.tabs.map(tab => ({ ...tab, selectedSongs: [] }))
      }));
  },

  getSelectedSongs: () => {
      const state = get();
      const allSelected: { song: UnifiedSong, tabId: string }[] = [];
      
      state.tabs.forEach(tab => {
          tab.selectedSongs.forEach(songId => {
              const song = tab.results.find(s => s.id === songId);
              if (song) {
                  allSelected.push({ song, tabId: tab.id });
              }
          });
      });
      return allSelected;
  }
}));
