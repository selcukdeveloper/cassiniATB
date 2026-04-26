import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from './supabase';

// Random pleasant flag color for new players. Picked from a fixed palette so
// they're visually distinguishable on the map.
const COLOR_PALETTE = [
  '#3498db', // blue
  '#e74c3c', // red
  '#2ecc71', // green
  '#f39c12', // orange
  '#9b59b6', // purple
  '#1abc9c', // teal
  '#e91e63', // pink
];

function pickColor(seed: string): string {
  // Deterministic by user id so the same user always gets the same color.
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  // First sign-in for a fresh user: create the profile row if it doesn't exist.
  if (data.user) await ensureProfile(data.user.id, data.user.email ?? '');
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Idempotent. Tries to upsert a profile row if one isn't there yet.
// Username defaults to the email's local-part (before @).
async function ensureProfile(userId: string, email: string) {
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (existing) return;

  const username = email.split('@')[0] || 'player';
  const color = pickColor(userId);
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    username,
    color,
  });
  if (error) {
    // Race-condition-tolerant: if another insert beat us, that's fine.
    if (!String(error.message).toLowerCase().includes('duplicate')) {
      console.warn('[auth] ensureProfile insert failed:', error.message);
    }
  }
}

// React hook: returns the current session, re-renders on auth state change.
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

// Hook: returns the current user's profile row, or null until loaded.
export function useMyProfile() {
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle<Profile>();
      if (!cancelled) setProfile(data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  return profile;
}
