/**
 * LyricFlow - Root Navigator
 * Stack navigation with tab navigator and modal screens
 */

import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { Colors } from '../constants/colors';

// Import navigators and screens
import TabNavigator from './TabNavigator';
import NowPlayingScreen from '../screens/NowPlayingScreen';
import AddEditLyricsScreen from '../screens/AddEditLyricsScreen';
import SearchScreen from '../screens/SearchScreen';
import { AudioDownloaderScreen } from '../screens/AudioDownloaderScreen';
import { YoutubeBrowserScreen } from '../screens/YoutubeBrowserScreen';
import { MiniPlayer } from '../components';
import { BackgroundDownloader } from '../components/BackgroundDownloader';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <View style={{ flex: 1 }}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'slide_from_bottom',
          }}
        >
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen
            name="NowPlaying"
            component={NowPlayingScreen}
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="AddEditLyrics"
            component={AddEditLyricsScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="Search"
            component={SearchScreen}
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="AudioDownloader"
            component={AudioDownloaderScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="YoutubeBrowser"
            component={YoutubeBrowserScreen}
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack.Navigator>
        
        <MiniPlayer />
        <BackgroundDownloader />
      </View>
    </NavigationContainer>
  );
};

export default RootNavigator;
