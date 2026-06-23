// _shared/supabase-admin.ts
// Service-role client factory. Used by every edge function that needs to
// bypass RLS — webhooks, scanners, schedulers. NEVER share with the frontend.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in edge function env');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-vaani-edge-function': 'true' } },
  });
  return _client;
}
