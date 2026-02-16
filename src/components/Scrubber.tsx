import React from 'react';
import { View, StyleSheet, LayoutChangeEvent, TextInput } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  runOnJS, 
  useDerivedValue,
  withSpring,
  useAnimatedProps
} from 'react-native-reanimated';

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface ScrubberProps {
  currentTime: number; // seconds
  duration: number; // seconds
  onSeek: (seconds: number) => void;
}

const Scrubber: React.FC<ScrubberProps> = ({ currentTime, duration, onSeek }) => {
  const width = useSharedValue(0);
  const isScrubbing = useSharedValue(false);
  const scrubProgress = useSharedValue(0);
  
  // Sync shared value with props when NOT scrubbing
  useDerivedValue(() => {
    if (!isScrubbing.value && duration > 0) {
      scrubProgress.value = currentTime / duration;
    }
  }, [currentTime, duration]);

  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
  };

  const formatTime = (seconds: number): string => {
    'worklet';
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    // manual padStart for worklet
    const secsStr = secs < 10 ? `0${secs}` : `${secs}`;
    return `${mins}:${secsStr}`;
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isScrubbing.value = true;
    })
    .onUpdate((e) => {
      if (width.value > 0) {
        const newProgress = Math.max(0, Math.min(1, e.x / width.value));
        scrubProgress.value = newProgress;
      }
    })
    .onEnd(() => {
      const finalTime = scrubProgress.value * duration;
      runOnJS(onSeek)(finalTime);
      isScrubbing.value = false;
    });

  const tapGesture = Gesture.Tap().onEnd((e) => {
    if (width.value > 0) {
       const newProgress = Math.max(0, Math.min(1, e.x / width.value));
       scrubProgress.value = newProgress;
       const finalTime = newProgress * duration;
       runOnJS(onSeek)(finalTime);
    }
  });
  
  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${scrubProgress.value * 100}%`
  }));

  const animatedThumbStyle = useAnimatedStyle(() => ({
    left: `${scrubProgress.value * 100}%`,
    transform: [{ scale: withSpring(isScrubbing.value ? 1.5 : 1) }]
  }));

  // Reanimated Props for smooth text updates on UI thread
  const animatedCurrentTimeProps = useAnimatedProps(() => {
    const time = scrubProgress.value * duration;
    return {
      text: formatTime(time)
    } as any;
  });

  // Display static duration
  const durationText = formatTime(duration);

  return (
    <View style={styles.container}>
      <GestureDetector gesture={composedGesture}>
        {/* Hit Slop Area */}
        <View style={styles.hitArea} onLayout={onLayout}>
           <View style={styles.track}>
             <Animated.View style={[styles.fill, animatedFillStyle]} />
             <Animated.View style={[styles.thumb, animatedThumbStyle]} />
           </View>
        </View>
      </GestureDetector>
      
      <View style={styles.timeContainer}>
        {/* Animated Current Time */}
        <AnimatedTextInput 
          editable={false}
          style={styles.timeText} 
          animatedProps={animatedCurrentTimeProps}
          value={formatTime(currentTime)} // Fallback / Initial
        />
        {/* Static Duration */}
        <TextInput 
          editable={false}
          style={styles.timeText} 
          value={durationText}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  hitArea: {
    height: 40, 
    justifyContent: 'center',
  },
  track: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)', 
    borderRadius: 2,
    position: 'relative',
    overflow: 'visible',
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8, 
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontVariant: ['tabular-nums'],
    padding: 0,
    margin: 0,
  },
});

export default React.memo(Scrubber);
