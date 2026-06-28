// follow-ups-feed/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  The cockpit's Follow-ups view: scheduled / sent / responded     ║
// ║  check-ins joined with the patient. Same auth + service-role     ║
// ║  posture as cockpit-feed.                                        ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { authorizeCockpitRequest } from '../_shared/cockpit-auth.ts';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  if (!authorizeCockpitRequest(req)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(5, Number(url.searchParams.get('limit') ?? 50)));
  const sb = supabaseAdmin();

  const { data: fus, error } = await sb.from('follow_ups')
    .select('id, patient_id, call_id, soap_id, watch_for, band, lang, scheduled_for, status, message, outcome, escalated_triage_id, created_at, sent_at, responded_at')
    .order('scheduled_for', { ascending: true })
    .limit(limit);
  if (error) return json({ error: 'query_failed', detail: error.message }, 500);

  const pids = [...new Set((fus ?? []).map((f) => f.patient_id).filter(Boolean))];
  const patientById = new Map<string, any>();
  if (pids.length) {
    const { data: pts } = await sb.from('patients')
      .select('id, full_name, phone_e164, preferred_language')
      .in('id', pids);
    for (const p of pts ?? []) patientById.set(p.id, p);
  }

  const rows = (fus ?? []).map((f) => ({ ...f, patient: f.patient_id ? patientById.get(f.patient_id) ?? null : null }));
  return json({ rows, fetched_at: new Date().toISOString() });
});
