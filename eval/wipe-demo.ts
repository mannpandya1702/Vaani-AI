// eval/wipe-demo.ts
// Idempotent wipe of the __demo_cockpit__ tenant rows. Use after live
// demos to keep the queue clean. Does NOT delete the tenant row itself.
//
//   set -a && . ./.env.local && set +a && deno run --allow-env --allow-net eval/wipe-demo.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env');
  Deno.exit(2);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: tenant } = await sb.from('tenants')
  .select('id').eq('name', '__demo_cockpit__').maybeSingle();
if (!tenant) { console.log('No __demo_cockpit__ tenant — nothing to wipe.'); Deno.exit(0); }

const { data: calls } = await sb.from('calls').select('id').eq('tenant_id', tenant.id);
const { data: patients } = await sb.from('patients').select('id').eq('tenant_id', tenant.id);
const callIds = (calls ?? []).map((c) => c.id);
const patientIds = (patients ?? []).map((p) => p.id);

if (callIds.length) {
  await sb.from('turns').delete().in('call_id', callIds);
  await sb.from('triage_decisions').delete().in('call_id', callIds);
  await sb.from('soap_notes').delete().in('call_id', callIds);
  await sb.from('pii_token_map').delete().in('call_id', callIds);
  await sb.from('cross_border_transfers').delete().in('call_id', callIds);
  await sb.from('call_costs').delete().in('call_id', callIds);
}
if (patientIds.length) await sb.from('call_dispatch_queue').delete().in('patient_id', patientIds);
if (callIds.length) await sb.from('calls').delete().in('id', callIds);
if (patientIds.length) await sb.from('patients').delete().in('id', patientIds);

console.log(`Wiped: ${callIds.length} calls, ${patientIds.length} patients (tenant kept).`);
