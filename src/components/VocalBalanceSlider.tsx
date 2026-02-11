/**
 * Vocal Balance Slider
 * Apple Music Sing-style slider for vocal/instrumental balance
 */

import React from 'react';
import {
    View,
    StyleSheet,
    PanResponder,
    Animated,
    Text,
    GestureResponderEvent,
    PanResponderGestureState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface VocalBalanceSliderProps {
    balance: number; // -1 to 1
    onBalanceChange: (balance: number) => void;
    enabled: boolean;
}

const SLIDER_WIDTH = 280;
const KNOB_SIZE = 36;

export const VocalBalanceSlider: React.FC<VocalBalanceSliderProps> = ({
    balance,
    onBalanceChange,
    enabled,
}) => {
    // Convert balance (-1 to 1) to position (0 to SLIDER_WIDTH)
    const initialPosition = ((balance + 1) / 2) * SLIDER_WIDTH;
    const position = React.useRef(new Animated.Value(initialPosition)).current;

    // Update position when balance prop changes
    React.useEffect(() => {
        const newPosition = ((balance + 1) / 2) * SLIDER_WIDTH;
        position.setValue(newPosition);
    }, [balance]);

    const panResponder = React.useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => enabled,
                onMoveShouldSetPanResponder: () => enabled,
                onPanResponderGrant: () => {
                    position.stopAnimation();
                },
                onPanResponderRelease: (
                    event: GestureResponderEvent,
                    gestureState: PanResponderGestureState
                ) => {
                    // Calculate position based on touch location within slider
                    const { locationX } = event.nativeEvent;
                    const newX = Math.max(0, Math.min(SLIDER_WIDTH, locationX));
                    
                    // Animate to new position
                    Animated.spring(position, {
                        toValue: newX,
                        useNativeDriver: true,
                        friction: 8,
                        tension: 40,
                    }).start();
                    
                    // Convert to balance (-1 to 1)
                    const newBalance = (newX / SLIDER_WIDTH) * 2 - 1;
                    onBalanceChange(newBalance);
                },
            }),
        [enabled, onBalanceChange, position]
    );

    // Interpolate position for icon opacity
    const vocalOpacity = position.interpolate({
        inputRange: [0, SLIDER_WIDTH / 2, SLIDER_WIDTH],
        outputRange: [1, 0.5, 0.2],
        extrapolate: 'clamp',
    });

    const instrOpacity = position.interpolate({
        inputRange: [0, SLIDER_WIDTH / 2, SLIDER_WIDTH],
        outputRange: [0.2, 0.5, 1],
        extrapolate: 'clamp',
    });

    // Get current mode label
    const getModeLabel = () => {
        if (balance < -0.5) return 'VOCALS';
        if (balance > 0.5) return 'KARAOKE';
        return 'MIXED';
    };

    return (
        <View style={[styles.container, !enabled && styles.disabled]}>
            {/* Label */}
            <Text style={styles.label}>VOCAL BALANCE</Text>

            {/* Slider Track */}
            <View style={styles.sliderContainer} {...panResponder.panHandlers}>
                {/* Background gradient - Vocals (red/pink) to Instruments (teal/cyan) */}
                <LinearGradient
                    colors={['#FF6B6B', '#FFE5E5', '#4ECDC4']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.track}
                />

                {/* Icons */}
                <View style={styles.iconsContainer} pointerEvents="none">
                    <Animated.View style={{ opacity: vocalOpacity }}>
                        <Ionicons name="mic" size={20} color={Colors.textPrimary} />
                    </Animated.View>
                    <Animated.View style={{ opacity: instrOpacity }}>
                        <Ionicons name="musical-notes" size={20} color={Colors.textPrimary} />
                    </Animated.View>
                </View>

                {/* Draggable Knob */}
                <Animated.View
                    style={[
                        styles.knob,
                        {
                            transform: [
                                {
                                    translateX: position.interpolate({
                                        inputRange: [0, SLIDER_WIDTH],
                                        outputRange: [0, SLIDER_WIDTH],
                                        extrapolate: 'clamp',
                                    }),
                                },
                            ],
                        },
                    ]}
                    pointerEvents="none"
                >
                    <View style={styles.knobInner} />
                </Animated.View>
            </View>

            {/* Mode indicator */}
            <View style={styles.modeIndicator}>
                <Text style={[styles.modeText, balance < -0.5 && styles.modeActive]}>
                    VOCALS
                </Text>
                <Text style={[styles.modeText, Math.abs(balance) <= 0.5 && styles.modeActive]}>
                    MIXED
                </Text>
                <Text style={[styles.modeText, balance > 0.5 && styles.modeActive]}>
                    KARAOKE
                </Text>
            </View>

            {/* Tap zones for quick selection */}
            <View style={styles.tapZones}>
                <View 
                    style={styles.tapZone} 
                    onTouchEnd={() => enabled && onBalanceChange(-1)}
                />
                <View 
                    style={styles.tapZone} 
                    onTouchEnd={() => enabled && onBalanceChange(0)}
                />
                <View 
                    style={styles.tapZone} 
                    onTouchEnd={() => enabled && onBalanceChange(1)}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        paddingVertical: 20,
        width: SLIDER_WIDTH + 40,
    },
    disabled: {
        opacity: 0.4,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
        letterSpacing: 1.2,
        marginBottom: 12,
    },
    sliderContainer: {
        width: SLIDER_WIDTH,
        height: 44,
        justifyContent: 'center',
        position: 'relative',
    },
    track: {
        height: 8,
        borderRadius: 4,
        width: SLIDER_WIDTH,
    },
    iconsContainer: {
        position: 'absolute',
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: SLIDER_WIDTH,
        paddingHorizontal: 12,
        top: 12,
    },
    knob: {
        position: 'absolute',
        width: KNOB_SIZE,
        height: KNOB_SIZE,
        borderRadius: KNOB_SIZE / 2,
        backgroundColor: Colors.textPrimary,
        left: -KNOB_SIZE / 2,
        top: 4,
        shadowColor: Colors.background,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    knobInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.accent,
    },
    modeIndicator: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 20,
    },
    modeText: {
        fontSize: 11,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    modeActive: {
        color: Colors.textPrimary,
        fontWeight: '700',
    },
    tapZones: {
        position: 'absolute',
        flexDirection: 'row',
        width: SLIDER_WIDTH,
        height: 44,
        top: 20,
    },
    tapZone: {
        flex: 1,
        height: '100%',
    },
});
