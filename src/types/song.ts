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
