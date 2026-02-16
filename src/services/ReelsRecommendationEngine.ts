/**
 * Reels Recommendation Engine
 * Uses ONLY Saavn + Gaana APIs
 * Seeds from user's existing song library for instant personalization
 * Generates personalized search queries based on user's artists & genres
 */

import { UnifiedSong } from '../types/song';
import { useReelsPreferencesStore } from '../store/reelsPreferencesStore';
import { useSongsStore } from '../store/songsStore';
import { MultiSourceSearchService } from './MultiSourceSearchService';

// Trending/discovery queries - Removed as we now generate on the fly

class ReelsRecommendationEngine {
  private seededFromLibrary = false;

  /**
   * Seed preferences from user's existing song library
   * This is the KEY to instant personalization!
   */
  seedFromLibrary() {
    if (this.seededFromLibrary) return;

    const songsStore = useSongsStore.getState();
    const prefsStore = useReelsPreferencesStore.getState();
    const songs = songsStore.songs;

    if (songs.length === 0) {
      console.log('[RecoEngine] No songs in library, skipping seed');
      this.seededFromLibrary = true;
      return;
    }

    // Check if we need to re-seed: library has more songs than seeded interactions
    // This handles the case where old vault data was seeded but library wasn't
    const librarySongCount = songs.filter(s => s.artist && s.artist !== 'Unknown Artist').length;
    const existingCount = prefsStore.interactions.length;
    
    if (existingCount > 0 && existingCount >= librarySongCount) {
      this.seededFromLibrary = true;
      console.log(`[RecoEngine] Already seeded (${existingCount} interactions for ${librarySongCount} library songs)`);
      return;
    }

    // Clear old stale data and re-seed from full library
    if (existingCount > 0) {
      console.log(`[RecoEngine] 🔄 Re-seeding: had ${existingCount} old interactions, library has ${librarySongCount} songs`);
      prefsStore.clearPreferences();
    }

    console.log(`[RecoEngine] 🌱 Seeding from ${songs.length} library songs...`);

    // Record each song as a "liked" interaction to build artist preferences
    songs.forEach(song => {
      if (song.artist && song.artist !== 'Unknown Artist') {
        prefsStore.recordInteraction({
          songId: song.id,
          title: song.title,
          artist: song.artist,
          timestamp: Date.now(),
          watchDuration: 30,
          totalDuration: song.duration || 180,
          liked: true, // User downloaded = they liked it
          skipped: false,
        });
      }
    });

    this.seededFromLibrary = true;
    console.log('[RecoEngine] ✅ Seeded preferences from library!');

    // Log top artists
    const topArtists = prefsStore.getTopArtistNames(10);
    console.log('[RecoEngine] Top artists from library:', topArtists);
  }

  /**
   * Generate personalized search queries based on "Artist Cluster" strategy
   * User Request: "Pick any 6 artists and each artist 5 songs"
   */
  generateQueries(targetArtistCount: number = 6): { query: string; language: string }[] {
    // Seed from library first!
    this.seedFromLibrary();

    const songsStore = useSongsStore.getState();
    const prefsStore = useReelsPreferencesStore.getState();
    const topArtists = prefsStore.getTopArtistNames(20);
    
    // 1. Get ALL unique artists from library (The "Home" pool)
    const libraryArtists = Array.from(new Set(
        songsStore.songs
            .map(s => s.artist)
            .filter(a => a && a !== 'Unknown Artist' && !a.includes('Unknown'))
            .map(a => a!.trim())
    ));

    // 2. Pool: Mix of Top Artists (favs) + Random Library Artists (rediscovery)
    // We want a mix, but heavily weighted towards library capability
    const candidatePool = Array.from(new Set([...topArtists, ...libraryArtists]));

    if (candidatePool.length === 0) {
        // Fallback to trending if no library data
        const weights = prefsStore.getLanguageWeights(); // Use new method
        // Filter only active languages or default to all if none active?
        const activeDefaults = weights.filter(w => w.weight > 0).map(w => w.language);
        const languagesPool = activeDefaults.length > 0 ? activeDefaults : (['English', 'Hindi'] as any[]);

        const fallbackQueries: { query: string; language: string }[] = [];
        for(let i=0; i<targetArtistCount; i++) {
            const lang = languagesPool[Math.floor(Math.random() * languagesPool.length)];
            fallbackQueries.push({ 
                query: `${lang} trending songs`,
                language: lang
            });
        }
        return fallbackQueries;
    }

    // 3. Shuffle and pick 6 unique artists
    // const shuffled = candidatePool.sort(() => Math.random() - 0.5);
    // const selectedArtists = shuffled.slice(0, targetArtistCount);

    // 4. Create Weighted Queries based on Language Preferences
    const weights = prefsStore.getLanguageWeights();
    const activeLanguages = weights.filter(w => w.weight > 0);
    
    // Sort by weight desc
    activeLanguages.sort((a, b) => b.weight - a.weight);

    const generatedQueries: { query: string; language: string }[] = [];
    
    // Distribute slots based on weight (Total: 6 slots)
    // E.g. Tamil 80% (4.8 slots -> 5), English 20% (1.2 slots -> 1)
    
    let slotsFilled = 0;
    
    // Pass 1: Allocate guaranteed slots
    activeLanguages.forEach(lang => {
         const slots = Math.round((lang.weight / 100) * targetArtistCount);
         if (slots > 0) {
             for(let i=0; i<slots; i++) {
                 // Pick an artist for this language? 
                 // Actually, use "Language + Random Artist" or just "Language Hit Songs"
                 // Since we don't know the artist's language easily without complex metadata, 
                 // we will use the Language Filter in our Search Service!
                 
                 // Strategy: Pick a random query type
                 const types = ['Top Songs', 'Melody', 'Trending', 'Love Songs', 'Hit Songs'];
                 const type = types[Math.floor(Math.random() * types.length)];
                 const q = `${lang.language} ${type}`;
                 
                 generatedQueries.push({ query: q, language: lang.language });
             }
             slotsFilled += slots;
         }
    });
    
    // Pass 2: Fill remaining slots with highest weighted language (or random active)
    while(generatedQueries.length < targetArtistCount) {
         const fallbackLang = activeLanguages[0]?.language || 'English';
         const q = `${fallbackLang} Trending`;
         generatedQueries.push({ query: q, language: fallbackLang });
    }

    console.log(`[ReelsReco] 🎨 Generated ${generatedQueries.length} Weighted Queries:`, generatedQueries.map(q => q.query));
    return generatedQueries;
  }

  /**
   * Search using ONLY Saavn + Gaana (no SoundCloud, Wynk, NetEase etc.)
   */
  private async searchSaavnAndGaana(query: string, language?: string): Promise<UnifiedSong[]> {
    const results: UnifiedSong[] = [];

    try {
      // Search both in parallel
      const [saavnResults, gaanaResults] = await Promise.all([
        MultiSourceSearchService.searchSaavn(query, language).catch(() => [] as UnifiedSong[]),
        // Gaana doesn't strictly support 'language' param in same way, but we pass query to it
        MultiSourceSearchService.searchGaana(query).catch(() => [] as UnifiedSong[]),
      ]);

      results.push(...saavnResults, ...gaanaResults);
    } catch (error) {
      console.warn(`[RecoEngine] Search failed for "${query}":`, error);
    }

    return results;
  }

  /**
   * Fetch personalized feed - THE MIXTAPE GENERATOR
   */
  async fetchPersonalizedFeed(_totalLimit: number = 30): Promise<UnifiedSong[]> {
    // 1. Get 6 weighted queries
    const weightedQueries = this.generateQueries(6);
    const mixtape: UnifiedSong[] = [];

    // 2. Fetch songs for EACH query
    // We run these in parallel for speed, effectively fetching 6 "mini-feeds"
    const resultsPromises = weightedQueries.map(async (item) => {
        const rawSongs = await this.searchSaavnAndGaana(item.query, item.language);
        const filtered = this.filterSongs(rawSongs);
        const deduped = this.deduplicate(filtered);
        
        // "each artist 5 songs" rule
        // We take the top 5 most relevant (or just first 5 nicely shuffled)
        return deduped.slice(0, 5);
    });

    const itemsPerArtist = await Promise.all(resultsPromises);
    
    // 3. Flatten into one list
    itemsPerArtist.forEach(songs => mixtape.push(...songs));

    console.log(`[RecoEngine] 💿 Mixtape Generated: ${mixtape.length} songs from ${weightedQueries.length} artists`);

    // 4. SHUFFLE THE MIXTAPE (Crucial for the "randomize it" part)
    // We don't want AAABBBCCC, we want ABCBAC...
    const finalFeed = mixtape.sort(() => Math.random() - 0.5);

    // Mark as seen
    const prefsStore = useReelsPreferencesStore.getState();
    finalFeed.forEach(s => prefsStore.markSeen(s.id));

    return finalFeed;
  }

  /**
   * Load more songs for infinite scroll
   * Just does the same thing again - grabs another cluster of 6 artists
   */
  async loadMoreSongs(count: number = 20): Promise<UnifiedSong[]> {
    return this.fetchPersonalizedFeed(count);
  }

  /**
   * Filter out downloaded, seen, and disliked artist songs
   */
  /**
   * Filter and Enrich songs
   * 1. Swaps in LOCAL songs if they exist (Prioritize Offline)
   * 2. Filters out seen/skipped songs
   */
  private filterSongs(songs: UnifiedSong[]): UnifiedSong[] {
    const prefsStore = useReelsPreferencesStore.getState();
    const songsStore = useSongsStore.getState();

    // Map for fast lookups: "title_artist" -> Local Song
    const localSongMap = new Map<string, any>();
    songsStore.songs.forEach(s => {
        const key = `${s.title?.toLowerCase().trim()}_${s.artist?.toLowerCase().trim()}`;
        localSongMap.set(key, s);
    });

    const skippedArtists = new Set(
      prefsStore.getSkippedArtistNames().map(a => a.toLowerCase())
    );

    return songs.map(song => {
      // 1. Check if we have a local version
      const key = `${song.title?.toLowerCase().trim()}_${song.artist?.toLowerCase().trim()}`;
      const localMatch = localSongMap.get(key);

      if (localMatch) {
          console.log(`[Reels] 🏠 Found local match for ${song.title}, swapping!`);
          // Convert Local Song to UnifiedSong
          return {
              id: localMatch.id,
              title: localMatch.title,
              artist: localMatch.artist || 'Unknown Artist',
              highResArt: localMatch.coverImageUri || song.highResArt || '', // Use local art or fallback
              downloadUrl: localMatch.audioUri || '',
              source: 'Local',
              duration: localMatch.duration,
              hasLyrics: localMatch.lyrics?.length > 0,
              isLocal: true,
              isAuthentic: true
          } as UnifiedSong;
      }
      return song;
    }).filter(song => {
      // 2. Filter invalid or unwanted songs
      if (!song.downloadUrl) return false;

      // Filter seen songs (Enable this if you want to hide seen, but maybe not for local songs?)
      // User might want to re-watch local reels? Let's keep filter for now to keep feed fresh.
      if (prefsStore.isSeen(song.id)) return false;

      // Filter skipped artists
      const artistLower = song.artist?.toLowerCase()?.trim();
      if (artistLower && skippedArtists.has(artistLower)) return false;

      return true;
    });
  }

  /**
   * Score songs by how well they match user preferences
   */
  private scoreAndRank(songs: UnifiedSong[]): UnifiedSong[] {
    const prefsStore = useReelsPreferencesStore.getState();
    const topArtists = prefsStore.getTopArtistNames(10);
    const topArtistSet = new Set(topArtists.map(a => a.toLowerCase()));

    const scored = songs.map(song => {
      let score = 0;
      const artistLower = song.artist?.toLowerCase()?.trim();

      // Artist match = BIG bonus
      if (artistLower && topArtistSet.has(artistLower)) {
        score += 50;
      }

      // Has cover art
      if (song.highResArt) score += 10;

      // Has duration
      if (song.duration && song.duration > 30) score += 5;

      return { song, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Math.random() - 0.5;
    });

    return scored.map(s => s.song);
  }

  /**
   * Deduplicate by title+artist
   */
  private deduplicate(songs: UnifiedSong[]): UnifiedSong[] {
    const seen = new Set<string>();
    return songs.filter(song => {
      const key = `${song.title?.toLowerCase().trim()}_${song.artist?.toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export const reelsRecommendationEngine = new ReelsRecommendationEngine();
