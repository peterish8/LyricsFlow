/**
 * LyricFlow - Song & Lyrics Type Definitions
 */

export interface LyricLine {
  id?: number;
  timestamp: number; // in seconds
  text: string;
  lineOrder: number;
  align?: 'left' | 'center' | 'right';
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  gradientId: string;
  duration: number; // calculated from last timestamp
  dateCreated: string; // ISO string
  dateModified: string; // ISO string
  playCount: number;
  lastPlayed?: string; // ISO string
  lyrics: LyricLine[];
  scrollSpeed?: number; // Manual scroll speed (pixels per second) if no timestamps
  coverImageUri?: string; // URI to custom cover art
  lyricsAlign?: 'left' | 'center' | 'right'; // Default alignment for all lyrics
  textCase?: 'normal' | 'uppercase' | 'titlecase' | 'sentencecase'; // Text case transformation
  lyricSource?: 'LRCLIB' | 'Genius' | 'Manual'; // Where lyrics came from
  audioUri?: string; // URI to local audio file
  isLiked?: boolean; // Whether song is liked
  isHidden?: boolean; // Whether song is hidden
  transliteratedLyrics?: LyricLine[]; // Romanized/Colloquial lyrics
  
  // AI Karaoke fields removed
}

// Karaoke playback mix settings
export interface KaraokeMixSettings {
  vocalVolume: number;       // 0.0 to 2.0 (can boost)
  instrumentalVolume: number; // 0.0 to 2.0
  balance: number;           // -1.0 (vocals only) to 1.0 (instruments only)
}

export interface SongCreateInput {
  title: string;
  artist?: string;
  album?: string;
  gradientId: string;
  lyricsText: string; // raw lyrics with timestamps
  scrollSpeed?: number;
}

export interface SongUpdateInput extends Partial<SongCreateInput> {
  id: string;
  coverImageUri?: string;
}

export type SortOption = 'recent' | 'title' | 'artist' | 'dateAdded';
export type ViewMode = 'grid' | 'list';

/**
 * Unified Song Interface for Parallel Race Engine
 * Both SoundCloud and Audiomack must map to this exact structure
 */
export interface UnifiedSong {
  id: string;
  title: string;
  artist: string;
  highResArt: string;
  downloadUrl: string;
  streamUrl?: string; // Optional alias for downloadUrl
  thumbnail?: string; // Optional alias for highResArt
  source: 'Saavn' | 'Wynk' | 'NetEase' | 'SoundCloud' | 'Audiomack' | 'Gaana';
  duration?: number; // in seconds
  hasLyrics?: boolean;
  
  // Selection/Download Properties
  selectedQuality?: { url: string; quality: string; format: string };
  selectedLyrics?: string;
  selectedCoverUri?: string;
  isAuthentic?: boolean; // Whether song matches the exact requested artist
}

/**
 * Playlist Interface
 */
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverImageUri?: string;
  isDefault: boolean;    // true for "Liked Songs"
  sortOrder: number;
  dateCreated: string;
  dateModified: string;
  songCount?: number;    // computed from JOIN
}
