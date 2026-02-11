import { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioPlayer, AudioSource } from 'expo-audio';
import { Song, KaraokeMixSettings } from '../types/song';

/**
 * 🎤 Karaoke Player Hook - Dual-track synchronized playback
 * 
 * Manages two audio players (Vocals + Instrumental) and ensures they stay in sync.
 * Uses expo-audio (SDK 50+) for concurrent playback.
 */

const SYNC_TOLERANCE_MS = 50; // Allow 50ms drift before correcting

export interface KaraokePlayerState {
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number; // in seconds
  duration: number; // in seconds
  hasStems: boolean;
  isLoading: boolean;
}

const DEFAULT_MIX: KaraokeMixSettings = {
  vocalVolume: 1.0,
  instrumentalVolume: 1.0,
  balance: 0.0, // -1 (vocals only) to 1 (instruments only)
};

export const useKaraokePlayer = (song: Song | null) => {
  const [state, setState] = useState<KaraokePlayerState>({
    isReady: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    hasStems: false,
    isLoading: false,
  });

  const [mixSettings, setMixSettings] = useState<KaraokeMixSettings>(DEFAULT_MIX);

  // Create audio sources for stems
  const vocalSource: AudioSource | null = song?.vocalStemUri ? { uri: song.vocalStemUri } : null;
  const instrSource: AudioSource | null = song?.instrumentalStemUri ? { uri: song.instrumentalStemUri } : null;

  // Use expo-audio hooks for each stem
  const vocalPlayer = useAudioPlayer(vocalSource || { uri: '' });
  const instrPlayer = useAudioPlayer(instrSource || { uri: '' });

  const syncInterval = useRef<NodeJS.Timeout | null>(null);
  const isSeeking = useRef(false);

  // Check if stems exist
  useEffect(() => {
    const hasStems = !!(song?.vocalStemUri && song?.instrumentalStemUri);
    setState(prev => ({ ...prev, hasStems }));
  }, [song?.vocalStemUri, song?.instrumentalStemUri]);

  // Update ready state when players are loaded
  useEffect(() => {
    if (!vocalSource || !instrSource) {
      setState(prev => ({ ...prev, isReady: false }));
      return;
    }

    // Check if both players have loaded (duration > 0)
    if (vocalPlayer.duration > 0 && instrPlayer.duration > 0) {
      const durationSec = vocalPlayer.duration / 1000;
      setState(prev => ({
        ...prev,
        isReady: true,
        duration: durationSec,
        isLoading: false,
      }));

      // Apply initial mix
      applyMixInternal(DEFAULT_MIX);
    }
  }, [vocalPlayer.duration, instrPlayer.duration, vocalSource, instrSource]);

  // Sync play state from vocal player (master)
  useEffect(() => {
    setState(prev => ({ ...prev, isPlaying: vocalPlayer.playing }));
  }, [vocalPlayer.playing]);

  // Sync current time from vocal player
  useEffect(() => {
    if (!isSeeking.current) {
      setState(prev => ({
        ...prev,
        currentTime: vocalPlayer.currentTime / 1000,
      }));
    }
  }, [vocalPlayer.currentTime]);

  // Start sync monitor to keep tracks aligned
  const startSyncMonitor = useCallback(() => {
    if (syncInterval.current) clearInterval(syncInterval.current);

    syncInterval.current = setInterval(() => {
      if (!state.isPlaying) return;

      const vocalTime = vocalPlayer.currentTime;
      const instrTime = instrPlayer.currentTime;
      const diff = Math.abs(vocalTime - instrTime);

      // If drift > 50ms, sync instrumental to vocal
      if (diff > SYNC_TOLERANCE_MS) {
        console.log(`[Karaoke Sync] Drift: ${diff}ms, re-syncing...`);
        instrPlayer.seekTo(vocalTime);
      }
    }, 1000);
  }, [state.isPlaying, vocalPlayer, instrPlayer]);

  // Cleanup sync interval
  useEffect(() => {
    return () => {
      if (syncInterval.current) clearInterval(syncInterval.current);
    };
  }, []);

  // Toggle play/pause (synced)
  const togglePlay = useCallback(() => {
    if (!state.isReady) return;

    if (state.isPlaying) {
      vocalPlayer.pause();
      instrPlayer.pause();
    } else {
      // Re-sync before playing
      const positionMs = state.currentTime * 1000;
      vocalPlayer.seekTo(positionMs);
      instrPlayer.seekTo(positionMs);
      
      vocalPlayer.play();
      instrPlayer.play();
      
      startSyncMonitor();
    }
  }, [state.isReady, state.isPlaying, state.currentTime, vocalPlayer, instrPlayer, startSyncMonitor]);

  const play = useCallback(() => {
    if (!state.isReady || state.isPlaying) return;
    
    const positionMs = state.currentTime * 1000;
    vocalPlayer.seekTo(positionMs);
    instrPlayer.seekTo(positionMs);
    
    vocalPlayer.play();
    instrPlayer.play();
    startSyncMonitor();
  }, [state.isReady, state.isPlaying, state.currentTime, vocalPlayer, instrPlayer, startSyncMonitor]);

  const pause = useCallback(() => {
    if (!state.isReady || !state.isPlaying) return;
    
    vocalPlayer.pause();
    instrPlayer.pause();
    
    if (syncInterval.current) clearInterval(syncInterval.current);
  }, [state.isReady, state.isPlaying, vocalPlayer, instrPlayer]);

  const seekTo = useCallback((seconds: number) => {
    if (!state.isReady || isSeeking.current) return;
    
    isSeeking.current = true;
    const millis = seconds * 1000;
    
    vocalPlayer.seekTo(millis);
    instrPlayer.seekTo(millis);
    
    setState(prev => ({ ...prev, currentTime: seconds }));
    
    // Reset seeking flag after a short delay
    setTimeout(() => {
      isSeeking.current = false;
    }, 100);
  }, [state.isReady, vocalPlayer, instrPlayer]);

  // Apply volume mix
  const applyMixInternal = useCallback((
    settings: KaraokeMixSettings,
    vPlayer = vocalPlayer,
    iPlayer = instrPlayer
  ) => {
    if (!vPlayer || !iPlayer) return;

    // Calculate volumes based on balance
    let vVol = settings.vocalVolume;
    let iVol = settings.instrumentalVolume;

    if (settings.balance < 0) {
      // Left: Favor vocals, reduce instruments
      iVol = settings.instrumentalVolume * (1 + settings.balance);
    } else if (settings.balance > 0) {
      // Right: Favor instruments, reduce vocals (Karaoke mode)
      vVol = settings.vocalVolume * (1 - settings.balance);
    }

    // Clamp to 0-2 range (allow boost up to 2x)
    vVol = Math.max(0, Math.min(2, vVol));
    iVol = Math.max(0, Math.min(2, iVol));

    vPlayer.volume = vVol;
    iPlayer.volume = iVol;
  }, [vocalPlayer, instrPlayer]);

  const setBalance = useCallback((value: number) => {
    const clampedBalance = Math.max(-1, Math.min(1, value));
    const newSettings = { ...mixSettings, balance: clampedBalance };
    setMixSettings(newSettings);
    applyMixInternal(newSettings);
  }, [mixSettings, applyMixInternal]);

  const updateMix = useCallback((newMix: Partial<KaraokeMixSettings>) => {
    const updated = { ...mixSettings, ...newMix };
    setMixSettings(updated);
    applyMixInternal(updated);
  }, [mixSettings, applyMixInternal]);

  return {
    // State
    ...state,
    mixSettings,

    // Actions
    togglePlay,
    play,
    pause,
    seekTo,
    setBalance,
    updateMix,

    // Helpers
    isKaraokeMode: state.hasStems,
  };
};
