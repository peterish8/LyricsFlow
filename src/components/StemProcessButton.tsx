/**
 * Stem Process Button
 * Triggers AI separation and shows progress
 */

import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    View,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/colors';
import { Song } from '../types/song';

interface StemProcessButtonProps {
    song: Song;
    onProcess: () => void;
    onCancel: () => void;
}

export const StemProcessButton: React.FC<StemProcessButtonProps> = ({
    song,
    onProcess,
    onCancel,
}) => {
    const { separationStatus, separationProgress } = song;

    const isProcessing = separationStatus === 'processing' || separationStatus === 'pending';
    const isCompleted = separationStatus === 'completed';
    const isFailed = separationStatus === 'failed';

    if (isCompleted) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={['#00C853', '#00E676']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.badge}
                >
                    <Ionicons name="checkmark-circle" size={16} color={Colors.textPrimary} />
                    <Text style={styles.badgeText}>AI Stems Ready</Text>
                </LinearGradient>
            </View>
        );
    }

    if (isProcessing) {
        return (
            <TouchableOpacity style={styles.processingContainer} onPress={onCancel}>
                <ActivityIndicator size="small" color={Colors.accent} />
                <Text style={styles.processingText}>
                    Separating... {separationProgress}%
                </Text>
                <Text style={styles.cancelText}>Tap to cancel</Text>
            </TouchableOpacity>
        );
    }

    if (isFailed) {
        return (
            <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={onProcess}>
                <Ionicons name="refresh" size={18} color={Colors.textPrimary} />
                <Text style={styles.buttonText}>Retry Separation</Text>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity style={styles.button} onPress={onProcess}>
            <Ionicons name="cut" size={18} color={Colors.textPrimary} />
            <Text style={styles.buttonText}>Separate Vocals (AI)</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.accent,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        gap: 8,
    },
    retryButton: {
        backgroundColor: Colors.error,
    },
    buttonText: {
        color: Colors.textPrimary,
        fontWeight: '600',
        fontSize: 14,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 6,
    },
    badgeText: {
        color: Colors.textPrimary,
        fontWeight: '600',
        fontSize: 12,
    },
    processingContainer: {
        alignItems: 'center',
        padding: 12,
    },
    processingText: {
        color: Colors.textSecondary,
        marginTop: 8,
        fontSize: 14,
    },
    cancelText: {
        color: Colors.textSecondary,
        marginTop: 4,
        fontSize: 12,
        opacity: 0.7,
    },
});
