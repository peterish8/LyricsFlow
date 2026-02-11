/**
 * LyricFlow - Scrubber/Seek Bar Component
 * Timeline progress bar with draggable thumb
 */

import React, { memo, useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
  withTiming,
  useDerivedValue,
} from 'react-native-reanimated';
import { formatTime } from '../utils/formatters';
import { usePlayerStore } from '../store/playerStore';

interface ScrubberProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

import { useSettingsStore } from '../store/settingsStore';

export const Scrubber: React.FC<ScrubberProps> = memo(({
  currentTime,
  duration,
  onSeek,
}) => {
  const [width, setWidth] = useState(0);
  const { showTimeRemaining, setShowTimeRemaining } = useSettingsStore();
  const { setIsScrubbing } = usePlayerStore();
  const isDragging = useSharedValue(false);
  const progress = useSharedValue(0); // 0 to 1
  const thumbScale = useSharedValue(1);

  // Sync progress with currentTime when not dragging
  useEffect(() => {
    if (!isDragging.value && duration > 0) {
      progress.value = currentTime / duration;
    }
  }, [currentTime, duration]);

  const handleSeekStart = () => {
    setIsScrubbing(true);
  };

  const handleSeekEnd = (value: number) => {
    const time = value * duration;
    onSeek(Math.max(0, Math.min(time, duration)));
    setIsScrubbing(false);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      thumbScale.value = withSpring(1.5);
      runOnJS(handleSeekStart)();
    })
    .onUpdate((e) => {
      if (width > 0) {
        // Clamp between 0 and 1
        const newProgress = Math.max(0, Math.min(1, e.x / width));
        progress.value = newProgress;
      }
    })
    .onEnd(() => {
      isDragging.value = false;
      thumbScale.value = withSpring(1);
      runOnJS(handleSeekEnd)(progress.value);
    });

  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      if (width > 0) {
        const newProgress = Math.max(0, Math.min(1, e.x / width));
        progress.value = withTiming(newProgress, { duration: 100 });
        runOnJS(handleSeekEnd)(newProgress);
      }
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (progress.value * width) - 6 }, // Center thumb (width 12 / 2)
      { scale: thumbScale.value }
    ],
  }));

  // Calculate remaining time for display
  // We can't use derived value easily for text unless we use ReText or similar
  // So we stick to prop based remaining time for now, might lag during scrub slightly
  // To make it smooth, we'd need ReText. For now, props update on seek end is standard.
  // If we want real-time update, we need onSeeking callback.
  const remaining = Math.max(0, duration - currentTime);

  return (
    <View style={styles.container}>
      {/* Progress Bar Area */}
      <GestureDetector gesture={composedGesture}>
        <View 
          style={styles.trackContainer}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        >
          {/* Background Track */}
          <View style={styles.track} />
          
          {/* Active Progress */}
          <Animated.View style={[styles.progress, progressStyle]} />
          
          {/* Thumb */}
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>

      {/* Time Labels */}
      <View style={styles.timeContainer}>
        <Text style={styles.time}>{formatTime(currentTime)}</Text>
        <Pressable onPress={() => setShowTimeRemaining(!showTimeRemaining)}>
          <Text style={styles.time}>
            {showTimeRemaining ? `-${formatTime(remaining)}` : formatTime(duration)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

Scrubber.displayName = 'Scrubber';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 8,
  },
  trackContainer: {
    height: 30, // Taller touch target
    justifyContent: 'center',
  },
  track: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    width: '100%',
    position: 'absolute',
  },
  progress: {
    height: 4,
    backgroundColor: '#fff',
    borderRadius: 2,
    position: 'absolute',
    left: 0,
  },
  thumb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    position: 'absolute',
    left: 0,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8, // Pull closer to track
  },
  time: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
});

export default Scrubber;
