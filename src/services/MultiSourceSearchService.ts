import { UnifiedSong } from '../types/song';

// Fake browser headers to bypass Cloudflare Bot Protection
const BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://saavn.sumit.co',
  'Referer': 'https://saavn.sumit.co/',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
};

// The Hydra: If one server dies, try the next
// Layer 1: JioSaavn API Hierarchy (Primary → Secondary)
const SAAVN_MIRRORS = [
  'https://saavn.sumit.co/api',                      // Primary (User's working mirror)
  'https://jiosaavn-api-byprats.vercel.app/api'     // Secondary (User's hosted API)
];

// Layer 1.1: Gaana API (User's hosted)
const GAANA_API = 'https://gaanaapibyprats.vercel.app/api/search';

/**
 * ============================================================================
 * LAYER 1: JIOSAAVN (Primary Music Source)
 * Hierarchy: saavn.sumit.co → jiosaavn-api-byprats.vercel.app
 * ============================================================================
 */

/**
 * Helper: Fetch from a SINGLE Saavn Mirror
 */
async function fetchSaavnResults(baseUrl: string, query: string, language?: string): Promise<UnifiedSong[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); 

    try {
      console.log(`[Saavn] Pinging ${baseUrl} (Lang: ${language || 'All'})...`);
      // Issue: User wants more results (30 instead of 10)
      let url = `${baseUrl}/search/songs?query=${encodeURIComponent(query)}&limit=30&n=30`;
      
      // Add optional language filter if provided
      if (language) {
         url += `&language=${language.toLowerCase()}`;
      }
      
      const response = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[Saavn] Mirror ${baseUrl} returned status ${response.status}`);
        return [];
      }

      const json = await response.json();
      const results = json.data?.results || [];
      if (results.length === 0) return [];

      return results.map((song: any) => {
        const urlArray = song.downloadUrl || song.media_url || [];
        const imageArray = song.image || [];
        
        const topQuality = urlArray.find((u: any) => u.quality === '320kbps') || urlArray[urlArray.length - 1];
        const highResImage = imageArray.find((i: any) => i.quality === '500x500') || imageArray[imageArray.length - 1];
        
        return {
          id: song.id,
          title: song.name || song.title,
          artist: (song.artists?.primary?.map((a: any) => a.name).join(', ')) || (song.primaryArtists || '').split(',')[0]?.trim() || 'Unknown Artist',
          highResArt: highResImage?.url || '',
          downloadUrl: topQuality?.url || topQuality?.link || '',
          hasLyrics: song.hasLyrics === 'true' || song.hasLyrics === true,
          source: 'Saavn',
          duration: song.duration ? parseInt(song.duration, 10) : undefined,
        };
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.warn(`[Saavn] Mirror ${baseUrl} failed: ${error.message}`);
      return [];
    }
}

/**
 * ============================================================================
 * LAYER 1: JIOSAAVN (The Official Source)
 * Parallel Strategy: Custom API + Public Mirror Pool
 * ============================================================================
 */
async function searchSaavn(query: string, language?: string): Promise<UnifiedSong[]> {
  // Try mirrors in priority order (saavn.sumit.co first, then user's hosted API)
  for (const baseUrl of SAAVN_MIRRORS) {
    const results = await fetchSaavnResults(baseUrl, query, language);
    if (results.length > 0) {
      console.log(`[Saavn] ✅ Mirror (${baseUrl}) found ${results.length} songs`);
      return results;
    }
  }
  
  console.log('[Saavn] All mirrors failed or returned empty');
  return [];
}

/**
 * ============================================================================
 * LAYER 1.1: GAANA (Secondary Music Source - User's Hosted API)
 * ============================================================================
 */
async function searchGaana(query: string): Promise<UnifiedSong[]> {
  try {
    const url = `${GAANA_API}?q=${encodeURIComponent(query)}`;
    console.log(`[Gaana] Searching...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, { 
      headers: BROWSER_HEADERS,
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`[Gaana] API returned status ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    // DEBUG: Log the keys to understand the structure
    console.log('[Gaana] Response keys:', Object.keys(data));
    
    // Robust Parsing for Gaana API (Vercel Host)
    let results: any[] = [];

    if (Array.isArray(data)) {
        results = data;
    } else if (Array.isArray(data.songs)) {
        results = data.songs;
    } else if (Array.isArray(data.data)) {
        results = data.data;
    } else if (Array.isArray(data.results)) {
        results = data.results;
    } else if (Array.isArray(data.tracks)) {
        results = data.tracks;
    } else if (data.data && Array.isArray(data.data.songs)) {
        results = data.data.songs; 
    } else if (data.data && Array.isArray(data.data.results)) {
        results = data.data.results;
    }

    // Ensure results is an array
    if (!Array.isArray(results)) {
      console.log(`[Gaana] Could not find array in response. Structure:`, JSON.stringify(data).substring(0, 150));
      return [];
    }
    
    if (results.length === 0) {
      console.log('[Gaana] No results found');
      return [];
    }
    
    console.log(`[Gaana] ✅ Found ${results.length} songs`);
    
    // Normalize Gaana results to UnifiedSong format
    return results.map((track: any) => ({
      id: `gaana-${track.id || track.seokey || Math.random().toString(36).substring(7)}`,
      title: track.title || track.track_title || track.name || 'Unknown Title',
      artist: track.artist || track.artists_name || track.artist_names || track.singers || 'Unknown Artist',
      album: track.album || track.album_title || '',
      duration: track.duration ? parseInt(track.duration, 10) : undefined,
      highResArt: (track.artwork || track.artwork_large || track.image || track.artworkLink || '').replace('150x150', '500x500'),
      downloadUrl: track.urls?.high?.url || track.stream_url || track.streamUrl || track.url || '',
      streamUrl: track.urls?.high?.url || track.stream_url || track.streamUrl || track.url || '',
      hasLyrics: false, // Gaana API doesn't provide lyrics info
      source: 'Gaana' as const,
    })).filter(s => s.downloadUrl); // Ensure we only return playables
  } catch (error: any) {
    console.warn('[Gaana] Search failed:', error.message);
    return [];
  }
}

const isArtistMatch = (songArtist: string, targetArtist: string): boolean => {
  if (!targetArtist) return false;
  const s = songArtist.toLowerCase();
  const t = targetArtist.toLowerCase();
  return s.includes(t) || t.includes(s);
};

export async function searchMusic(query: string, artistName?: string, onProgress?: (status: string) => void, language?: string): Promise<UnifiedSong[]> {
  console.log('[SearchEngine] 🚀 Starting Ultimate Search (Waterfall Mode)...');
  onProgress?.('Searching JioSaavn (Layer 1)...');

  let saavnResults: UnifiedSong[] = [];
  let foundAuthentic = false;

  // LAYER 1: JioSaavn (Primary)
  try {
      saavnResults = await searchSaavn(query, language);
      
      // Mark Authenticity and Filter
      if (saavnResults.length > 0) {
          const lowerQuery = query.toLowerCase();
          const queryHasRemix = lowerQuery.includes('remix');
          const queryHasLive = lowerQuery.includes('live');
          const queryHasCover = lowerQuery.includes('cover');

          saavnResults = saavnResults.map(s => {
              const matchesArtist = artistName ? isArtistMatch(s.artist, artistName) : true;
              const lowerTitle = s.title.toLowerCase();
              
              // Penalize unwanted versions
              const isRemix = lowerTitle.includes('remix') || lowerTitle.includes('mix');
              const isLive = lowerTitle.includes('live') || lowerTitle.includes('concert');
              const isCover = lowerTitle.includes('cover') || lowerTitle.includes('performed by');
              
              let isAuth = matchesArtist;
              
              // If query didn't ask for remix but result is remix -> Not Authentic
              if (!queryHasRemix && isRemix) isAuth = false;
              if (!queryHasLive && isLive) isAuth = false;
              if (!queryHasCover && isCover) isAuth = false;

              return { ...s, isAuthentic: isAuth };
          });
          
          // Sort: Authentic first
          saavnResults.sort((a, b) => (b.isAuthentic === true ? 1 : 0) - (a.isAuthentic === true ? 1 : 0));

          // Check if we found a good match
          if (saavnResults.some(s => s.isAuthentic)) {
               console.log('[SearchEngine] ✅ Found AUTHENTIC match in Saavn. Stopping here.');
               // Filter to return ONLY authentic if found? Or just prioritize?
               // Let's return the authentic ones primarily.
               return saavnResults;
          }
          
          console.log('[SearchEngine] ⚠️ Saavn results found, but NO authentic match. Asking Gaana...');
      } else {
          console.log('[SearchEngine] ⚠️ Saavn EMPTY, falling to Gaana...');
      }
  } catch (e) {
      console.log('[SearchEngine] ⚠️ Saavn EXCEPTION, falling to Gaana...');
  }

  // LAYER 1.1: Gaana (Secondary)
  onProgress?.('Searching Gaana (Layer 1.1)...');
  try {
      let gaanaResults = await searchGaana(query);
      
      if (gaanaResults.length > 0) {
          console.log(`[SearchEngine] ✅ Gaana found ${gaanaResults.length} songs`);
          
          if (saavnResults.length > 0) {
             console.log(`[SearchEngine] Merging Saavn (${saavnResults.length}) + Gaana (${gaanaResults.length})`);
             // Deduplicate by title + artist to avoid showing same song twice
             const combined = [...saavnResults];
             const existingIds = new Set(combined.map(s => s.id));
             
             for (const gSong of gaanaResults) {
                 // Simple dedup based on approximate title match could be better, but ID is safe
                 if (!existingIds.has(gSong.id)) {
                     combined.push(gSong);
                 }
             }
             return combined;
          }
          
          return gaanaResults;
      }
  } catch (e) {
      console.log('[SearchEngine] ⚠️ Gaana EXCEPTION...');
  }

  // Fallback: If we have ANY Saavn results (even if not authentic), return them now
  if (saavnResults.length > 0) {
      console.log(`[SearchEngine] ⚠️ Returning ${saavnResults.length} Saavn results (Authenticity check failed, but better than nothing)`);
      return saavnResults;
  }

  // ALL LAYERS FAILED (Strict Mode: Only Saavn and Gaana)
  console.error('[SearchEngine] ALL LAYERS FAILED. (Saavn Public -> Saavn Hosted -> Gaana Hosted)');
  return [];
}

// Named export for compatibility
export const MultiSourceSearchService = {
  searchMusic,
  searchSaavn,
  searchGaana
};
