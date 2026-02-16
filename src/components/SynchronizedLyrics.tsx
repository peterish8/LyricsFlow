import React, { useEffect, useRef, useCallback } from 'react';
import { View, FlatList, Dimensions, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  interpolateColor, 
  interpolate,
  Extrapolation 
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
// ITEM_HEIGHT removed as unused

// ------------------------------------------------------------------
// Step 1: The Animated <LyricLine> Component
// ------------------------------------------------------------------

interface LyricLineProps {
  text: string;
  isActive: boolean;
  isPassed: boolean;
  onPress: () => void;
  textStyle?: any;
}

const LyricLine = React.memo(({ text, isActive, isPassed, onPress, textStyle, songTitle, highlightColor = '#FFD700' }: LyricLineProps & { songTitle?: string, highlightColor?: string }) => {
  // Shared value to drive animations (0 = inactive, 1 = active)
  const activeValue = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    activeValue.value = withTiming(isActive ? 1 : 0, { duration: 150 });
  }, [isActive, activeValue]);

  const animatedStyle = useAnimatedStyle(() => {
    // Interpolate Scale: 1.0 -> 1.1
    const scale = interpolate(activeValue.value, [0, 1], [1.0, 1.1], Extrapolation.CLAMP);

    // Interpolate Opacity: 
    // If active (1) -> 1.0
    // If inactive (0) -> isPassed ? 0.4 : 0.2
    const targetOpacity = isPassed ? 0.6 : 0.3; // Tweaked for better visibility on dark bg
    const opacity = interpolate(activeValue.value, [0, 1], [targetOpacity, 1.0], Extrapolation.CLAMP);

    // Interpolate Color: Dimmed -> Bright White
    const color = interpolateColor(
        activeValue.value,
        [0, 1],
        ['rgba(255,255,255,0.7)', '#FFFFFF']
    );
    
    return {
      transform: [{ scale }],
      opacity,
      color,
    };
  });
  
  // Word Splitting & Highlighting Logic - MEMOIZED to prevent processing on every active toggle
  const renderedWords = React.useMemo(() => {
      if (!songTitle) return text;

      const words = text.split(' ');
      // Filter out empty strings from the title words
      const titleWords = songTitle.toLowerCase().split(' ')
          .map(w => w.replace(/[^a-z0-9]/g, ''))
          .filter(w => w.length > 0);
      
      return words.map((word, index) => {
          // Strictly clean the word (remove punctuation)
          const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          // STRICT MATCH: The clean word must be in the title words list.
          const isMatch = cleanWord.length > 0 && titleWords.includes(cleanWord);
          
          if (!isMatch) {
              return <Text key={index}>{word} </Text>;
          }
          
          // Glowing Style for Matched Words using the Dynamic Color
          return (
              <Text 
                key={index} 
                style={{
                    color: '#FFFFFF', // Bright White for sparkle
                    textShadowColor: highlightColor, // Colored Glow from cover art
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 20, // Increased radius for softer, stronger glow
                    fontWeight: '900',
                    opacity: 1, // Ensure full opacity for pop
                }}
              >
                {word}{' '}
              </Text>
          );
      });
  }, [text, songTitle, highlightColor]);

  return (
    <Pressable onPress={onPress}>
      <Animated.Text style={[styles.lyricText, textStyle, animatedStyle]}>
        {renderedWords}
      </Animated.Text>
    </Pressable>
  );
});

// ------------------------------------------------------------------
// Step 2: The Synchronized FlatList
// ------------------------------------------------------------------

interface SynchronizedLyricsProps {
  lyrics: { timestamp: number; text: string }[];
  currentTime: number;
  onLyricPress: (timestamp: number) => void;
  isUserScrolling?: boolean; // Optional: pause auto-scroll if user is interacting
  onScrollStateChange?: (isScrolling: boolean) => void;
  headerContent?: React.ReactNode;
  textStyle?: any;
  scrollEnabled?: boolean;
  activeLinePosition?: number; // 0.0 to 1.0 (default 0.5)
  songTitle?: string;
  highlightColor?: string;
  topSpacerHeight?: number;
  bottomSpacerHeight?: number;
}

const SynchronizedLyrics: React.FC<SynchronizedLyricsProps> = ({ 
  lyrics, 
  currentTime, 
  onLyricPress, 
  isUserScrolling = false,
  onScrollStateChange,
  headerContent,
  textStyle,
  scrollEnabled = true,
  activeLinePosition = 0.5, // Default to center
  songTitle,
  highlightColor,
  topSpacerHeight = SCREEN_HEIGHT * 0.4,
  bottomSpacerHeight = SCREEN_HEIGHT * 0.4
}) => {
  const flatListRef = useRef<FlatList>(null);
  const [isLayoutReady, setIsLayoutReady] = React.useState(false);
  const hasInitialScrolled = useRef(false);
  
  // Find active index based on time
  // Compensation: Add 1.5s to currentTime to anticipate the line change (Dynamic Offset Fix)
  // This counteracts the animation delay + polling interval + inherent player latency
  const effectiveTime = currentTime + 1.5;

  const activeIndex = lyrics.findIndex((line, index) => {
    const nextLine = lyrics[index + 1];
    return effectiveTime >= line.timestamp && (!nextLine || effectiveTime < nextLine.timestamp);
  });

  // Opacity for smooth reveal
  const containerOpacity = useSharedValue(0);
  
  const containerStyle = useAnimatedStyle(() => {
     return {
         opacity: withTiming(containerOpacity.value, { duration: 200 }) // Faster fade (was 300)
     };
  });

  // ⚡ COMPREHENSIVE SCROLL CONTROL
  useEffect(() => {
    if (!isLayoutReady || isUserScrolling || !flatListRef.current) return;

    const isValidIndex = activeIndex >= 0 && activeIndex < lyrics.length;
    // If invalid index, just show anyway? Or stay hidden?
    // Better to show.
    if (!isValidIndex) {
        containerOpacity.value = 1;
        return;
    }

    // SCROLL LOGIC
    const performScroll = (isInitial = false) => {
        if (!flatListRef.current) return;

        try {
            flatListRef.current.scrollToIndex({
                index: activeIndex,
                animated: !isInitial, // Instant for first jump
                viewPosition: activeLinePosition,
            });
            if (isInitial) {
                // Confirm success? Hard to know for sure, but we assume if no error thrown
                hasInitialScrolled.current = true;
                
                // DELAYED REVEAL: Reduced to minimum to render frame but feel instant
                // This prevents seeing the "jump" or the top of the list
                // User requested "no delay".
                containerOpacity.value = 1; // trigger animation immediately via useAnimatedStyle or just set current?
                // Actually containerOpacity is a sharedValue used in useAnimatedStyle withTiming.
                // If we set it to 1, it will animate.
                // We'll remove the timeout effectively.
                requestAnimationFrame(() => {
                     containerOpacity.value = 1;
                }); 
            }
        } catch (e) {
            console.log('[SynchronizedLyrics] Scroll failed:', e);
            // If failed, we don't set hasInitialScrolled to true, so it will retry
        }
    };

    if (!hasInitialScrolled.current) {
        // First jump - aggressive retry strategy
        const timers = [
            setTimeout(() => performScroll(true), 50),
            setTimeout(() => performScroll(true), 250),
            setTimeout(() => performScroll(true), 500) // Fallback
        ];
        
        // Safety: Visual fallback if scroll fails entirely after 1s
        const safetyReveal = setTimeout(() => {
             if (containerOpacity.value === 0) containerOpacity.value = 1;
        }, 1000);

        return () => {
             timers.forEach(t => clearTimeout(t));
             clearTimeout(safetyReveal);
        };
    } else {
        // Normal progression - only when index changes
        performScroll(false);
    }
  }, [activeIndex, isLayoutReady, isUserScrolling, lyrics.length, activeLinePosition]);

  const renderItem = useCallback(({ item, index }: { item: { timestamp: number; text: string }; index: number }) => {
    const isActive = index === activeIndex;
    const isPassed = index < activeIndex;

    return (
      <LyricLine 
        text={item.text}
        isActive={isActive}
        isPassed={isPassed}
        onPress={() => onLyricPress(item.timestamp)}
        textStyle={textStyle}
        songTitle={songTitle}
        highlightColor={highlightColor}
      />
    );
  }, [activeIndex, onLyricPress, textStyle, songTitle, highlightColor]);

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <MaskedView
        style={styles.maskedView}
        maskElement={
          <LinearGradient
            colors={['transparent', 'black', 'black', 'transparent']}
            locations={[0, 0.15, 0.85, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <FlatList
          ref={flatListRef}
          onLayout={() => setIsLayoutReady(true)}
          data={lyrics}
          keyExtractor={(item, index) => `${index}_${item.timestamp}`}
          renderItem={renderItem}
          scrollEnabled={scrollEnabled}
          ListHeaderComponent={
            <View>
                <View style={{ height: topSpacerHeight }} />
                {headerContent}
            </View>
          }
          ListFooterComponent={<View style={{ height: bottomSpacerHeight }} />}
          onScrollBeginDrag={() => onScrollStateChange?.(true)}
          onMomentumScrollEnd={() => onScrollStateChange?.(false)}
          onScrollEndDrag={() => {
              // Safety timeout to resume if momentum doesn't fire (e.g. slight drag)
              setTimeout(() => onScrollStateChange?.(false), 2000);
          }}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={(info) => {
            const wait = new Promise(resolve => setTimeout(resolve, 500));
            wait.then(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: activeLinePosition });
              // Also reveal on fail-recovery
              containerOpacity.value = 1;
            });
          }}
          // Optimization: getItemLayout Removed. 
          // Lyrics have variable height (wrapping), so fixed height causes massive scroll errors.
          // Reliance on onScrollToIndexFailed and retry logic is better for accuracy (if numToRender is high enough).
          removeClippedSubviews={Platform.OS === 'android'} // Force cleanup on Android
          initialNumToRender={50} // High enough to cover early song, low enough to stop jitter
          maxToRenderPerBatch={50}
          windowSize={15}
        />
      </MaskedView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  maskedView: {
    flex: 1,
    height: '100%',
    width: '100%',
  },
  lyricText: {
    fontSize: 28, // Slightly larger for main view
    fontWeight: '800', // Apple uses very heavy weights for active
    textAlign: 'left',
    marginVertical: 16,
    paddingHorizontal: 32,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  }
});

export default SynchronizedLyrics;
