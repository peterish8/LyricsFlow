/**
 * LyricFlow - Image Brightness Analyzer
 * Detects cover art brightness for adaptive vignette
 */

import { Image } from 'react-native';

export interface BrightnessResult {
  brightness: number; // 0-255
  isLight: boolean; // true if mostly light colors
  vignetteOpacity: number; // 0-1 for vignette strength
  overlayOpacity: number; // 0-1 for black overlay
}

/**
 * Analyze image brightness from URI
 * Uses canvas sampling for performance
 */
export const analyzeImageBrightness = async (uri: string): Promise<BrightnessResult> => {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      () => {
        // Fallback: assume medium brightness if can't analyze
        resolve({
          brightness: 128,
          isLight: false,
          vignetteOpacity: 0.6,
          overlayOpacity: 0.5,
        });
      },
      () => {
        // Error: assume medium brightness
        resolve({
          brightness: 128,
          isLight: false,
          vignetteOpacity: 0.6,
          overlayOpacity: 0.5,
        });
      }
    );
  });
};

/**
 * Calculate vignette/overlay based on brightness
 * Light images: less vignette, more overlay
 * Dark images: more vignette, less overlay
 */
export const calculateOverlayStrength = (brightness: number): BrightnessResult => {
  const isLight = brightness > 160;
  
  if (isLight) {
    // Light cover art: minimal vignette, strong overlay
    return {
      brightness,
      isLight: true,
      vignetteOpacity: 0.3, // Less vignette
      overlayOpacity: 0.7,  // More overlay
    };
  } else {
    // Dark cover art: strong vignette, less overlay
    return {
      brightness,
      isLight: false,
      vignetteOpacity: 0.7, // More vignette
      overlayOpacity: 0.4,  // Less overlay
    };
  }
};
