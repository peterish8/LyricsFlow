# Dual-Track Audio Playback Guide

## Overview
Implementation of synchronized dual-track playback for AI Karaoke feature using expo-audio.

## Architecture

### Components
1. **Vocal Track**: Master clock (source of truth for position)
2. **Instrumental Track**: Follower track with drift correction
3. **Sync Engine**: 50ms tolerance, 1-second correction intervals
4. **Mix Controller**: Real-time volume adjustment based on balance slider

## Hook: useKaraokePlayer

```typescript
const { 
  isReady, 
  isPlaying, 
  currentTime, 
  duration, 
  mixSettings,
  togglePlay, 
  seekTo, 
  setBalance 
} = useKaraokePlayer(song);
```

### Key Features
- Dual expo-audio player instances
- 50ms drift detection
- Real-time volume mixing
- Seek synchronization
- Play/pause sync

## Implementation Details

### Player Creation
```typescript
const vocalSource: AudioSource = { uri: song.vocalStemUri };
const instrSource: AudioSource = { uri: song.instrumentalStemUri };

const vocalPlayer = useAudioPlayer(vocalSource);
const instrPlayer = useAudioPlayer(instrSource);
```

### Sync Monitoring
```typescript
const startSyncMonitor = () => {
  syncInterval.current = setInterval(() => {
    if (!state.isPlaying) return;
    
    const vocalTime = vocalPlayer.currentTime;
    const instrTime = instrPlayer.currentTime;
    const diff = Math.abs(vocalTime - instrTime);
    
    // If drift > 50ms, sync instrumental to vocal
    if (diff > SYNC_TOLERANCE_MS) {
      instrPlayer.seekTo(vocalTime);
    }
  }, 1000); // Check every second
};
```

### Volume Mixing
```typescript
const applyMix = (settings: KaraokeMixSettings) => {
  let vVol = settings.vocalVolume;
  let iVol = settings.instrumentalVolume;
  
  if (settings.balance < 0) {
    // Left: Favor vocals, reduce instruments
    iVol = settings.instrumentalVolume * (1 + settings.balance);
  } else if (settings.balance > 0) {
    // Right: Favor instruments, reduce vocals
    vVol = settings.vocalVolume * (1 - settings.balance);
  }
  
  // Clamp to 0-2 range (allow boost)
  vVol = Math.max(0, Math.min(2, vVol));
  iVol = Math.max(0, Math.min(2, iVol));
  
  vocalPlayer.volume = vVol;
  instrPlayer.volume = iVol;
};
```

### Balance Slider Values
- `-1.0` = Vocals only (karaoke mode off)
- `0.0` = Both at full volume (normal listening)
- `+1.0` = Instruments only (full karaoke mode)

## Seek Synchronization

```typescript
const seekTo = (seconds: number) => {
  const millis = seconds * 1000;
  
  vocalPlayer.seekTo(millis);
  instrPlayer.seekTo(millis);
  
  setState(prev => ({ ...prev, currentTime: seconds }));
};
```

## Play/Pause Sync

```typescript
const togglePlay = () => {
  if (state.isPlaying) {
    vocalPlayer.pause();
    instrPlayer.pause();
    clearInterval(syncInterval.current);
  } else {
    vocalPlayer.play();
    instrPlayer.play();
    startSyncMonitor();
  }
};
```

## UI: VocalBalanceSlider

### Visual Design
- Gradient: Red (vocals) → White (center) → Teal (karaoke)
- Tap zones for quick selection
- Real-time percentage display
- Smooth spring animations

### Implementation
```typescript
<VocalBalanceSlider
  value={mixSettings.balance}
  onValueChange={setBalance}
  onSlidingComplete={updateMix}
/>
```

## Critical Implementation Notes

### Why expo-audio (not expo-av or track-player)?
- **expo-av**: Deprecated after SDK 54
- **react-native-track-player**: Queue-based, cannot play two tracks simultaneously
- **expo-audio**: Supports multiple concurrent players with independent control

### Hook Rules Compliance
- `useAudioPlayer()` is called at component top-level (not in class methods)
- Cannot be used in AudioConverter service (must use direct AudioPlayer class)
- Song changes trigger automatic player recreation

### Performance Considerations
- Sync interval: 1000ms (balances accuracy vs battery)
- Drift tolerance: 50ms (imperceptible to human ear)
- Volume updates: Immediate (no debounce needed)
- Seek debounce: 100ms (prevents rapid seek spam)

## Error Handling

### Track Load Failure
```typescript
if (!vocalPlayer.duration || !instrPlayer.duration) {
  setState(prev => ({ ...prev, isReady: false }));
  // Show error UI
}
```

### Drift Correction Failure
```typescript
// If seek fails, just log and continue
// Next sync interval will correct again
try {
  instrPlayer.seekTo(vocalPlayer.currentTime);
} catch (error) {
  console.error('[Karaoke] Sync correction failed:', error);
}
```

## Testing

### Manual Test Cases
1. Play/pause both tracks sync
2. Seek maintains sync
3. Balance slider adjusts volumes
4. Background separation continues while playing
5. App backgrounding pauses playback
6. 50ms+ drift triggers correction

### Automated Tests
```typescript
test('drift correction', () => {
  const vocalTime = 10000;
  const instrTime = 10060; // 60ms drift
  
  startSyncMonitor();
  jest.advanceTimersByTime(1000);
  
  expect(instrPlayer.seekTo).toHaveBeenCalledWith(vocalTime);
});
```

## Future Enhancements

- Pitch shift for vocal track (karaoke game mode)
- Real-time reverb/delay effects
- Multi-track support (vocals + drums + bass + other)
- Automatic key detection and adjustment
