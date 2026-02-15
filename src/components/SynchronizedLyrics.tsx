import React, { useEffect, useRef, useMemo, useCallback } from 'react';
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
    activeValue.value = withTiming(isActive ? 1 : 0, { duration: 300 });
  }, [isActive]);

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
  
  // Word Splitting & Highlighting Logic
  const renderText = () => {
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
  };

  return (
    <Pressable onPress={onPress}>
      <Animated.Text style={[styles.lyricText, textStyle, animatedStyle]}>
        {renderText()}
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
  
  // Find active index based on time
  const activeIndex = lyrics.findIndex((line, index) => {
    const nextLine = lyrics[index + 1];
    return currentTime >= line.timestamp && (!nextLine || currentTime < nextLine.timestamp);
  });

  // Effect to scroll to active line
  // Effect to scroll to active line
  useEffect(() => {
    let isMounted = true;
    
    // Safety check: Ensure index is valid for current data
    const isValidIndex = activeIndex >= 0 && activeIndex < lyrics.length;

    if (isValidIndex && !isUserScrolling && flatListRef.current) {
      try {
          flatListRef.current.scrollToIndex({
            index: activeIndex,
            animated: true, 
            viewPosition: activeLinePosition, 
          });
      } catch (e) {
          console.warn('[SynchronizedLyrics] Scroll failed:', e);
      }
    }
    
    return () => { isMounted = false; };
  }, [activeIndex, isUserScrolling, lyrics.length]);

  // ⚡ Fix: Force scroll removed. It causes list jumps and "slow updates" warning on new song load.
  // The standard useEffect([activeIndex]) below handles it gracefully once layout is ready.
  /*
  useEffect(() => {
      if (activeIndex > 0 && !isUserScrolling) {
          setTimeout(() => {
              flatListRef.current?.scrollToIndex({
                  index: activeIndex,
                  animated: false, // Jump instantly on open
                  viewPosition: activeLinePosition,
              });
          }, 100);
      }
  }, []); 
  */

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
    <View style={styles.container}>
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
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            });
          }}
          // Optimization: getItemLayout helps FlatList calculate offset without measuring
          // We estimate 80px per item (Text + Margin)
          // getItemLayout={(data, index) => (
          //   {length: 80, offset: 80 * index, index}
          // )}
          removeClippedSubviews={Platform.OS === 'android'} // Force cleanup on Android
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={5}
        />
      </MaskedView>
    </View>
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
