import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Aggregate rating row from the lake_rating_summary view.
export type RatingSummary = {
  lake_id: string;
  avg_stars: number;
  rating_count: number;
};

// Insert or update my rating for a lake. One row per (user, lake).
export async function rateLake(lakeId: string, stars: number) {
  if (stars < 1 || stars > 5) throw new Error('Stars must be 1..5');
  const { data, error } = await supabase
    .from('lake_ratings')
    .upsert(
      {
        lake_id: lakeId,
        stars,
        user_id: (await supabase.auth.getUser()).data.user?.id ?? '',
      },
      { onConflict: 'lake_id,user_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// My current rating for a single lake (or null if I haven't rated it).
export async function fetchMyRating(
  userId: string,
  lakeId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('lake_ratings')
    .select('stars')
    .eq('user_id', userId)
    .eq('lake_id', lakeId)
    .maybeSingle();
  if (error) {
    console.warn('[fetchMyRating] failed:', error.message);
    return null;
  }
  return data?.stars ?? null;
}

// Aggregate summary for a single lake (avg + count). Returns null if no ratings.
export async function fetchRatingSummary(
  lakeId: string,
): Promise<RatingSummary | null> {
  const { data, error } = await supabase
    .from('lake_rating_summary')
    .select('*')
    .eq('lake_id', lakeId)
    .maybeSingle();
  if (error) {
    console.warn('[fetchRatingSummary] failed:', error.message);
    return null;
  }
  return data ?? null;
}

// Combined hook: fetches both the aggregate and my own rating for a lake on mount.
// Returns refresh() so callers can re-pull after the user rates.
export function useLakeRating(lakeId: string | null, myUserId: string | null) {
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [myStars, setMyStars] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!lakeId) return;
    setLoading(true);
    try {
      const [sum, mine] = await Promise.all([
        fetchRatingSummary(lakeId),
        myUserId ? fetchMyRating(myUserId, lakeId) : Promise.resolve(null),
      ]);
      setSummary(sum);
      setMyStars(mine);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSummary(null);
    setMyStars(null);
    if (lakeId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lakeId, myUserId]);

  return { summary, myStars, loading, refresh };
}
