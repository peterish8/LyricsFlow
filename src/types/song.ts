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
  audioUri?: string; // URI to local audio file
  isLiked?: boolean; // Whether song is liked
  
  // AI Karaoke: Stem storage
  vocalStemUri?: string;          // Path to isolated vocals WAV
  instrumentalStemUri?: string;  // Path to isolated instruments WAV
  separationStatus: 'none' | 'pending' | 'processing' | 'completed' | 'failed';
  separationProgress: number;      // 0-100%
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
