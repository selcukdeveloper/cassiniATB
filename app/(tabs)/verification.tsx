import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSession } from '../../lib/auth';
import { fetchMyVerifications } from '../../lib/claims';
import { lakeLabel } from '../../lib/lake-display';
import type { ClaimStatus, WaterClaim } from '../../lib/supabase';

// Pending + rejected verification requests. Once a request is approved
// (status='verified'), it disappears from here and appears in the My Claims
// tab and on the map.
export default function VerificationTab() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [requests, setRequests] = useState<WaterClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setRequests(await fetchMyVerifications(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
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

  if (loading && requests.length === 0) {
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
      <FlatList
        data={requests}
        keyExtractor={(r) => r.lake_id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor="#FDE047"
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No verification requests</Text>
            <Text style={styles.emptyText}>
              When you scan a kit&apos;s QR on the map, it shows up here as
              &ldquo;Waiting for verification&rdquo; until it&apos;s reviewed.
            </Text>
          </View>
        }
        renderItem={({ item }) => <RequestRow request={item} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
    </View>
  );
}

const STATUS_META: Record<
  ClaimStatus,
  { color: string; bg: string; label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: {
    color: '#FDE047',
    bg: '#1f1d0f',
    label: 'Waiting for verification',
    icon: 'time',
  },
  verified: {
    color: '#22aa22',
    bg: '#0e1f0e',
    label: 'Verified',
    icon: 'checkmark-circle',
  },
  rejected: {
    color: '#ff8a8a',
    bg: '#3a1a1a',
    label: 'Rejected',
    icon: 'close-circle',
  },
};

function RequestRow({ request }: { request: WaterClaim }) {
  const meta = STATUS_META[request.status];
  const verificationLabel =
    request.verification_code != null
      ? truncate(request.verification_code, 28)
      : null;
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.lakeName}>{lakeLabel(request.lake_id)}</Text>
        <Text style={styles.submittedAt}>
          Submitted {new Date(request.claimed_at).toLocaleDateString()}
        </Text>

        <View style={[styles.statusBar, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={14} color={meta.color} />
          <Text style={[styles.statusText, { color: meta.color }]}>
            {meta.label}
          </Text>
        </View>

        {verificationLabel && (
          <View style={styles.codeBadge}>
            <Text style={styles.codeBadgeLabel}>QR</Text>
            <Text style={styles.codeBadgeValue}>{verificationLabel}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function truncate(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
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
  row: { padding: 16, backgroundColor: '#16243A' },
  sep: { height: 1, backgroundColor: '#0F1A2C' },
  rowText: { flex: 1 },
  lakeName: { color: '#E6F1FF', fontSize: 16, fontWeight: '700' },
  submittedAt: { color: '#4B5E7C', fontSize: 12, marginTop: 4 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#233554',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  codeBadgeLabel: {
    color: '#FDE047',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  codeBadgeValue: { color: '#8892B0', fontSize: 11, fontFamily: 'Menlo' },
  errorBox: {
    backgroundColor: '#3a1a1a',
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  errorText: { color: '#ff8a8a', fontSize: 13 },
});
