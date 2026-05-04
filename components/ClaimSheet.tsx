import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { daysUntil } from '../lib/claims';
import { lakeLabel } from '../lib/lake-display';
import { useLakeRating } from '../lib/lake-ratings';
import type { ClaimWithOwner } from '../lib/supabase';
import type { LakeFeature } from './LakesLayer';

type Props = {
  lake: LakeFeature | null;
  // Most recent claim on this lake, if any (owner info + status).
  claim: ClaimWithOwner | null;
  // Current user id
  myUserId: string | null;
  onClose: () => void;
  // Open the star-rating modal for this lake.
  onRequestRate: (lake: LakeFeature) => void;
};

export default function ClaimSheet({
  lake,
  claim,
  myUserId,
  onClose,
  onRequestRate,
}: Props) {
  const lakeId = lake?.properties.LAKID ?? null;
  const { summary } = useLakeRating(lakeId, myUserId);

  if (!lake) return null;
  const { AREA, ALTITUDE, LAKID } = lake.properties;
  const areaKm2 = AREA != null ? (AREA / 1e6).toFixed(2) : null;
  const isMine = claim && myUserId && claim.user_id === myUserId;
  const daysLeft = claim ? daysUntil(claim.expires_at) : null;

  const handleStartClaim = () => {
    onClose(); // dismiss sheet, then navigate
    router.push({
      pathname: '/claim-verify',
      params: { lake_id: LAKID },
    });
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>{lakeLabel(LAKID)}</Text>
            <Text style={styles.meta}>
              {areaKm2 != null ? `${areaKm2} km²` : 'area unknown'}
              {ALTITUDE != null ? ` · ${Math.round(ALTITUDE)} m a.s.l.` : ''}
            </Text>
            <Text style={styles.metaDim}>EU-Hydro</Text>
          </View>

          {/* Aggregate rating row */}
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={18} color="#FDE047" />
            <Text style={styles.ratingValue}>
              {summary ? summary.avg_stars.toFixed(1) : '—'}
            </Text>
            <Text style={styles.ratingCount}>
              {summary
                ? `(${summary.rating_count} rating${summary.rating_count === 1 ? '' : 's'})`
                : 'No ratings yet'}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.rateBtn} onPress={() => onRequestRate(lake)}>
              <Text style={styles.rateBtnText}>Rate</Text>
            </Pressable>
          </View>
          {claim ? (
            <View style={styles.claimCard}>
              <View style={styles.ownerRow}>
                <View
                  style={[
                    styles.ownerSwatch,
                    { backgroundColor: claim.owner_color },
                  ]}
                />
                <Text style={styles.ownerName}>{claim.owner_username}</Text>
                {isMine && <Text style={styles.youBadge}>YOU</Text>}
              </View>
              <Text style={styles.claimMeta}>
                Expires in {daysLeft} day{daysLeft === 1 ? '' : 's'}
              </Text>
            </View>
          ) : (
            <View style={styles.claimCard}>
              <Text style={styles.unclaimed}>Unclaimed water</Text>
              <Text style={styles.claimMeta}>
                Be the first to plant your flag.
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.button, styles.claimButton]}
            onPress={handleStartClaim}
            disabled={!myUserId}
          >
            <Ionicons name="flask" size={18} color="#0F1A2C" />
            <Text style={styles.claimText}>
              {isMine
                ? 'Re-test &amp; refresh'
                : claim
                  ? 'Test water & take this claim'
                  : 'Test water & claim'}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 10, 20, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0F1A2C',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 48,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#233554',
    marginBottom: 20,
  },
  header: { marginBottom: 16 },
  title: {
    color: '#E6F1FF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  meta: { color: '#8892B0', fontSize: 14, marginTop: 6, fontWeight: '500' },
  metaDim: { color: '#4B5E7C', fontSize: 12, marginTop: 4 },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#16243A',
    marginBottom: 16,
  },
  ratingValue: { color: '#E6F1FF', fontSize: 16, fontWeight: '700' },
  ratingCount: { color: '#8892B0', fontSize: 13 },
  rateBtn: {
    backgroundColor: '#16243A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  rateBtnText: { color: '#FDE047', fontSize: 13, fontWeight: '700' },

  claimCard: {
    backgroundColor: '#16243A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  ownerSwatch: { width: 16, height: 16, borderRadius: 4 },
  ownerName: { color: '#E6F1FF', fontSize: 16, fontWeight: '700' },
  youBadge: {
    color: '#0F1A2C',
    backgroundColor: '#FDE047',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  claimMeta: { color: '#8892B0', fontSize: 13, marginTop: 4 },
  unclaimed: { color: '#FDE047', fontSize: 16, fontWeight: '700' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  claimButton: { backgroundColor: '#FDE047' },
  claimText: { color: '#0F1A2C', fontSize: 16, fontWeight: '700' },
});
