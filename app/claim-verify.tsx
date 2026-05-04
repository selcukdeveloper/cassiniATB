import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSession } from '../lib/auth';
import { claimLake } from '../lib/claims';
import { lakeLabel } from '../lib/lake-display';

type Stage = 'instructions' | 'scanning' | 'submitting' | 'done';

export default function ClaimVerify() {
  const params = useLocalSearchParams<{ lake_id?: string }>();
  const lakeId = params.lake_id ?? null;
  useSession();

  const [stage, setStage] = useState<Stage>('instructions');
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const handleScanned = async ({ data }: { data: string }) => {
    if (stage !== 'scanning') return;
    setStage('submitting');
    setError(null);
    try {
      if (!lakeId) throw new Error('Missing lake_id route param');
      await claimLake(lakeId, data);
      console.log('[claim-verify] scanned QR contents:', data);
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Claim failed');
      setStage('instructions');
    }
  };

  if (!lakeId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No lake specified. Go back and try again.</Text>
      </View>
    );
  }

  if (stage === 'instructions' || stage === 'submitting') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color="#E6F1FF" />
          </Pressable>
          <Text style={styles.headerTitle}>Test &amp; claim</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.lakeName}>{lakeLabel(lakeId)}</Text>
          <Text style={styles.steps}>
            1- Bring your marinersATB test kit to the water.{'\n'}
            2- Perform the test following the instructions on the kit package.{'\n'}
            3- Scan the QR code on the kit to verify the test.{'\n'}
            4- Upload a photo of the results and submit your claim in the app.{'\n\n'}
            Note: Each QR code is unique and can only be used once. Don't discard the kit until your claim appears in the app!
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.primary, stage === 'submitting' && styles.disabled]}
            disabled={stage === 'submitting'}
            onPress={async () => {
              if (!permission?.granted) {
                const r = await requestPermission();
                if (!r.granted) {
                  setError('Camera permission denied');
                  return;
                }
              }
              setStage('scanning');
            }}
          >
            {stage === 'submitting' ? (
              <ActivityIndicator color="#0F1A2C" />
            ) : (
              <>
                <Ionicons name="qr-code" size={20} color="#0F1A2C" />
                <Text style={styles.primaryText}>Open scanner</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  if (stage === 'scanning') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleScanned}
        />
        <View style={styles.cameraOverlay}>
          <View style={styles.cameraHeader}>
            <Pressable onPress={() => setStage('instructions')} style={styles.backBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Text style={styles.cameraTitle}>Scan the kit&apos;s QR</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.targetFrame} />
          <Text style={styles.cameraHint}>
            Point the camera at the QR code on your marinersATB test kit.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <Ionicons name="paper-plane" size={64} color="#FDE047" />
        <Text style={styles.lakeName}>{lakeLabel(lakeId)}</Text>
        <Text style={styles.success}>Verification request sent</Text>
        <Text style={styles.successSub}>
          Your scan has been recorded. Once the claim is verified and approved, it will appear in the app for everyone to see. You can submit a photo and rating to share more about the water quality at this lake!
        </Text>
        <Pressable style={styles.primary} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.primaryText}>Back to map</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1A2C' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#0F1A2C',
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#E6F1FF', fontSize: 17, fontWeight: '700' },
  body: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  lakeName: { color: '#E6F1FF', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  steps: {
    color: '#8892B0',
    fontSize: 15,
    lineHeight: 26,
    textAlign: 'left',
    marginVertical: 16,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FDE047',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 200,
  },
  primaryText: { color: '#0F1A2C', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  success: {
    color: '#FDE047',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 8,
  },
  successSub: {
    color: '#8892B0',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: '#3a1a1a',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  errorText: { color: '#ff8a8a', fontSize: 13 },

  cameraContainer: { flex: 1, backgroundColor: '#000' },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 64,
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  cameraTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  targetFrame: {
    alignSelf: 'center',
    width: 240,
    height: 240,
    borderColor: '#FDE047',
    borderWidth: 3,
    borderRadius: 24,
  },
  cameraHint: {
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: 32,
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
