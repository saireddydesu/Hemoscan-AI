import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const supabaseUrl = metaEnv?.VITE_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = metaEnv?.VITE_SUPABASE_ANON_KEY?.trim() || '';

export const isSupabaseConfigured: boolean =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  supabaseUrl.startsWith('http');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
