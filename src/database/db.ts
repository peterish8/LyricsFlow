/**
 * LyricFlow - SQLite Database Initialization
 */

import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'lyricflow.db';
const LOG_PREFIX = '[DB]';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let isInitialized = false;

const log = (msg: string, data?: any) => {
  console.log(`${LOG_PREFIX} ${msg}`, data ?? '');
};

const openAndInitialize = async (): Promise<SQLite.SQLiteDatabase> => {
  log('Opening database...');
  const dbInstance = await SQLite.openDatabaseAsync(DATABASE_NAME);
  log('Database opened, initializing tables...');
  await initializeTables(dbInstance);
  log('Tables initialized successfully');
  return dbInstance;
};

/**
 * Initialize and return database instance - STRICT SINGLETON
 */
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  // Return existing initialized instance
  if (isInitialized && db) {
    return db;
  }

  // Wait for in-progress initialization
  if (initPromise) {
    log('Waiting for in-progress initialization...');
    return initPromise;
  }

  // Start new initialization
  log('Starting new database initialization...');
  initPromise = (async () => {
    try {
      // Clean slate: close any stale handles
      if (db) {
        log('Closing stale database handle...');
        try {
          await db.closeAsync();
        } catch (e) {
          log('Failed to close stale handle (expected)', e);
        }
        db = null;
      }

      const dbInstance = await openAndInitialize();
      db = dbInstance;
      isInitialized = true;
      log('Database ready');
      return dbInstance;
    } catch (error) {
      log('Initialization failed, attempting recovery...', error);
      
      // Recovery: delete and recreate
      try {
        if (db) {
          await db.closeAsync().catch(() => {});
          db = null;
        }
        
        log('Deleting corrupted database...');
        await SQLite.deleteDatabaseAsync(DATABASE_NAME);
        
        log('Recreating database...');
        const recoveredDb = await openAndInitialize();
        db = recoveredDb;
        isInitialized = true;
        log('Database recovered successfully');
        return recoveredDb;
      } catch (recoveryError) {
        log('Recovery failed', recoveryError);
        db = null;
        isInitialized = false;
        throw error;
      }
    } finally {
      initPromise = null;
    }
  })();
  
  return initPromise;
};

/**
 * Initialize database - entry point for app startup
 */
export const initDatabase = async (): Promise<void> => {
  log('initDatabase() called');
  await getDatabase();
  log('initDatabase() completed');
};

/**
 * Create tables if they don't exist
 */
const initializeTables = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  await database.execAsync(`
    PRAGMA foreign_keys = ON;
    
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT,
      album TEXT,
      gradient_id TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      date_created TEXT NOT NULL,
      date_modified TEXT NOT NULL,
      play_count INTEGER DEFAULT 0,
      last_played TEXT,
      scroll_speed INTEGER DEFAULT 50,
      cover_image_uri TEXT,
      lyrics_align TEXT DEFAULT 'left',
      audio_uri TEXT
    );
    
    CREATE TABLE IF NOT EXISTS lyrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      text TEXT NOT NULL,
      line_order INTEGER NOT NULL,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
    CREATE INDEX IF NOT EXISTS idx_lyrics_song_id ON lyrics(song_id);
    CREATE INDEX IF NOT EXISTS idx_lyrics_timestamp ON lyrics(timestamp);
  `);
  
  // Migration: Add lyrics_align if missing
  try {
    const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(songs)');
    if (!columns.some(c => c.name === 'lyrics_align')) {
      log('Adding lyrics_align column...');
      await database.execAsync('ALTER TABLE songs ADD COLUMN lyrics_align TEXT DEFAULT "left"');
      log('Migration complete');
    }
    if (!columns.some(c => c.name === 'text_case')) {
      log('Adding text_case column...');
      await database.execAsync('ALTER TABLE songs ADD COLUMN text_case TEXT DEFAULT "normal"');
      log('Migration complete');
    }
    if (!columns.some(c => c.name === 'audio_uri')) {
      log('Adding audio_uri column...');
      await database.execAsync('ALTER TABLE songs ADD COLUMN audio_uri TEXT');
      log('Migration complete');
    }
  } catch (e) {
    log('Migration check failed', e);
  }
};

/**
 * Close database connection
 */
export const closeDatabase = async (): Promise<void> => {
  log('closeDatabase() called');
  
  if (initPromise) {
    log('Waiting for init to complete before closing...');
    await initPromise.catch(() => undefined);
  }

  if (db) {
    log('Closing database...');
    await db.closeAsync();
    db = null;
    isInitialized = false;
    log('Database closed');
  }

  initPromise = null;
};
