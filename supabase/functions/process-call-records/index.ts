// process-call-records/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Post-call orchestrator. Fan-out: triage → SOAP → cockpit.      ║
// ║                                                                 ║
// ║  Pipeline:                                                      ║
// ║   1. triage-score (Claude Sonnet 4.6 with Aanya v2 prompt)      ║
// ║   2. soap-generate (eSanjeevani SOAP via tool-forced JSON)      ║
// ║   2.5 shadow-diagnosis (AI clinical opinion, BEFORE RMP review) ║
// ║                                                                 ║
// ║  Signoff dispatch is fired by DB trigger on soap_notes when the ║
// ║  MO sets mo_signed_at — see migration 007 + vaani-signoff fn.   ║
// ║                                                                 ║
// ║  Triage + SOAP run SEQUENTIALLY because SOAP reads triage from  ║
// ║  the DB. Tradeoff: ~6-9s end-to-end vs parallel-with-broadcast. ║
// ║  Acceptable because process-call-records fires AFTER call-end,  ║
// ║  not in the live voice path.                                    ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const SB_URL = Deno.env.get('SUPABASE_URL');
const MASTER_KEY = Deno.env.get('WEBHOOK_MASTER_KEY');

async function invokeEdge(name: string, callId: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const resp = await fetch(`${SB_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${MASTER_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ call_id: callId }),
  });
  let parsed: unknown = null;
  try { parsed = await resp.json(); } catch { /* ignore */ }
  return { ok: resp.ok, status: resp.status, body: parsed };
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (!verifyBearer(req, MASTER_KEY)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const callId: string | undefined = body?.call_id;
  if (!callId) {
    return new Response(JSON.stringify({ error: 'missing_call_id' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sb = supabaseAdmin();
  const t0 = Date.now();
  const trace: Record<string, unknown> = { call_id: callId };

  // ── Step 1: triage-score ─────────────────────────────────────
  const triageStart = Date.now();
  const triage = await invokeEdge('triage-score', callId);
  trace.triage = { status: triage.status, ms: Date.now() - triageStart };

  if (!triage.ok) {
    // Triage failure is a hard stop — log and bail
    await sb.from('ops_incidents').insert({
      severity: 'high',
      source: 'process_call_records',
      category: 'triage_failed',
      title: `triage-score failed for call ${callId}`,
      description: JSON.stringify({ status: triage.status, body: triage.body }).slice(0, 1000),
      related_call_id: callId,
    });
    return new Response(JSON.stringify({ ok: false, trace, error: 'triage_failed' }), {
      status: 502, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  // ── Step 2: soap-generate ────────────────────────────────────
  // Depends on triage_decisions row inserted in Step 1.
  const soapStart = Date.now();
  const soap = await invokeEdge('soap-generate', callId);
  trace.soap = { status: soap.status, ms: Date.now() - soapStart };

  if (!soap.ok) {
    await sb.from('ops_incidents').insert({
      severity: 'medium',
      source: 'process_call_records',
      category: 'soap_failed',
      title: `soap-generate failed for call ${callId}`,
      description: JSON.stringify({ status: soap.status, body: soap.body }).slice(0, 1000),
      related_call_id: callId,
    });
    // Don't hard-fail the whole pipeline — triage already landed; cockpit
    // can show the triage card and let the MO write a SOAP by hand.
  }

  // ── Step 2.5: shadow-diagnosis (AI Shadow Diagnosis, Stage 3) ─
  // Runs AFTER SOAP and BEFORE the RMP reviews — a separate AI clinical
  // opinion that NEVER overrides the doctor. Non-fatal: if it fails the
  // cockpit still shows triage + SOAP, just without the AI opinion card.
  const shadowStart = Date.now();
  const shadow = await invokeEdge('shadow-diagnosis', callId);
  trace.shadow = { status: shadow.status, ms: Date.now() - shadowStart };
  if (!shadow.ok) {
    await sb.from('ops_incidents').insert({
      severity: 'low',
      source: 'process_call_records',
      category: 'shadow_diagnosis_failed',
      title: `shadow-diagnosis failed for call ${callId}`,
      description: JSON.stringify({ status: shadow.status, body: shadow.body }).slice(0, 1000),
      related_call_id: callId,
    });
  }

  // ── Step 3: Signoff dispatch is wired via DB trigger on   ─────
  //           soap_notes.mo_signed_at — vaani-signoff function.
  //           Nothing to do here.

  trace.total_ms = Date.now() - t0;
  trace.triage_result = triage.body;
  trace.soap_result = soap.body;
  trace.shadow_result = shadow.body;

  return new Response(JSON.stringify({ ok: true, trace }), {
    status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
