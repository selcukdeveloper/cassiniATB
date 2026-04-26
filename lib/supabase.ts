// Supabase client. Reads URL + anon key from .env (EXPO_PUBLIC_*).
// react-native-url-polyfill/auto must be imported for supabase-js to work in RN.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't throw — components fail gracefully via auth-state checks.
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing from .env',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // RN — no URL-based session detection
  },
});

export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

// Database row types — keep in sync with the SQL schema in the readme/setup.
export type Profile = {
  id: string;
  username: string;
  color: string;
  created_at: string;
};

export type ClaimStatus = 'pending' | 'verified' | 'rejected';

export type WaterClaim = {
  lake_id: string;
  user_id: string;
  claimed_at: string;
  expires_at: string;
  verification_code: string | null;
  verified_at: string | null;
  status: ClaimStatus;
};

// Joined view shape used everywhere we render claims with their owner's info.
export type ClaimWithOwner = WaterClaim & {
  owner_username: string;
  owner_color: string;
};

export type ClaimSample = {
  id: string;
  lake_id: string;
  user_id: string;
  photo_url: string;
  status: 'pending' | 'verified' | 'rejected';
  notes: string | null;
  uploaded_at: string;
};

export type LeaderboardRow = {
  id: string;
  username: string;
  color: string;
  active_claims: number;
};
