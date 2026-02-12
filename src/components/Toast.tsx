/**
 * Simple Toast Component
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
}

export const ToastNotification: React.FC<ToastProps> = ({ message, visible, onHide }) => {
  const translateY = useSharedValue(-100);

  useEffect(() => {
    if (visible) {
      // Spring down
      translateY.value = withSpring(20);
      
      // Wait 3s then spring up
      const timeout = setTimeout(() => {
        translateY.value = withSpring(-100, {}, (finished) => {
          if (finished) runOnJS(onHide)();
        });
      }, 3000); // Increased to 3s for better readability

      return () => clearTimeout(timeout);
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[toastStyles.container, animatedStyle]}>
      <Ionicons name="checkmark-circle" size={20} color="#34C759" />
      <Text style={toastStyles.text}>{message}</Text>
    </Animated.View>
  );
};

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50, // Below header
    right: 20,
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

// Imperative Toast API
// This is a simple implementation. For production, consider using a Context or a library like react-native-toast-message
export const Toast = {
  show: (options: { type: 'success' | 'error'; text1: string; text2?: string }) => {
    // In a real app, you'd use an event emitter or context to trigger the toast
    // For now, we'll just log it since we are refactoring and might replace this
    // But since the code expects Toast.show, let's at least shim it or alert if critical
    // OR we can export a hook-based component as default and a static object
    console.log(`[Toast] ${options.type}: ${options.text1} - ${options.text2}`);
    if (options.type === 'error') {
       Alert.alert(options.text1, options.text2);
    }
  }
};
