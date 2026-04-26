import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { signOut, useSession } from '../../lib/auth';
import { daysUntil, fetchMyClaims } from '../../lib/claims';
import { lakeLabel } from '../../lib/lake-display';
import type { WaterClaim } from '../../lib/supabase';

// Verified claims only. Pending verifications live in the Verification tab.
export default function ClaimsTab() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [claims, setClaims] = useState<WaterClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setClaims(await fetchMyClaims(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load claims');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!userId) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Not signed in.</Text>
      </View>
    );
  }

  if (loading && claims.length === 0) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color="#FDE047" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {claims.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No verified claims yet</Text>
          <Text style={styles.emptyText}>
            Once your verification requests are approved, your claimed lakes
            appear here. Check the Verification tab for pending requests.
          </Text>
        </View>
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(c) => c.lake_id}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor="#FDE047"
            />
          }
          renderItem={({ item }) => <ClaimRow claim={item} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
      <Pressable style={styles.signOut} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function ClaimRow({ claim }: { claim: WaterClaim }) {
  const days = daysUntil(claim.expires_at);
  const expiringSoon = days <= 5;
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.lakeName}>{lakeLabel(claim.lake_id)}</Text>
        <Text style={styles.claimedAt}>
          Verified {claim.verified_at
            ? new Date(claim.verified_at).toLocaleDateString()
            : new Date(claim.claimed_at).toLocaleDateString()}
        </Text>

        <View style={styles.statusBar}>
          <Ionicons name="checkmark-circle" size={14} color="#22aa22" />
          <Text style={styles.statusText}>Verified</Text>
        </View>

        <Text style={[styles.days, expiringSoon && styles.daysWarn]}>
          Expires in {days} day{days === 1 ? '' : 's'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1A2C' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#0F1A2C',
  },
  emptyTitle: {
    color: '#E6F1FF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#8892B0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    padding: 16,
    backgroundColor: '#16243A',
  },
  sep: { height: 1, backgroundColor: '#0F1A2C' },
  rowText: { flex: 1 },
  lakeName: { color: '#E6F1FF', fontSize: 16, fontWeight: '700' },
  claimedAt: { color: '#4B5E7C', fontSize: 12, marginTop: 4 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#0e1f0e',
  },
  statusText: { fontSize: 12, fontWeight: '700', color: '#22aa22' },
  days: { color: '#8892B0', fontSize: 13, marginTop: 8 },
  daysWarn: { color: '#FDE047', fontWeight: '700' },
  errorBox: {
    backgroundColor: '#3a1a1a',
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  errorText: { color: '#ff8a8a', fontSize: 13 },
  signOut: { padding: 16, alignItems: 'center' },
  signOutText: { color: '#4B5E7C', fontSize: 13 },
});
