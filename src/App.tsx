/**
 * LyricFlow - Main App Entry Point
 */

import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation';
import { initDatabase } from './database/db';
import { useSongsStore } from './store/songsStore';
import { Colors } from './constants/colors';
import { PlayerProvider } from './contexts/PlayerContext';

const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSongs = useSongsStore((state) => state.fetchSongs);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize database
        await initDatabase();
        
        // Fetch initial songs
        await fetchSongs();
        
        setIsReady(true);
      } catch (err) {
        console.error('Initialization error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsReady(true);
      }
    };

    initialize();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" backgroundColor={Colors.background} />
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <PlayerProvider>
          <RootNavigator />
        </PlayerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});

export default App;
