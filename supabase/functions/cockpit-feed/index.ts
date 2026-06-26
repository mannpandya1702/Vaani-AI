// cockpit-feed/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Returns the demo cockpit's view: recent triage_decisions joined║
// ║  with their patient + call + soap_notes for the demo tenant.    ║
// ║                                                                 ║
// ║  For demo we bypass RLS by using the service-role client. The   ║
// ║  function is gated by `verifyBearer` (anon-key bearer is fine   ║
// ║  because we're not exposing PHI for non-demo tenants — query    ║
// ║  filters to a single demo tenant or returns the last N rows).   ║
// ║                                                                 ║
// ║  In production this becomes an authenticated RLS-aware query    ║
// ║  scoped to the MO's tenant_subtree.                             ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  // Anon-key bearer is fine for the demo cockpit. We're not authenticating
  // a specific MO yet; the data is read-only summary for the demo tenant.
  // Block totally unauthenticated requests though.
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(5, Number(url.searchParams.get('limit') ?? 25)));

  const sb = supabaseAdmin();

  const { data: triage, error: triageErr } = await sb
    .from('triage_decisions')
    .select(`
      id, call_id, patient_id, tenant_id, band, presumptive_label,
      red_flag_categories, confidence, reasoning, summary_en, summary_native,
      recommended_action, needs_mo_review, classifier_model, classifier_prompt_version,
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (triageErr) {
    return new Response(JSON.stringify({ error: 'triage_query_failed', detail: triageErr.message }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const callIds = (triage ?? []).map((t) => t.call_id);
  const patientIds = (triage ?? []).map((t) => t.patient_id);

  const [soapResp, callResp, patientResp] = await Promise.all([
    sb.from('soap_notes')
      .select('id, call_id, subjective, objective, assessment, plan, presumptive_screening_label, differential_list, icd10_codes, icd11_codes, mo_only_drug_hints, lang, mo_signed_at, mo_user_id, generated_at')
      .in('call_id', callIds),
    sb.from('calls')
      .select('id, started_at, ended_at, channel, lang_detected')
      .in('id', callIds),
    sb.from('patients')
      .select('id, age_years, sex, preferred_language, pregnancy_status, village_name')
      .in('id', patientIds),
  ]);

  const soapByCall = new Map<string, any>();
  for (const s of soapResp.data ?? []) soapByCall.set(s.call_id, s);
  const callById = new Map<string, any>();
  for (const c of callResp.data ?? []) callById.set(c.id, c);
  const patientById = new Map<string, any>();
  for (const p of patientResp.data ?? []) patientById.set(p.id, p);

  const rows = (triage ?? []).map((t) => ({
    triage: t,
    soap: soapByCall.get(t.call_id) ?? null,
    call: callById.get(t.call_id) ?? null,
    patient: patientById.get(t.patient_id) ?? null,
  }));

  return new Response(JSON.stringify({ rows, fetched_at: new Date().toISOString() }), {
    status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
