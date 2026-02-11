/**
 * LyricFlow - Navigation Type Definitions
 */

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';

// Root Stack Navigator
export type RootStackParamList = {
  Main: undefined;
  NowPlaying: { songId: string };
  AddEditLyrics: { songId?: string }; // undefined = add new, string = edit existing
  Search: undefined;
};

// Bottom Tab Navigator
export type TabParamList = {
  Library: undefined;
  Liked: undefined;
  Settings: undefined;
};

// Screen Props
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
