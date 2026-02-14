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

// SoundCloud Client ID Caching
let cachedClientId: string | null = null;
let clientIdTimestamp = 0;

async function getSoundCloudClientId(): Promise<string | null> {
  if (cachedClientId && (Date.now() - clientIdTimestamp < 3600000)) { // 1 hour cache
    console.log('[SoundCloud] Using cached client ID');
    return cachedClientId;
  }

  try {
    console.log('[SoundCloud] Scraping new client ID...');
    const response = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] }
    });
    const text = await response.text();
    
    // Find script URLs
    const scriptTags = text.match(/<script crossorigin src="(https:\/\/[a-z0-9.-]+\.sndcdn\.com\/assets\/[a-zA-Z0-9.-]+\.js)"/g);
    if (!scriptTags) return null;

    // Scan scripts for client_id
    for (const tag of scriptTags) {
      const url = tag.match(/src="(.*?)"/)?.[1];
      if (!url) continue;

      try {
        const jsRes = await fetch(url);
        const jsText = await jsRes.text();
        const match = jsText.match(/client_id:"([a-zA-Z0-9]{32})"/);
        if (match && match[1]) {
          cachedClientId = match[1];
          clientIdTimestamp = Date.now();
          console.log('[SoundCloud] Fresh Client ID:', cachedClientId);
          return cachedClientId;
        }
      } catch (e) { continue; }
    }
  } catch (e) {
    console.warn('[SoundCloud] Client ID scrape failed');
  }
  return null;
}

/**
 * ============================================================================
 * LAYER 1: JIOSAAVN (Primary Music Source)
 * Hierarchy: saavn.sumit.co → jiosaavn-api-byprats.vercel.app
 * ============================================================================
 */

/**
 * Helper: Fetch from a SINGLE Saavn Mirror
 */
async function fetchSaavnResults(baseUrl: string, query: string): Promise<UnifiedSong[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); 

    try {
      console.log(`[Saavn] Pinging ${baseUrl}...`);
      // Issue: User wants more results (30 instead of 10)
      const response = await fetch(`${baseUrl}/search/songs?query=${encodeURIComponent(query)}&limit=30&n=30`, {
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
          duration: song.duration ? parseInt(song.duration) : undefined,
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
async function searchSaavn(query: string): Promise<UnifiedSong[]> {
  // Try mirrors in priority order (saavn.sumit.co first, then user's hosted API)
  for (const baseUrl of SAAVN_MIRRORS) {
    const results = await fetchSaavnResults(baseUrl, query);
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
    const results = data.results || data.data || [];
    
    if (results.length === 0) {
      console.log('[Gaana] No results found');
      return [];
    }
    
    console.log(`[Gaana] ✅ Found ${results.length} songs`);
    
    // Normalize Gaana results to UnifiedSong format
    return results.map((track: any) => ({
      id: `gaana-${track.id || track.seokey || Math.random()}`,
      title: track.title || track.track_title || 'Unknown Title',
      artist: track.artist || track.artists_name || track.artist_names || 'Unknown Artist',
      album: track.album || track.album_title || '',
      duration: track.duration ? parseInt(track.duration) : undefined,
      highResArt: track.artwork || track.artwork_large || track.image || track.artworkLink || '',
      downloadUrl: track.urls?.high?.url || track.stream_url || track.streamUrl || '',
      streamUrl: track.urls?.high?.url || track.stream_url || track.streamUrl || '',
      hasLyrics: false, // Gaana API doesn't provide lyrics info
      source: 'Gaana' as const,
    }));
  } catch (error: any) {
    console.warn('[Gaana] Search failed:', error.message);
    return [];
  }
}

/**
 * ============================================================================
 * LAYER 2: WYNK MUSIC (Backup Official)
 * ============================================================================
 */
async function searchWynk(query: string): Promise<UnifiedSong[]> {
  try {
    console.log('[Wynk] 🎯 Searching for official tracks:', query);
    
    // Wynk API endpoint (using public wrapper)
    const searchUrl = `https://wynk-music-api.vercel.app/api/search?query=${encodeURIComponent(query)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(searchUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`[Wynk] API returned ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const results = data.data?.results || data.results || [];
    
    if (results.length === 0) {
      console.log('[Wynk] No official tracks found');
      return [];
    }
    
    const songs: UnifiedSong[] = results.slice(0, 10).map((track: any) => {
      // Extract highest quality audio URL
      const mediaUrls = track.media_urls || track.downloadUrl || [];
      const highestQuality = mediaUrls.find((url: any) => url.bitrate === '320' || url.quality === '320kbps')
        || mediaUrls[mediaUrls.length - 1];
      
      // Extract high-res artwork
      const artwork = track.image || track.artwork || track.albumArt || '';
      const highResArt = typeof artwork === 'string' ? artwork : artwork.url || '';
      
      return {
        id: track.id || track.contentId || Math.random().toString(),
        title: track.title || track.name || 'Unknown Title',
        artist: track.artist || track.artistName || track.singers || 'Unknown Artist',
        highResArt: highResArt.replace('150x150', '500x500'), // Upgrade to high-res
        downloadUrl: highestQuality?.url || highestQuality || '',
        source: 'Wynk' as const,
        duration: track.duration || undefined,
        hasLyrics: track.hasLyrics || false,
      };
    }).filter((song: UnifiedSong) => song.downloadUrl);
    
    console.log(`[Wynk] ✅ Found ${songs.length} official tracks`);
    return songs;
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn('[Wynk] Timed out (5s)');
    } else {
      console.warn('[Wynk] Search failed:', error.message);
    }
    return [];
  }
}

/**
 * ============================================================================
 * LAYER 3: NETEASE CLOUD MUSIC (Global Heavyweight)
 * ============================================================================
 */
async function searchNetEase(query: string): Promise<UnifiedSong[]> {
  try {
    console.log('[NetEase] 🌏 Searching global catalog:', query);
    
    const searchUrl = `https://netease-cloud-music-api-psi-six.vercel.app/search?keywords=${encodeURIComponent(query)}&limit=10`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(searchUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`[NetEase] API returned ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const results = data.result?.songs || [];
    
    if (results.length === 0) {
      console.log('[NetEase] No tracks found');
      return [];
    }
    
    const songs = await Promise.all(results.map(async (song: any) => {
        try {
            // Needed to get the actual URL
            const urlReq = await fetch(`https://netease-cloud-music-api-psi-six.vercel.app/song/url?id=${song.id}`, { headers: BROWSER_HEADERS });
            const urlData = await urlReq.json();
            const downloadUrl = urlData.data?.[0]?.url;
            
            if (!downloadUrl) return null;

             return {
                id: song.id.toString(),
                title: song.name,
                artist: song.artists?.[0]?.name || 'Unknown',
                highResArt: song.album?.artist?.img1v1Url || '', 
                downloadUrl: downloadUrl,
                source: 'NetEase' as const,
                duration: song.duration ? song.duration / 1000 : undefined
             } as UnifiedSong;
        } catch (e) { return null; }
    }));

    const validSongs = songs.filter((s): s is UnifiedSong => s !== null);
    console.log(`[NetEase] ✅ Found ${validSongs.length} tracks`);
    return validSongs;

  } catch (error: any) {
    console.warn('[NetEase] Search failed:', error.message);
    return [];
  }
}

async function searchSoundCloud(query: string): Promise<UnifiedSong[]> {
    try {
        const clientId = await getSoundCloudClientId();
        if (!clientId) throw new Error('No Client ID');

        const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=10`;
        
        console.log('[SoundCloud] Searching:', query);
        const response = await fetch(searchUrl, {
            headers: BROWSER_HEADERS
        });
        const data = await response.json();
    
        const collection = data.collection || [];
        if (collection.length === 0) return [];

        const results = await Promise.all(collection.map(async (track: any) => {
            const progressiveStream = track.media?.transcodings?.find(
                (t: any) => t.format?.protocol === 'progressive'
            );

            if (!progressiveStream) return null;

            const streamResponse = await fetch(`${progressiveStream.url}?client_id=${clientId}`, {
                headers: BROWSER_HEADERS
            });
            const streamData = await streamResponse.json();
            
            return {
                id: track.id.toString(),
                title: track.title,
                artist: track.user?.username || 'Unknown',
                highResArt: (track.artwork_url || track.user?.avatar_url || '').replace('-large', '-t500x500'),
                downloadUrl: streamData.url,
                source: 'SoundCloud' as const,
                duration: track.duration ? track.duration / 1000 : undefined
            };
        }));
        
        return results.filter((s): s is UnifiedSong => s !== null);
    } catch (e) {
        console.warn('[SoundCloud] Failed');
        return [];
    }
}

async function searchAudiomack(query: string): Promise<UnifiedSong[]> {
     try {
        const searchUrl = `https://api.audiomack.com/v1/search?q=${encodeURIComponent(query)}&show=songs&limit=10`;
        const response = await fetch(searchUrl, { headers: BROWSER_HEADERS });
        const data = await response.json();
        
        const results = data.results || [];
        return results.map((track: any) => ({
            id: track.id,
            title: track.title,
            artist: track.artist,
             highResArt: track.image || '',
            downloadUrl: `https://api.audiomack.com/v1/music/stream/${track.url_slug}`, 
            source: 'Audiomack' as const
        }));
    } catch (e) {
        return [];
    }
}

export async function searchMusic(query: string, onProgress?: (status: string) => void): Promise<UnifiedSong[]> {
  console.log('[SearchEngine] 🚀 Starting Ultimate 5-Layer Search...');
  onProgress?.('Searching JioSaavn (Layer 1)...');

  // LAYER 1: JioSaavn (The Official 320kbps Standard)
  try {
      let results = await searchSaavn(query);
      if (results.length > 0) {
          console.log('[SearchEngine] ✅ Layer 1 (Saavn) SUCCESS');
          return results;
      }
      console.log('[SearchEngine] ⚠️ Layer 1 (Saavn) EMPTY/FAILED, falling to Layer 1.1...');
  } catch (e) {
      console.log('[SearchEngine] ⚠️ Layer 1 (Saavn) EXCEPTION, falling to Layer 1.1...');
  }

  // LAYER 1.1: Gaana (Secondary Indian Music Source)
  onProgress?.('Saavn failed. Trying Gaana (Layer 1.1)...');
  try {
      const results = await searchGaana(query);
      if (results.length > 0) {
          console.log('[SearchEngine] ✅ Layer 1.1 (Gaana) SUCCESS');
          return results;
      }
      console.log('[SearchEngine] ⚠️ Layer 1.1 (Gaana) EMPTY/FAILED, falling to Layer 2...');
  } catch (e) {
      console.log('[SearchEngine] ⚠️ Layer 1.1 (Gaana) EXCEPTION, falling to Layer 2...');
  }

  // LAYER 2: Wynk Music (Backup Official)
  onProgress?.('Gaana failed. Trying Wynk Music (Layer 2)...');
  try {
      const results = await searchWynk(query);
      if (results.length > 0) {
          console.log('[SearchEngine] ✅ Layer 2 (Wynk) SUCCESS');
          return results;
      }
  } catch (e) {}
  
  // LAYER 3: NetEase (Global Catalog)
  onProgress?.('Wynk failed. Trying NetEase (Layer 3)...');
  try {
      const results = await searchNetEase(query);
      if (results.length > 0) {
          console.log('[SearchEngine] ✅ Layer 3 (NetEase) SUCCESS');
          return results;
      }
  } catch (e) {}

  // LAYER 4: SoundCloud & Audiomack (The UGC / Remix Final Fallback)
  onProgress?.('Searching global remix databases (Layer 4)...');
  try {
      console.log('[SearchEngine] 🏁 Layer 4: Racing SoundCloud + Audiomack...');
      
      const fallbackResults = await Promise.any([
        searchSoundCloud(query).then(res => { if (!res.length) throw new Error(); return res; }),
        searchAudiomack(query).then(res => { if (!res.length) throw new Error(); return res; })
      ]);
      
      console.log(`[SearchEngine] ✅ Layer 4 (UGC) SUCCESS: ${fallbackResults[0].source}`);
      return fallbackResults;
  } catch (error) {
    console.error('[SearchEngine] ALL LAYERS FAILED.');
    return [];
  }
}

// Named export for compatibility
export const MultiSourceSearchService = {
  searchMusic,
  searchSaavn,
  searchGaana
};
