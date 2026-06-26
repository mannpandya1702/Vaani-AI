// eval/wire-live-tenant.ts
// ╔══════════════════════════════════════════════════════════════════╗
// ║  Creates (or upserts) the live demo tenant and maps the VAPI     ║
// ║  orgId on it so vapi-webhook stops rejecting real calls as         ║
// ║  "unknown_vapi_org_id".                                           ║
// ║                                                                   ║
// ║  Run:                                                             ║
// ║    set -a && . ./.env.local && set +a && \                        ║
// ║    deno run --allow-env --allow-net eval/wire-live-tenant.ts      ║
// ╚══════════════════════════════════════════════════════════════════╝

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const VAPI_ORG_ID = Deno.env.get('VAPI_ORG_ID');
if (!SUPABASE_URL || !SERVICE_ROLE || !VAPI_ORG_ID) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VAPI_ORG_ID');
  Deno.exit(2);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TENANT_NAME = 'Vaani-AI Demo PHC';

const { data: existing } = await sb.from('tenants')
  .select('id, vapi_org_id').eq('name', TENANT_NAME).maybeSingle();

let tenantId: string;
if (existing) {
  if (existing.vapi_org_id !== VAPI_ORG_ID) {
    await sb.from('tenants').update({ vapi_org_id: VAPI_ORG_ID }).eq('id', existing.id);
    console.log(`Updated vapi_org_id on tenant ${existing.id}`);
  } else {
    console.log(`Tenant exists and orgId already matches: ${existing.id}`);
  }
  tenantId = existing.id;
} else {
  const { data, error } = await sb.from('tenants').insert({
    name: TENANT_NAME,
    level: 'demo',
    tenant_path: 'live',
    timezone: 'Asia/Kolkata',
    preferred_language: 'hi',
    vapi_org_id: VAPI_ORG_ID,
  }).select('id').single();
  if (error) { console.error('Tenant insert failed:', error.message); Deno.exit(1); }
  tenantId = data.id;
  console.log(`Created tenant ${tenantId} with vapi_org_id=${VAPI_ORG_ID}`);
}

// Sanity: confirm we can read back
const { data: confirm } = await sb.from('tenants')
  .select('id, name, vapi_org_id, level').eq('id', tenantId).single();
console.log('Wired:', JSON.stringify(confirm, null, 2));
console.log('\nNext live VAPI call will land under this tenant.');
