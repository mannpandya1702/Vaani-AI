// follow-up-respond/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Stage 5 · capture the follow-up outcome + auto-re-escalate.     ║
// ║                                                                  ║
// ║  The patient answers the check-in: improving / unchanged /       ║
// ║  worsening. We record it. If WORSENING, the loop closes back to  ║
// ║  the doctor: we open a fresh follow-up "call" and a new triage   ║
// ║  card (needs_mo_review) so it lands in the cockpit queue — the    ║
// ║  symptom-worsening alert the brief's Stage 5 asks for.          ║
// ║                                                                  ║
// ║  (triage_decisions.call_id is UNIQUE, so a worsening event is a  ║
// ║  NEW encounter — a new calls row — not a mutation of the old.)  ║
// ║                                                                  ║
// ║  Auth: project JWT / master key via authorizeCockpitRequest      ║
// ║  (the cockpit calls it with the anon key, like soap-sign).       ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { authorizeCockpitRequest } from '../_shared/cockpit-auth.ts';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

const OUTCOMES = new Set(['improving', 'unchanged', 'worsening']);

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  if (!authorizeCockpitRequest(req)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const followUpId: string | undefined = body?.follow_up_id;
  const outcome: string | undefined = body?.outcome;
  const note: string | undefined = body?.note;
  if (!followUpId || !outcome || !OUTCOMES.has(outcome)) {
    return json({ error: 'bad_request', detail: 'follow_up_id + outcome(improving|unchanged|worsening) required' }, 400);
  }

  const sb = supabaseAdmin();
  const { data: f, error: fErr } = await sb.from('follow_ups')
    .select('id, tenant_id, patient_id, call_id, soap_id, watch_for, band, lang')
    .eq('id', followUpId).maybeSingle();
  if (fErr) return json({ error: 'query_failed', detail: fErr.message }, 500);
  if (!f) return json({ error: 'not_found' }, 404);

  let escalatedTriageId: string | null = null;

  if (outcome === 'worsening' && f.patient_id) {
    // A worsening report is a NEW encounter → new call + new triage card.
    const now = new Date().toISOString();
    const { data: fcall } = await sb.from('calls').insert({
      tenant_id: f.tenant_id,
      patient_id: f.patient_id,
      channel: 'voice',
      lang_detected: f.lang ?? 'hi',
      lang_declared: f.lang ?? 'hi',
      started_at: now,
      ended_at: now,
    }).select('id').single();

    if (fcall) {
      // Worsening never de-escalates: RED stays RED, everything else → AMBER.
      const band = f.band === 'RED' ? 'RED' : 'AMBER';
      const { data: esc } = await sb.from('triage_decisions').insert({
        call_id: fcall.id,
        patient_id: f.patient_id,
        tenant_id: f.tenant_id,
        band,
        presumptive_label: 'followup_worsening',
        red_flag_categories: [],
        confidence: 1.0,
        needs_mo_review: true,
        reasoning: `Follow-up worsening re-escalation. Original watch: ${f.watch_for ?? '—'}`,
        summary_en: `⚠ Follow-up: the patient reports WORSENING after the doctor's sign-off — re-escalated for review.${f.watch_for ? ` Originally flagged: ${f.watch_for}.` : ''}${note ? ` Patient note: ${note}.` : ''}`,
        recommended_action: 'Re-assess: callback, teleconsult, or refer.',
        classifier_model: 'followup-rules',
        classifier_prompt_version: 'followup-v1',
      }).select('id').single();
      escalatedTriageId = esc?.id ?? null;
    }
  }

  const { error: updErr } = await sb.from('follow_ups').update({
    outcome,
    response_note: note ?? null,
    responded_at: new Date().toISOString(),
    status: outcome === 'worsening' ? 'escalated' : 'responded',
    escalated_triage_id: escalatedTriageId,
  }).eq('id', f.id);
  if (updErr) return json({ error: 'update_failed', detail: updErr.message }, 500);

  return json({ ok: true, outcome, escalated_triage_id: escalatedTriageId });
});
