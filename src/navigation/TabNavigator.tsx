/**
 * LyricFlow - Tab Navigator
 * Bottom tab navigation for Library, Search, Settings
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { TabParamList } from '../types/navigation';
import { Colors } from '../constants/colors';
import { CustomTabBar } from '../components';
import { ModernPillTabBar } from '../components/ModernPillTabBar';
import { useSettingsStore } from '../store/settingsStore';

// Import screens
import LibraryScreen from '../screens/LibraryScreen';
import ReelsScreen from '../screens/ReelsScreen';
import PlaylistsScreen from '../screens/PlaylistsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<TabParamList>();

export const TabNavigator: React.FC = () => {
  const navBarStyle = useSettingsStore(state => state.navBarStyle);
  const miniPlayerStyle = useSettingsStore(state => state.miniPlayerStyle);
  const setMiniPlayerStyle = useSettingsStore(state => state.setMiniPlayerStyle);

  // Auto-enable Dynamic Island when Modern Pill navbar is active
  React.useEffect(() => {
    if (navBarStyle === 'modern-pill' && miniPlayerStyle === 'bar') {
      setMiniPlayerStyle('island');
    }
  }, [navBarStyle, miniPlayerStyle, setMiniPlayerStyle]);

  return (
    <Tab.Navigator
      tabBar={(props) => <ModernPillTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.textPrimary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarShowLabel: false, // Hide all labels
      }}
    >
      <Tab.Screen
        name="Home"
        component={LibraryScreen}
        listeners={{
          focus: () => setMiniPlayerStyle('island'),
        }}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Reels"
        component={ReelsScreen}
        listeners={{
          focus: () => setMiniPlayerStyle('island'),
        }}
        options={{
          tabBarLabel: 'Reels',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'flame' : 'flame-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Library"
        component={PlaylistsScreen}
        listeners={{
          focus: () => setMiniPlayerStyle('bar'),
        }}
        options={{
          tabBarLabel: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'library' : 'library-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        listeners={{
          focus: () => setMiniPlayerStyle('island'),
        }}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'settings' : 'settings-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#212121',
    borderTopColor: 'rgba(255,255,255,0.05)',
    height: 70,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
  },
});

export default TabNavigator;
