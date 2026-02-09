/**
 * LyricFlow - Settings Store (Zustand)
 * Manages user preferences with AsyncStorage persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SortOption, ViewMode } from '../types/song';

type Theme = 'dark' | 'light' | 'auto';
type FontSize = 'small' | 'medium' | 'large';
type LineSpacing = 'compact' | 'normal' | 'relaxed';
type ScrollSpeed = 'slow' | 'medium' | 'fast';

interface SettingsState {
  // Appearance
  theme: Theme;
  defaultGradientId: string;
  lyricsFontSize: FontSize;
  lineSpacing: LineSpacing;
  
  // Playback
  scrollSpeed: ScrollSpeed;
  skipDuration: 10 | 15 | 30;
  keepScreenOn: boolean;
  
  // Library
  defaultView: ViewMode;
  defaultSort: SortOption;
  showThumbnails: boolean;
  
  // Actions
  setTheme: (theme: Theme) => void;
  setDefaultGradient: (gradientId: string) => void;
  setLyricsFontSize: (size: FontSize) => void;
  setLineSpacing: (spacing: LineSpacing) => void;
  setScrollSpeed: (speed: ScrollSpeed) => void;
  setSkipDuration: (duration: 10 | 15 | 30) => void;
  setKeepScreenOn: (enabled: boolean) => void;
  setDefaultView: (view: ViewMode) => void;
  setDefaultSort: (sort: SortOption) => void;
  setShowThumbnails: (show: boolean) => void;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS = {
  theme: 'dark' as Theme,
  defaultGradientId: 'aurora',
  lyricsFontSize: 'medium' as FontSize,
  lineSpacing: 'normal' as LineSpacing,
  scrollSpeed: 'medium' as ScrollSpeed,
  skipDuration: 15 as const,
  keepScreenOn: true,
  defaultView: 'grid' as ViewMode,
  defaultSort: 'recent' as SortOption,
  showThumbnails: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default values
      ...DEFAULT_SETTINGS,
      
      // Appearance actions
      setTheme: (theme) => set({ theme }),
      setDefaultGradient: (defaultGradientId) => set({ defaultGradientId }),
      setLyricsFontSize: (lyricsFontSize) => set({ lyricsFontSize }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
      
      // Playback actions
      setScrollSpeed: (scrollSpeed) => set({ scrollSpeed }),
      setSkipDuration: (skipDuration) => set({ skipDuration }),
      setKeepScreenOn: (keepScreenOn) => set({ keepScreenOn }),
      
      // Library actions
      setDefaultView: (defaultView) => set({ defaultView }),
      setDefaultSort: (defaultSort) => set({ defaultSort }),
      setShowThumbnails: (showThumbnails) => set({ showThumbnails }),
      
      // Reset
      resetToDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'lyricflow-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Font size mappings for use in components
export const FONT_SIZE_MAP = {
  small: { current: 28, other: 18 },
  medium: { current: 34, other: 22 },
  large: { current: 42, other: 28 },
};

// Line height mappings
export const LINE_SPACING_MAP = {
  compact: 1.4,
  normal: 1.75,
  relaxed: 2.0,
};
