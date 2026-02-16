import React, { useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  runOnJS, 
  withSpring, 
  useDerivedValue
} from 'react-native-reanimated';

interface IslandScrubberProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

const IslandScrubber: React.FC<IslandScrubberProps> = ({ 
  currentTime, 
  duration, 
  onSeek,
  onScrubStart,
  onScrubEnd
}) => {
  const [width, setWidth] = useState(0);
  const isScrubbing = useSharedValue(false);
  const scrubProgress = useSharedValue(0);

  // Sync with prop when not scrubbing
  useDerivedValue(() => {
    if (!isScrubbing.value && duration > 0) {
      scrubProgress.value = currentTime / duration;
    }
  }, [currentTime, duration]);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isScrubbing.value = true;
      if (onScrubStart) runOnJS(onScrubStart)();
    })
    .onUpdate((e) => {
      if (width > 0) {
        // Calculate progress based on touch position relative to the bar
        // We need to account for the touch starting anywhere? 
        // Actually, e.x is relative to the view usually if strictly defined, 
        // but for a small scrubber, it's better to verify.
        // Let's assume standard behavior: e.x is relative to the hit view.
        // However, dragging outside bounds should clamp.
        const newProgress = Math.max(0, Math.min(1, e.x / width));
        scrubProgress.value = newProgress;
        
        // Optional: Live seek (might be heavy)
        // if (onSeek) runOnJS(onSeek)(newProgress * duration); 
      }
    })
    .onEnd(() => {
      const finalTime = scrubProgress.value * duration;
      if (onSeek) runOnJS(onSeek)(finalTime);
      if (onScrubEnd) runOnJS(onScrubEnd)();
      isScrubbing.value = false;
    });

  const animatedTrackStyle = useAnimatedStyle(() => {
    return {
      width: `${Math.max(0, Math.min(100, scrubProgress.value * 100))}%`
    };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    // Thumb grows when scrubbing
    const scale = withSpring(isScrubbing.value ? 1.5 : 1);
    return {
        left: `${Math.max(0, Math.min(100, scrubProgress.value * 100))}%`,
        transform: [
            { scale }
        ] as any // Cast to any to avoid Reanimated type strictness issues with transform arrays
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container} onLayout={onLayout} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        {/* Background Track - "Faded Blended" (Semi-transparent white/gray) */}
        <View style={styles.trackBackground}>
           {/* Progress Fill - Brighter but still blended */}
           <Animated.View style={[styles.trackFill, animatedTrackStyle]} />
        </View>

        {/* Thumb / Knob - Standard Apple Music White Knob */}
        <Animated.View style={[styles.thumb, animatedThumbStyle]} />
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 20, // Hit area
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 0, // Edge to edge? Or typically has margins. Handled by parent.
  },
  trackBackground: {
    height: 4, // Thinner for elegance
    backgroundColor: 'rgba(0, 0, 0, 0.2)', // Dark Glass: Darkens the underlying cover art color -> "Faded blended" look
    borderRadius: 4, // Fully rounded
    overflow: 'hidden',
    width: '100%',
  },
  trackFill: {
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.8)', // Brighter fill
    borderRadius: 4,
  },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff', // Pure white thumb pops
    marginLeft: -6, // Center on the point
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  }
});

export default IslandScrubber;
