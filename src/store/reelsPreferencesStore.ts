/**
 * Reels Preferences Store
 * Tracks user behavior: likes, skips, watch time, genre/artist preferences
 * Persisted to AsyncStorage for cross-session learning
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = '@reels_preferences';
const MAX_HISTORY = 100;
const MAX_SEEN = 200;

export interface ReelInteraction {
  songId: string;
  title: string;
  artist: string;
  timestamp: number;
  watchDuration: number; // seconds watched
  totalDuration: number; // total song length
  liked: boolean;
  skipped: boolean; // < 3 seconds = skip
}

interface ArtistScore {
  artist: string;
  score: number;
  interactions: number;
}

export type ReelsLanguage = 'English' | 'Hindi' | 'Tamil' | 'Telugu' | 'Punjabi' | 'Korean' | 'Kannada' | 'Malayalam' | 'Bengali' | 'Marathi';

interface ReelsPreferencesState {
  // Tracking data
  interactions: ReelInteraction[];
  seenSongIds: string[];      // Songs already shown in feed
  skippedArtists: string[];   // Artists user skips often
  preferredLanguages: ReelsLanguage[]; // User's preferred music languages
  
  // Derived preferences
  topArtists: ArtistScore[];
  
  // Actions
  recordInteraction: (interaction: ReelInteraction) => void;
  markSeen: (songId: string) => void;
  isSeen: (songId: string) => boolean;
  analyzePreferences: () => void;
  getTopArtistNames: (limit?: number) => string[];
  getSkippedArtistNames: () => string[];
  setPreferredLanguages: (languages: ReelsLanguage[]) => void;
  getPreferredLanguages: () => ReelsLanguage[];
  clearPreferences: () => void;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

export const useReelsPreferencesStore = create<ReelsPreferencesState>((set, get) => ({
  interactions: [],
  seenSongIds: [],
  skippedArtists: [],
  topArtists: [],
  preferredLanguages: ['English', 'Hindi'], // Default languages

  recordInteraction: (interaction: ReelInteraction) => {
    set((state) => {
      // Add to history, cap at MAX_HISTORY
      const newInteractions = [...state.interactions, interaction].slice(-MAX_HISTORY);
      
      return { interactions: newInteractions };
    });

    // Re-analyze after recording
    get().analyzePreferences();
    
    // Persist
    get().saveToStorage();
  },

  markSeen: (songId: string) => {
    set((state) => {
      if (state.seenSongIds.includes(songId)) return state;
      const newSeen = [...state.seenSongIds, songId].slice(-MAX_SEEN);
      return { seenSongIds: newSeen };
    });
  },

  isSeen: (songId: string) => {
    return get().seenSongIds.includes(songId);
  },

  analyzePreferences: () => {
    const { interactions } = get();
    if (interactions.length === 0) return;

    // --- Artist Score Analysis ---
    const artistMap = new Map<string, { totalScore: number; count: number; skips: number }>();

    interactions.forEach((interaction, index) => {
      const artist = interaction.artist?.toLowerCase()?.trim();
      if (!artist || artist === 'unknown artist') return;

      // Recency weight: newer interactions score higher
      const recencyWeight = 1 + (index / interactions.length);
      
      let score = 0;
      if (interaction.liked) {
        score += 50 * recencyWeight; // Big boost for likes
      }
      if (interaction.skipped) {
        score -= 30 * recencyWeight; // Penalty for skips
      } else {
        // Engagement score based on watch duration
        const engagement = interaction.totalDuration > 0
          ? (interaction.watchDuration / interaction.totalDuration) * 100
          : 0;
        score += (engagement / 100) * 30 * recencyWeight;
      }

      const existing = artistMap.get(artist) || { totalScore: 0, count: 0, skips: 0 };
      existing.totalScore += score;
      existing.count += 1;
      if (interaction.skipped) existing.skips += 1;
      artistMap.set(artist, existing);
    });

    // Build top artists
    const topArtists: ArtistScore[] = [];
    const skippedArtists: string[] = [];

    artistMap.forEach((data, artist) => {
      const avgScore = data.totalScore / data.count;
      topArtists.push({
        artist,
        score: avgScore,
        interactions: data.count,
      });

      // If >60% of interactions are skips, add to skip list
      if (data.count >= 2 && (data.skips / data.count) > 0.6) {
        skippedArtists.push(artist);
      }
    });

    // Sort by score descending
    topArtists.sort((a, b) => b.score - a.score);

    set({ topArtists: topArtists.slice(0, 20), skippedArtists });
  },

  getTopArtistNames: (limit = 5) => {
    const { topArtists } = get();
    return topArtists
      .filter(a => a.score > 0)
      .slice(0, limit)
      .map(a => a.artist);
  },

  getSkippedArtistNames: () => {
    return get().skippedArtists;
  },

  setPreferredLanguages: (languages: ReelsLanguage[]) => {
    set({ preferredLanguages: languages });
    get().saveToStorage();
  },

  getPreferredLanguages: () => {
    return get().preferredLanguages;
  },

  clearPreferences: () => {
    set({
      interactions: [],
      seenSongIds: [],
      skippedArtists: [],
      topArtists: [],
      preferredLanguages: ['English', 'Hindi'],
    });
    AsyncStorage.removeItem(PREFS_KEY).catch(console.error);
  },

  loadFromStorage: async () => {
    try {
      const data = await AsyncStorage.getItem(PREFS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        set({
          interactions: parsed.interactions || [],
          seenSongIds: parsed.seenSongIds || [],
          skippedArtists: parsed.skippedArtists || [],
          topArtists: parsed.topArtists || [],
          preferredLanguages: parsed.preferredLanguages || ['English', 'Hindi'],
        });
        console.log('[ReelsPrefs] Loaded preferences from storage');
      }
    } catch (error) {
      console.error('[ReelsPrefs] Failed to load preferences:', error);
    }
  },

  saveToStorage: async () => {
    try {
      const { interactions, seenSongIds, skippedArtists, topArtists, preferredLanguages } = get();
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify({
        interactions,
        seenSongIds,
        skippedArtists,
        topArtists,
        preferredLanguages,
      }));
    } catch (error) {
      console.error('[ReelsPrefs] Failed to save preferences:', error);
    }
  },
}));
