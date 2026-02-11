import { useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Song, KaraokeMixSettings } from '../types/song';

/**
 * � Karaoke Player Hook - Dual-track synchronized playback
 * 
 * Manages two audio players (Vocals + Instrumental) and ensures they stay in sync.
 * Uses expo-av for concurrent playback (NOT react-native-track-player which is sequential).
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

  // Refs to hold the actual Sound objects
  const vocalSound = useRef<Audio.Sound | null>(null);
  const instrSound = useRef<Audio.Sound | null>(null);
  const driftInterval = useRef<NodeJS.Timeout | null>(null);
  const isSeeking = useRef(false);

  // Check if stems exist
  useEffect(() => {
    const hasStems = !!(song?.vocalStemUri && song?.instrumentalStemUri);
    setState(prev => ({ ...prev, hasStems }));
  }, [song?.vocalStemUri, song?.instrumentalStemUri]);

  // 1. Initialization: Load both sounds
  useEffect(() => {
    let isMounted = true;

    const setupPlayer = async () => {
      // Unload previous
      if (vocalSound.current) {
        await vocalSound.current.unloadAsync();
        vocalSound.current = null;
      }
      if (instrSound.current) {
        await instrSound.current.unloadAsync();
        instrSound.current = null;
      }

      setState(prev => ({
        ...prev,
        isReady: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        isLoading: false,
      }));

      if (!song?.vocalStemUri || !song?.instrumentalStemUri) return;

      setState(prev => ({ ...prev, isLoading: true }));

      try {
        // Create both sounds
        const vocal = new Audio.Sound();
        const instr = new Audio.Sound();

        // Load concurrently
        await Promise.all([
          vocal.loadAsync(
            { uri: song.vocalStemUri },
            { shouldPlay: false, volume: 1.0 }
          ),
          instr.loadAsync(
            { uri: song.instrumentalStemUri },
            { shouldPlay: false, volume: 1.0 }
          ),
        ]);

        if (!isMounted) return;

        vocalSound.current = vocal;
        instrSound.current = instr;

        // Get duration from vocal track (master)
        const status = await vocal.getStatusAsync();
        if (status.isLoaded) {
          const durationSec = (status.durationMillis || 0) / 1000;
          setState(prev => ({
            ...prev,
            duration: durationSec,
            isReady: true,
            isLoading: false,
          }));
        }

        // Start the Drift Monitor
        startDriftMonitor();

        // Apply initial mix
        applyMixInternal(DEFAULT_MIX);

      } catch (e) {
        console.error("[KaraokePlayer] Failed to load stems", e);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    setupPlayer();

    return () => {
      isMounted = false;
      unloadPlayer();
    };
  }, [song?.id, song?.vocalStemUri, song?.instrumentalStemUri]);

  // 2. Playback Control: Synced Play/Pause
  const togglePlay = useCallback(async () => {
    if (!vocalSound.current || !instrSound.current) return;

    if (state.isPlaying) {
      await Promise.all([
        instrSound.current.pauseAsync(),
        vocalSound.current.pauseAsync()
      ]);
      setState(prev => ({ ...prev, isPlaying: false }));
    } else {
      // Re-sync before playing to ensure exact millisecond alignment
      const positionMs = state.currentTime * 1000;
      await Promise.all([
        vocalSound.current.playFromPositionAsync(positionMs),
        instrSound.current.playFromPositionAsync(positionMs),
      ]);
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [state.isPlaying, state.currentTime]);

  const play = useCallback(async () => {
    if (!vocalSound.current || !instrSound.current || state.isPlaying) return;
    
    const positionMs = state.currentTime * 1000;
    await Promise.all([
      vocalSound.current.playFromPositionAsync(positionMs),
      instrSound.current.playFromPositionAsync(positionMs),
    ]);
    setState(prev => ({ ...prev, isPlaying: true }));
  }, [state.currentTime, state.isPlaying]);

  const pause = useCallback(async () => {
    if (!vocalSound.current || !instrSound.current || !state.isPlaying) return;
    
    await Promise.all([
      vocalSound.current.pauseAsync(),
      instrSound.current.pauseAsync(),
    ]);
    setState(prev => ({ ...prev, isPlaying: false }));
  }, [state.isPlaying]);

  const seekTo = useCallback(async (seconds: number) => {
    if (!vocalSound.current || !instrSound.current || isSeeking.current) return;
    
    isSeeking.current = true;
    const millis = seconds * 1000;
    
    try {
      await Promise.all([
        vocalSound.current.setPositionAsync(millis),
        instrSound.current.setPositionAsync(millis),
      ]);
      setState(prev => ({ ...prev, currentTime: seconds }));
    } catch (error) {
      console.error('[KaraokePlayer] Seek failed:', error);
    } finally {
      isSeeking.current = false;
    }
  }, []);

  // 3. The Mixer Logic (The "Slider")
  // value: -1 (Vocals Only) <-> 0 (Both) <-> 1 (Karaoke/Instr Only)
  const applyMixInternal = async (
    settings: KaraokeMixSettings,
    vInstance: Audio.Sound | null = vocalSound.current,
    iInstance: Audio.Sound | null = instrSound.current
  ) => {
    if (!vInstance || !iInstance) return;

    // Calculate Volumes based on balance
    let vVol = settings.vocalVolume;
    let iVol = settings.instrumentalVolume;

    if (settings.balance < 0) {
      // Left: Favor vocals, reduce instruments
      iVol = settings.instrumentalVolume * (1 + settings.balance); // balance is negative
    } else if (settings.balance > 0) {
      // Right: Favor instruments, reduce vocals (Karaoke mode)
      vVol = settings.vocalVolume * (1 - settings.balance);
    }

    // Clamp to 0-2 range (allow boost up to 2x)
    vVol = Math.max(0, Math.min(2, vVol));
    iVol = Math.max(0, Math.min(2, iVol));

    try {
      await Promise.all([
        vInstance.setVolumeAsync(vVol),
        iInstance.setVolumeAsync(iVol),
      ]);
    } catch (error) {
      console.error('[KaraokePlayer] Failed to set volume:', error);
    }
  };

  const setBalance = useCallback((value: number) => {
    const clampedBalance = Math.max(-1, Math.min(1, value));
    const newSettings = { ...mixSettings, balance: clampedBalance };
    setMixSettings(newSettings);
    applyMixInternal(newSettings);
  }, [mixSettings]);

  const updateMix = useCallback((newMix: Partial<KaraokeMixSettings>) => {
    const updated = { ...mixSettings, ...newMix };
    setMixSettings(updated);
    applyMixInternal(updated);
  }, [mixSettings]);

  // 4. Drift Monitor (The "Sync Engine")
  // Keeps the two tracks aligned to within 50ms
  const startDriftMonitor = () => {
    if (driftInterval.current) clearInterval(driftInterval.current);

    driftInterval.current = setInterval(async () => {
      if (!state.isPlaying || !vocalSound.current || !instrSound.current) return;

      try {
        const vStatus = await vocalSound.current.getStatusAsync();
        const iStatus = await instrSound.current.getStatusAsync();

        if (vStatus.isLoaded && iStatus.isLoaded) {
          const diff = (vStatus.positionMillis || 0) - (iStatus.positionMillis || 0);

          // Update UI position from master (vocal)
          setState(prev => ({
            ...prev,
            currentTime: (iStatus.positionMillis || 0) / 1000,
          }));

          // If drift > 50ms, snap vocal to instrumental position
          if (Math.abs(diff) > SYNC_TOLERANCE_MS) {
            console.log(`[Karaoke Sync] Drift detected: ${diff}ms. Re-syncing...`);
            await vocalSound.current?.setPositionAsync(iStatus.positionMillis || 0);
          }

          // Check if finished
          if (vStatus.didJustFinish || iStatus.didJustFinish) {
            setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
          }
        }
      } catch (error) {
        // Ignore errors during status check (might be unloading)
      }
    }, 1000); // Check every second
  };

  const unloadPlayer = async () => {
    if (driftInterval.current) clearInterval(driftInterval.current);
    if (vocalSound.current) await vocalSound.current.unloadAsync();
    if (instrSound.current) await instrSound.current.unloadAsync();
  };

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
