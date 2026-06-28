// livekit-ingest/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Closes the LiveKit loop. A LiveKit call is just a conversation  ║
// ║  until this runs: the agent's shutdown hook POSTs the full       ║
// ║  transcript here, and we do exactly what the VAPI end-of-call    ║
// ║  webhook does — create a calls row + turns rows, then dispatch   ║
// ║  process-call-records so the call produces a cockpit card →      ║
// ║  SOAP → shadow → the "doctor has seen you" callback.            ║
// ║                                                                  ║
// ║  Master-key gated (the agent presents WEBHOOK_MASTER_KEY).       ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';

const SB_URL = Deno.env.get('SUPABASE_URL');
const MASTER_KEY = Deno.env.get('WEBHOOK_MASTER_KEY');
const VAPI_ORG_ID = Deno.env.get('VAPI_ORG_ID');

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

interface InTurn { role?: string; text?: string }

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  if (!verifyBearer(req, MASTER_KEY)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const room: string | undefined = body?.room;
  const lang = (body?.lang === 'ta' ? 'ta' : 'hi');
  const turns: InTurn[] = Array.isArray(body?.turns) ? body.turns : [];
  if (turns.length === 0) return json({ error: 'no_turns' }, 400);

  const sb = supabaseAdmin();

  // Resolve the demo tenant the same way process-call-records does:
  // VAPI-org tenant, else the first tenant.
  let tenantId: string | null = null;
  if (VAPI_ORG_ID) {
    const { data } = await sb.from('tenants').select('id').eq('vapi_org_id', VAPI_ORG_ID).maybeSingle();
    tenantId = data?.id ?? null;
  }
  if (!tenantId) {
    const { data } = await sb.from('tenants').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
    tenantId = data?.id ?? null;
  }
  if (!tenantId) return json({ error: 'no_tenant' }, 500);

  const now = new Date().toISOString();

  // 1. Create the calls row (channel 'voice' — it IS a voice call; the enum has
  //    no 'web'). patient_id stays null; process-call-records backfills it.
  const { data: call, error: callErr } = await sb
    .from('calls')
    .insert({
      tenant_id: tenantId,
      channel: 'voice',
      lang_detected: lang,
      lang_declared: lang,
      started_at: now,
      ended_at: now,
    })
    .select('id')
    .single();
  if (callErr || !call) return json({ error: 'call_insert_failed', detail: callErr?.message }, 500);

  // 2. Insert turns (mirror the VAPI shape: call_id, turn_idx, role, transcript, lang).
  const rows = turns
    .filter((t) => t?.text && String(t.text).trim())
    .map((t, i) => ({
      call_id: call.id,
      turn_idx: i,
      role: (t.role === 'assistant' || t.role === 'agent') ? 'assistant' : 'user',
      transcript: String(t.text).trim(),
      lang,
    }));
  if (rows.length > 0) {
    const { error: turnsErr } = await sb.from('turns').insert(rows);
    if (turnsErr) return json({ error: 'turns_insert_failed', detail: turnsErr.message, call_id: call.id }, 500);
  }

  // 3. Dispatch the post-call pipeline. Don't block the agent's shutdown hook on
  //    the ~30s triage/SOAP/shadow run — fire it and keep the function alive via
  //    waitUntil so process-call-records definitely starts.
  const pipeline = fetch(`${SB_URL}/functions/v1/process-call-records`, {
    method: 'POST',
    headers: { authorization: `Bearer ${MASTER_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ call_id: call.id, source: 'livekit', room }),
  }).then(() => {}, (e) => console.error('[livekit-ingest] pipeline dispatch failed', String(e)));

  // @ts-ignore — EdgeRuntime is the Supabase edge global
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(pipeline);
  else await pipeline;

  return json({ call_id: call.id, turns: rows.length, dispatched: true });
});
