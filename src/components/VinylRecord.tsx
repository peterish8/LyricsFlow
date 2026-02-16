
import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface VinylRecordProps {
  imageUri?: string;
  size?: number;
}

const VinylRecord: React.FC<VinylRecordProps> = ({ imageUri, size = 300 }) => {
  // Calculate relative sizes based on the main size
  const labelSize = size * 0.6; // Label is 60% of total diameter (bigger cover art)
  const holeSize = size * 0.03; // Center hole smaller
  
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {/* Main Vinyl Disc (Black base) */}
      <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
        {/* Grooves (Subtle concentric rings) */}
        {/* We use a repeating radial gradient simulation or just multiple borders/opacity layers */}
         <LinearGradient
          colors={['#111', '#222', '#111', '#222', '#111', '#000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        
        {/* Render some "groove" lines using borders for texture */}
        <View style={[styles.groove, { width: size * 0.95, height: size * 0.95, borderRadius: size * 0.95 / 2 }]} />
        <View style={[styles.groove, { width: size * 0.9, height: size * 0.9, borderRadius: size * 0.9 / 2 }]} />
        <View style={[styles.groove, { width: size * 0.85, height: size * 0.85, borderRadius: size * 0.85 / 2 }]} />
        <View style={[styles.groove, { width: size * 0.8, height: size * 0.8, borderRadius: size * 0.8 / 2 }]} />
        <View style={[styles.groove, { width: size * 0.75, height: size * 0.75, borderRadius: size * 0.75 / 2 }]} />
        <View style={[styles.groove, { width: size * 0.7, height: size * 0.7, borderRadius: size * 0.7 / 2 }]} />

        {/* Inner Label (Album Art) */}
        <View style={[styles.labelContainer, { width: labelSize, height: labelSize, borderRadius: labelSize / 2 }]}>
          {imageUri ? (
            <Image 
              source={{ uri: imageUri }} 
              style={[styles.albumArt, { width: labelSize, height: labelSize, borderRadius: labelSize / 2 }]} 
            />
          ) : (
            <View style={[styles.defaultLabel, { width: labelSize, height: labelSize, borderRadius: labelSize / 2 }]} />
          )}
        </View>

        {/* Center Hole */}
        <View style={[styles.centerHole, { width: holeSize, height: holeSize, borderRadius: holeSize / 2 }]} />
      </View>
      
      {/* Light Reflection/Shine Overlay for realism */}
      <LinearGradient
          colors={['rgba(255,255,255,0.0)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.reflection}
          pointerEvents="none"
        />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  disc: {
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  groove: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  labelContainer: {
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  albumArt: {
    resizeMode: 'cover',
  },
  defaultLabel: {
    backgroundColor: '#FF3B30', // Default red label if no art
  },
  centerHole: {
    position: 'absolute',
    backgroundColor: '#000', // Or simulate the spindle
    borderWidth: 2,
    borderColor: '#333',
  },
  reflection: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 1000,
  }
});

export default VinylRecord;
