import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchLeaderboard } from '../../lib/claims';
import { useMyProfile } from '../../lib/auth';
import type { LeaderboardRow } from '../../lib/supabase';

export default function LeaderboardTab() {
  const me = useMyProfile();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchLeaderboard());
    } catch (e) {
      console.warn('[leaderboard] failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading && rows.length === 0) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color="#FDE047" />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      style={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refresh}
          tintColor="#FDE047"
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No claims yet. Be the first.</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <Row row={item} rank={index + 1} isMe={me?.id === item.id} />
      )}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
    />
  );
}

function Row({
  row,
  rank,
  isMe,
}: {
  row: LeaderboardRow;
  rank: number;
  isMe: boolean;
}) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
  return (
    <View style={[styles.row, isMe && styles.rowMe]}>
      <Text style={styles.rank}>
        {medal || `#${rank}`}
      </Text>
      <View
        style={[
          styles.swatch,
          { backgroundColor: row.color },
        ]}
      />
      <View style={styles.nameWrap}>
        <Text style={styles.name}>{row.username}</Text>
        {isMe && <Text style={styles.youBadge}>YOU</Text>}
      </View>
      <Text style={styles.count}>{row.active_claims}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#0F1A2C' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#16243A',
    gap: 12,
  },
  rowMe: { backgroundColor: '#1d2e4f' },
  rank: { color: '#FDE047', fontSize: 18, fontWeight: '800', width: 40 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: '#E6F1FF', fontSize: 16, fontWeight: '600' },
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
  count: {
    color: '#FDE047',
    fontSize: 20,
    fontWeight: '800',
  },
  sep: { height: 1, backgroundColor: '#0F1A2C' },
  empty: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#8892B0', fontSize: 14 },
});
