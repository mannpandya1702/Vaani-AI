// vapi-webhook/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  VAPI lifecycle webhook entry point.                            ║
// ║                                                                 ║
// ║  Patterns lifted from ClinicPro vapi-webhook (Aman §5):         ║
// ║   1. Log raw body to dispatch_webhook_logs BEFORE parse         ║
// ║   2. Return 200 fast; do heavy classification via               ║
// ║      EdgeRuntime.waitUntil so VAPI doesn't time out             ║
// ║   3. Constant-time secret compare                               ║
// ║                                                                 ║
// ║  V1 handles two events:                                         ║
// ║   - call.started      → create/update calls row                 ║
// ║   - end-of-call-report → trigger process-call-records           ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyVapiWebhook } from '../_shared/vapi-auth.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const t0 = Date.now();
  let rawBody = '';
  let parsed: any = null;
  let httpStatus = 200;
  let errorMsg: string | null = null;
  const sb = supabaseAdmin();

  // 1. ALWAYS log raw payload first (ClinicPro lesson #5)
  try {
    rawBody = await req.text();
  } catch (e) {
    console.error('[vapi-webhook] body read failed', e);
    rawBody = '';
  }

  let signatureValid = false;
  const auth = await verifyVapiWebhook(req, rawBody);
  signatureValid = auth.ok;
  if (!auth.ok) {
    httpStatus = 401;
    errorMsg = `auth_failed: ${auth.reason}`;
  }

  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch (e) {
    errorMsg = errorMsg ?? `json_parse_failed: ${(e as Error).message}`;
  }

  // Always persist the audit row, success or fail
  await sb.from('dispatch_webhook_logs').insert({
    source: 'vapi',
    raw_body: rawBody.slice(0, 64_000), // cap stored size
    parsed_body: parsed,
    headers: Object.fromEntries(req.headers),
    signature_valid: signatureValid,
    http_status: httpStatus,
    processing_ms: Date.now() - t0,
    error: errorMsg,
  });

  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.reason }), {
      status: 401,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
  if (!parsed) {
    return new Response(JSON.stringify({ error: 'no_body' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  // 2. Identify event type and dispatch.
  //    VAPI shape: { message: { type, call, ... } }
  const message = parsed.message ?? parsed;
  const eventType: string = message.type ?? 'unknown';
  const vapiCall = message.call ?? {};
  const callId: string | undefined = vapiCall.id;

  // Fast 200 to VAPI; heavy lifting after response.
  const respond = () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });

  switch (eventType) {
    case 'status-update':
    case 'call.started':
      // @ts-expect-error Deno edge runtime
      EdgeRuntime.waitUntil(handleCallStarted(callId, vapiCall, message));
      return respond();

    case 'end-of-call-report':
      // @ts-expect-error Deno edge runtime
      EdgeRuntime.waitUntil(handleEndOfCall(callId, vapiCall, message));
      return respond();

    case 'transcript':
    case 'speech-update':
      // V1: just acknowledge; future: stream into turns table
      return respond();

    case 'tool-calls':
      // Vaani tools (book_followup, escalate_to_mo, etc.) — handled by
      // dedicated functions later in Day 2.
      return respond();

    default:
      console.log('[vapi-webhook] unknown event', eventType);
      return respond();
  }
});

async function handleCallStarted(callId: string | undefined, vapiCall: any, message: any) {
  if (!callId) return;
  const sb = supabaseAdmin();

  const phone = vapiCall.customer?.number ?? vapiCall.phoneNumber?.number;
  const assistantId = vapiCall.assistantId;
  const orgId = vapiCall.orgId ?? vapiCall.organization?.id;

  // Find tenant by VAPI org id
  const { data: tenant } = await sb
    .from('tenants')
    .select('id, name')
    .eq('vapi_org_id', orgId)
    .maybeSingle();

  // Upsert patient by phone (Day 2: minimal record; demographics filled later)
  let patientId: string | null = null;
  if (phone && tenant) {
    const { data: existing } = await sb
      .from('patients')
      .select('id')
      .eq('phone_e164', phone)
      .eq('tenant_id', tenant.id)
      .maybeSingle();
    if (existing) {
      patientId = existing.id;
    } else {
      const { data: created } = await sb
        .from('patients')
        .insert({ phone_e164: phone, tenant_id: tenant.id, preferred_language: 'hi' })
        .select('id')
        .single();
      patientId = created?.id ?? null;
    }
  }

  // Upsert calls row
  await sb
    .from('calls')
    .upsert({
      vapi_call_id: callId,
      tenant_id: tenant?.id,
      patient_id: patientId,
      vapi_assistant_id: assistantId,
      channel: 'voice',
      outcome: 'in_progress',
      started_at: vapiCall.startedAt ?? new Date().toISOString(),
      lang_declared: 'hi',
    }, { onConflict: 'vapi_call_id' });
}

async function handleEndOfCall(callId: string | undefined, vapiCall: any, message: any) {
  if (!callId) return;
  const sb = supabaseAdmin();

  // Aman §6 cost breakdown — pull provider-level costs from VAPI report
  const costs = message.costs ?? [];
  const llmCost = sumByType(costs, ['model']);
  const sttCost = sumByType(costs, ['transcriber']);
  const ttsCost = sumByType(costs, ['voice']);
  const totalCost = (message.cost ?? 0) as number;

  const duration = vapiCall.duration ?? message.durationSeconds ?? null;
  const transcript: string = message.transcript ?? '';
  const summary: string = message.summary ?? '';
  const endedAt = vapiCall.endedAt ?? new Date().toISOString();

  // Update call to completed; cost breakdown in cost_breakdown jsonb
  await sb
    .from('calls')
    .update({
      ended_at: endedAt,
      duration_seconds: duration,
      outcome: 'completed',
      cost_inr: usdToInr(totalCost),
      cost_breakdown: {
        usd_total: totalCost,
        usd_llm: llmCost,
        usd_stt: sttCost,
        usd_tts: ttsCost,
      },
    })
    .eq('vapi_call_id', callId);

  // Trigger process-call-records function (async — fire and forget)
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (SUPABASE_URL && SR) {
    fetch(`${SUPABASE_URL}/functions/v1/process-call-records`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${SR}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        vapi_call_id: callId,
        transcript,
        summary,
        message,
      }),
    }).catch((e) => console.error('[vapi-webhook] process-call-records dispatch failed', e));
  }
}

function sumByType(costs: any[], types: string[]): number {
  return costs
    .filter((c) => types.includes(c?.type))
    .reduce((s, c) => s + (c?.cost ?? 0), 0);
}

function usdToInr(usd: number): number {
  // Hackathon shortcut. Replace with FX cache table in Week 2.
  const RATE = 83.5;
  return Math.round(usd * RATE * 100) / 100;
}
