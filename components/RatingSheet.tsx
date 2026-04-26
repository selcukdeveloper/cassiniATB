import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LakeFeature } from './LakesLayer';

type Props = {
  lake: LakeFeature | null;
  currentRating: number | undefined;
  onRate: (rating: number) => void;
  onClose: () => void;
};

export default function RatingSheet({ lake, currentRating, onRate, onClose }: Props) {
  if (!lake) return null;
  const { NAM, AREA, ALTITUDE, LAKID } = lake.properties;
  const areaKm2 = AREA != null ? (AREA / 1e6).toFixed(2) : null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps so they don't dismiss the sheet. */}
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          
          <View style={styles.header}>
            <Text style={styles.title}>{NAM ?? 'Unnamed lake'}</Text>
            <Text style={styles.meta}>
              {areaKm2 != null ? `${areaKm2} km²` : 'area unknown'}
              {ALTITUDE != null ? ` · ${Math.round(ALTITUDE)} m a.s.l.` : ''}
            </Text>
            <Text style={styles.metaDim}>EU-Hydro · {LAKID}</Text>
          </View>

          <View style={styles.ratingCard}>
            <Text style={styles.prompt}>How drinkable is this water?</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => {
                const isActive = n <= (currentRating ?? 0);
                return (
                  <Pressable key={n} style={styles.star} onPress={() => onRate(n)}>
                    <Text
                      style={[
                        styles.starText,
                        isActive && styles.starTextActive,
                      ]}
                    >
                      ★
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.scale}>
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 10, 20, 0.6)', // Deeper, moodier backdrop
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0F1A2C', // Deep dark sea blue
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 48,
    borderTopLeftRadius: 28, // Rounder, more modern corners
    borderTopRightRadius: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#233554', // Subtle handle blending with the dark theme
    marginBottom: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: { 
    color: '#E6F1FF', 
    fontSize: 24, 
    fontWeight: '800',
    letterSpacing: 0.5 
  },
  meta: { 
    color: '#8892B0', 
    fontSize: 14, 
    marginTop: 6,
    fontWeight: '500'
  },
  metaDim: { 
    color: '#4B5E7C', 
    fontSize: 12, 
    marginTop: 4 
  },
  ratingCard: {
    backgroundColor: '#16243A', // Lighter sea blue to pop off the sheet background
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    // Subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6, 
  },
  prompt: { 
    color: '#E6F1FF', 
    fontSize: 16, 
    fontWeight: '600',
    marginBottom: 16 
  },
  stars: { 
    flexDirection: 'row', 
    gap: 8 
  },
  star: { 
    padding: 4 
  },
  starText: { 
    fontSize: 42, 
    color: '#233554', // Inactive star color
  },
  starTextActive: { 
    color: '#FDE047', // Warm gold
    textShadowColor: 'rgba(253, 224, 71, 0.3)', // Soft glow effect
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  scale: { 
    color: '#64748B', 
    fontSize: 12, 
    marginTop: 18,
    fontWeight: '500',
    letterSpacing: 0.5
  },
});