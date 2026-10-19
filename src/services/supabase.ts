import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * A URL e a chave pública (anon/publishable) do Supabase podem ficar no app:
 * a segurança vem das políticas RLS. Chaves secretas (service role, IA, USDA)
 * ficam apenas nas Edge Functions.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isCloudConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!isCloudConfigured) throw new Error('Supabase não configurado');
  client ??= createClient(url!, anonKey!, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
  return client;
}
