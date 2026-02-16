/**
 * Reels Recommendation Engine
 * Uses ONLY Saavn + Gaana APIs
 * Seeds from user's existing song library for instant personalization
 * Generates personalized search queries based on user's artists & genres
 */

import { UnifiedSong, Song } from '../types/song';
import { useReelsPreferencesStore, LanguagePreference } from '../store/reelsPreferencesStore';
import { useSongsStore } from '../store/songsStore';
import { MultiSourceSearchService } from './MultiSourceSearchService';

interface GeneratedQuery {
  query: string;
  language: string;
}

// Trending/discovery queries - Removed as we now generate on the fly

class ReelsRecommendationEngine {
  private seededFromLibrary = false;

  /**
   * Seed preferences from user's existing song library
   * This is the KEY to instant personalization!
   */
  seedFromLibrary() {
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
    
    // Check if we have analyzed preferences yet
    const topArtists = prefsStore.getTopArtistNames(5);
    if (this.seededFromLibrary && topArtists.length > 0) {
        return;
    }

    console.log(`[RecoEngine] 🌱 Seeding from ${songs.length} library songs...`);

    // Record each song as a "liked" interaction to build artist preferences
    // We do this efficiently by batch updating if possible, or just strict loop
    songs.forEach(song => {
      if (song.artist && song.artist !== 'Unknown Artist' && !song.artist.includes('Unknown')) {
        // Only record if not already recorded? 
        // Actually, store doesn't prevent dupes, so we should be careful.
        // For now, let's assume if it's in library, it's a strong signal.
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
    
    // Force immediate analysis to populate topArtists
    prefsStore.analyzePreferences();

    this.seededFromLibrary = true;
    console.log('[RecoEngine] ✅ Seeded preferences from library!');
    console.log('[RecoEngine] Top artists derived:', prefsStore.getTopArtistNames(10));
  }

  /**
   * Select a language based on user weights
   */
  private selectLanguageByWeight(weights: LanguagePreference[]): string {
    const active = weights.filter(w => w.weight > 0);
    if (active.length === 0) return 'English';

    const totalWeight = active.reduce((sum, curr) => sum + curr.weight, 0);
    const roll = Math.random() * totalWeight;

    let cumulative = 0;
    for (const item of active) {
      cumulative += item.weight;
      if (roll <= cumulative) return item.language;
    }

    return active[0].language;
  }

  /**
   * Generate personalized search queries based on "Artist Cluster" strategy
   * User Request: "Pick any 6 artists and each artist 5 songs"
   */
  generateQueries(targetArtistCount: number = 6): GeneratedQuery[] {
    // Seed from library first!
    this.seedFromLibrary();

    const songsStore = useSongsStore.getState();
    const prefsStore = useReelsPreferencesStore.getState();
    const languageWeights = prefsStore.getLanguageWeights();
    
    // 1. Get Top Artists (Explicitly Liked / Watched)
    const topArtists = prefsStore.getTopArtistNames(20);
    
    // 2. Get Dictionary of Library Artists (Implicit Interest)
    const libraryArtists = Array.from(new Set(
        songsStore.songs
            .map(s => s.artist)
            .filter(a => a && a !== 'Unknown Artist' && !a.includes('Unknown'))
            .map(a => a!.trim())
    ));

    // 3. Create Candidate Pool
    const skippedArtists = new Set(prefsStore.getSkippedArtistNames().map(a => a.toLowerCase()));
    const cleanPool = [...topArtists, ...libraryArtists].filter(a => !skippedArtists.has(a.toLowerCase()));
    const uniquePool = Array.from(new Set(cleanPool));
    
    console.log(`[RecoEngine] 🎱 Candidate Artist Pool Size: ${uniquePool.length}`);

    if (uniquePool.length === 0) {
        // Fallback to trending if no library/history data
        console.log('[RecoEngine] ⚠️ No personalized artists found. Using Language Trending fallback.');
        const fallbackQueries: GeneratedQuery[] = [];
        const activeLanguages = languageWeights.filter(w => w.weight > 0);
        
        const modifiers = ['Trending', 'Hit Songs', 'Melody', 'Love Songs', 'Party Songs'];
        
        while(fallbackQueries.length < targetArtistCount) {
            const selectedLang = this.selectLanguageByWeight(languageWeights);
            const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
            fallbackQueries.push({ 
                query: `${selectedLang} ${mod}`,
                language: selectedLang
            });
        }
        return fallbackQueries;
    }

    // 4. Shuffle and Pick Artists
    const shuffledArtists = uniquePool.sort(() => Math.random() - 0.5);
    const selectedArtists = shuffledArtists.slice(0, targetArtistCount); 
    
    const generatedQueries: GeneratedQuery[] = [];

    selectedArtists.forEach(artist => {
        const selectedLang = this.selectLanguageByWeight(languageWeights);
        const modifiers = ['songs', 'hit songs', 'melody songs', 'best songs'];
        const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
        
        generatedQueries.push({ 
            query: `${artist} ${mod}`, 
            language: selectedLang 
        });
    });

    // 5. Fill remaining slots
    while(generatedQueries.length < targetArtistCount) {
         const selectedLang = this.selectLanguageByWeight(languageWeights);
         const mod = ['Trending', 'Viral', 'New'].sort(() => Math.random() - 0.5)[0];
         generatedQueries.push({
             query: `${selectedLang} ${mod}`,
             language: selectedLang
         });
    }

    console.log(`[ReelsReco] 🎨 Generated ${generatedQueries.length} Personalized Queries:`, generatedQueries.map(q => `${q.query} (${q.language})`));
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
   * Filter and Enrich songs
   * 1. Swaps in LOCAL songs if they exist (Prioritize Offline)
   * 2. Filters out seen/skipped songs
   */
  private filterSongs(songs: UnifiedSong[]): UnifiedSong[] {
    const prefsStore = useReelsPreferencesStore.getState();
    const songsStore = useSongsStore.getState();

    // Map for fast lookups: "title_artist" -> Local Song
    const localSongMap = new Map<string, Song>();
    songsStore.songs.forEach(s => {
        const key = `${s.title?.toLowerCase().trim()}_${s.artist?.toLowerCase().trim()}`;
        localSongMap.set(key, s);
    });

    const skippedArtists = new Set(
      prefsStore.getSkippedArtistNames().map(a => a.toLowerCase())
    );

    const devotionalKeywords = [
        'devotional', 'bhakti', 'bhajan', 'aarti', 'mantra', 'chant', 
        'gospel', 'spirit', 'prayer', 'krishna', 'ram', 'hanuman', 
        'ganesh', 'shiva', 'durga', 'amritwani', 'chalisa', 'kirtan', 
        'stotram', 'sahib', 'waheguru', 'jesus', 'allah', 'katha', 'satsang'
    ];

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

      // 3. Filter Devotional Content
      const titleLower = song.title?.toLowerCase() || '';
      // const albumLower = song.album?.toLowerCase() || ''; // UnifiedSong might not have album
      const isDevotional = devotionalKeywords.some(keyword => 
          titleLower.includes(keyword) || artistLower?.includes(keyword)
      );
      
      if (isDevotional) {
          console.log(`[Reels] 🕊️ Filtered devotional content: ${song.title}`);
          return false;
      }

      // 4. Filter Unwanted Edits (Hardstyle, Sped Up, etc.)
      // User Request: "HARDSTYLE, SPED UP and all coming"
      const unwantedKeywords = [
          'hardstyle', 'sped up', 'slowed', 'reverb', 'bass boosted', 
          'mashup', '8d audio', 'nightcore', 'daycore', 'lofi flip'
      ];
      
      const isUnwanted = unwantedKeywords.some(keyword => 
          titleLower.includes(keyword) || artistLower?.includes(keyword)
      );

      if (isUnwanted) {
          console.log(`[Reels] 🚫 Filtered unwanted edit: ${song.title}`);
          return false;
      }

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
