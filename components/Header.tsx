import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  onFindWater: () => void;
  onTestWater: () => void;
  onSettings?: () => void;
};

export default function Header({ onFindWater, onTestWater, onSettings }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.banner}>
        <Text style={styles.title}>MarinersATB</Text>
        <View style={styles.buttons}>
          {onSettings && (
            <Pressable style={[styles.btn, styles.btnSettings]} onPress={onSettings}>
              <Text style={styles.btnText}>Settings</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: '#1a1a2e',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSettings: {
    backgroundColor: '#0f3460',
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
