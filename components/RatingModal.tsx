import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  lakeLabel: string | null; // TO:DO: instead of using lake labels like "Lake OE00073164" from EU-Hydro data, match lake names to exact names
  initialStars: number | null; // User ratings for drinkability
  onSubmit: (stars: number) => Promise<void> | void;
  onClose: () => void;
};

export default function RatingModal({
  visible,
  lakeLabel,
  initialStars,
  onSubmit,
  onClose,
}: Props) {
  const [stars, setStars] = useState<number>(initialStars ?? 0);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (visible) setStars(initialStars ?? 0);
  }, [visible, initialStars]);

  const handleSubmit = async () => {
    if (stars < 1) return;
    setBusy(true);
    try {
      await onSubmit(stars);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card}>
          <Text style={styles.title}>{lakeLabel ?? '—'}</Text>
          <Text style={styles.subtitle}>How drinkable is this water?</Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => {
              const isActive = n <= stars;
              return (
                <Pressable
                  key={n}
                  style={styles.starBtn}
                  onPress={() => setStars(n)}
                  disabled={busy}
                >
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

          <Pressable
            style={[
              styles.submit,
              (stars === 0 || busy) && styles.submitDisabled,
            ]}
            disabled={stars === 0 || busy}
            onPress={handleSubmit}
          >
            {busy ? (
              <ActivityIndicator color="#0F1A2C" />
            ) : (
              <Text style={styles.submitText}>
                {initialStars ? 'Update rating' : 'Submit rating'}
              </Text>
            )}
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 10, 20, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#0F1A2C',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  title: { color: '#E6F1FF', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#8892B0', fontSize: 14, marginTop: 6, marginBottom: 20 },
  stars: { flexDirection: 'row', gap: 4, marginBottom: 24 },
  starBtn: { padding: 4 },
  starText: { fontSize: 44, color: '#233554' },
  starTextActive: {
    color: '#FDE047',
    textShadowColor: 'rgba(253, 224, 71, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  submit: {
    width: '100%',
    backgroundColor: '#FDE047',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#0F1A2C', fontSize: 15, fontWeight: '700' },
  cancel: { marginTop: 12, paddingVertical: 8 },
  cancelText: { color: '#4B5E7C', fontSize: 13 },
});
