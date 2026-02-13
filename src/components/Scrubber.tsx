import React from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';

interface ScrubberProps {
  currentTime: number; // seconds
  duration: number; // seconds
  onSeek: (seconds: number) => void;
}

const Scrubber: React.FC<ScrubberProps> = ({ currentTime, duration, onSeek }) => {
  const scrubberWidth = useSharedValue(0);
  
  // ✅ Safe progress calculation
  const progress = duration > 0 && !isNaN(currentTime) && currentTime >= 0
    ? Math.min(Math.max(currentTime / duration, 0), 1)
    : 0;
  
  const formatTime = (seconds: number): string => {
    // ✅ Handle invalid values
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Drag gesture
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scrubberWidth.value > 0 && duration > 0) {
        const position = Math.max(0, Math.min(e.x, scrubberWidth.value));
        const percentage = position / scrubberWidth.value;
        const newTime = percentage * duration;
        // ✅ Validate before calling onSeek
        if (!isNaN(newTime) && newTime >= 0 && newTime <= duration) {
          runOnJS(onSeek)(newTime);
        }
      }
    });
  
  // Tap gesture
  const tapGesture = Gesture.Tap().onEnd((e) => {
    if (scrubberWidth.value > 0 && duration > 0) {
      const position = Math.max(0, Math.min(e.x, scrubberWidth.value));
      const percentage = position / scrubberWidth.value;
      const newTime = percentage * duration;
      // ✅ Validate before calling onSeek
      if (!isNaN(newTime) && newTime >= 0 && newTime <= duration) {
        runOnJS(onSeek)(newTime);
      }
    }
  });
  
  const composedGesture = Gesture.Race(panGesture, tapGesture);
  
  const handleLayout = (e: LayoutChangeEvent) => {
    scrubberWidth.value = e.nativeEvent.layout.width;
  };
  
  return (
    <View style={styles.container}>
      <GestureDetector gesture={composedGesture}>
        <View style={styles.track} onLayout={handleLayout}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          <View style={[styles.thumb, { left: `${progress * 100}%` }]} />
        </View>
      </GestureDetector>
      
      <View style={styles.timeContainer}>
        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  track: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    position: 'relative',
  },
  fill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  thumb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    position: 'absolute',
    top: -4,
    marginLeft: -6,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#888',
  },
});

export default Scrubber;
