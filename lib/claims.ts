import { useEffect, useState } from 'react';
import {
  supabase,
  type ClaimSample,
  type ClaimStatus,
  type ClaimWithOwner,
  type LeaderboardRow,
  type WaterClaim,
} from './supabase';

// ----- Mutations -----------------------------------------------------------

// Claim a lake. Calls the `claim_lake` RPC which atomically clears any expired
// claim and inserts a new 30-day one for the current user. Optionally records
// the verification token (e.g. scanned product QR) so the claim is traceable.
// Returns the new row or throws if blocked (active claim still held).
//
// We use LAKID as the canonical identifier (EU-Hydro NAM is unreliable, often
// "UNK" or null, and not unique). The schema has no lake_name column.
export async function claimLake(
  lakeId: string,
  verificationCode: string | null = null,
) {
  const { data, error } = await supabase.rpc('claim_lake', {
    p_lake_id: lakeId,
    p_verification_code: verificationCode,
  });
  if (error) throw error;
  return data as WaterClaim;
}

// Release my own claim early. RLS only lets users delete their own rows.
export async function releaseClaim(lakeId: string) {
  const { error } = await supabase
    .from('water_claims')
    .delete()
    .eq('lake_id', lakeId);
  if (error) throw error;
}

// ----- Queries -------------------------------------------------------------

// All currently-active VERIFIED claims (joined with owner profile for color/
// username). Used to color polygons on the map. Pending and rejected claims
// are deliberately excluded — they're not "ownership", they're tracked
// separately in the Verification tab.
export async function fetchActiveClaims(): Promise<ClaimWithOwner[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('water_claims')
    .select(
      `
      lake_id,
      user_id,
      claimed_at,
      expires_at,
      verification_code,
      verified_at,
      status,
      profiles!water_claims_user_id_fkey ( username, color )
    `,
    )
    .eq('status', 'verified')
    .gt('expires_at', nowIso);
  if (error) throw error;
  return (data ?? []).map((row) => {
    // supabase-js types the FK join as an array even when it resolves to a
    // single row; the runtime gives us either an object or a 1-element array.
    // Coalesce to a single profile.
    const raw = (row as unknown as { profiles: unknown }).profiles;
    const profile = (Array.isArray(raw) ? raw[0] : raw) as
      | { username: string; color: string }
      | undefined;
    return {
      lake_id: row.lake_id,
      user_id: row.user_id,
      claimed_at: row.claimed_at,
      expires_at: row.expires_at,
      verification_code: (row as { verification_code: string | null }).verification_code,
      verified_at: (row as { verified_at: string | null }).verified_at,
      status: ((row as { status?: ClaimStatus }).status ?? 'pending') as ClaimStatus,
      owner_username: profile?.username ?? '?',
      owner_color: profile?.color ?? '#888',
    };
  });
}

// My VERIFIED claims (for the My Claims tab). Pending/rejected ones live in
// the Verification tab — see fetchMyVerifications below.
export async function fetchMyClaims(userId: string): Promise<WaterClaim[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('water_claims')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as WaterClaim[];
}

// My pending/rejected claims (for the Verification tab). Anything that hasn't
// been approved yet — these are "verification requests" the user has submitted.
export async function fetchMyVerifications(userId: string): Promise<WaterClaim[]> {
  const { data, error } = await supabase
    .from('water_claims')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'rejected'])
    .order('claimed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WaterClaim[];
}

// My uploaded samples (for the Verification tab).
export async function fetchMySamples(userId: string): Promise<ClaimSample[]> {
  const { data, error } = await supabase
    .from('claim_samples')
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClaimSample[];
}

// Leaderboard view (top players by active claim count).
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .limit(50);
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}

// ----- React hooks ---------------------------------------------------------

// Hook: subscribes to active-claims changes via Postgres realtime, refetches
// on any insert/update/delete in water_claims. Returns latest active claims.
export function useActiveClaims() {
  const [claims, setClaims] = useState<ClaimWithOwner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const data = await fetchActiveClaims();
        if (!cancelled) setClaims(data);
      } catch (e) {
        console.warn('[useActiveClaims] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    refresh();
    // Unique channel name per hook instance — supabase-js caches channels by
    // name and complains if two effect runs reuse the same one (common during
    // navigation in/out of the Map tab and during React strict-mode double-fire).
    const channelName = `water_claims_changes_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'water_claims' },
        () => {
          refresh();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { claims, loading };
}

// Lookup map: lake_id -> claim, for fast color-by-owner in LakesLayer.
export type ClaimsByLakeId = Record<string, ClaimWithOwner>;

export function indexClaims(list: ClaimWithOwner[]): ClaimsByLakeId {
  const out: ClaimsByLakeId = {};
  for (const c of list) out[c.lake_id] = c;
  return out;
}

// Days until expiration for a claim, rounded down. Negative = expired.
export function daysUntil(expiresAtIso: string): number {
  const ms = new Date(expiresAtIso).getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
