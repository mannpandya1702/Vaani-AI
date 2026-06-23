// vapi-webhook/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  VAPI lifecycle webhook entry point.                            ║
// ║                                                                 ║
// ║  Day 2 Part 1.5 fixes (Aman §10, §11, §12, §13):                ║
// ║   - EOC idempotency via conditional update + dispatch_idempotency
// ║     keys table                                                  ║
// ║   - Unknown vapi_org_id → ops_incident, bail (no orphan rows)   ║
// ║   - transcript event → insert turns row + fire red-flag-check   ║
// ║   - Pre-flight check process-call-records existence guard       ║
// ║                                                                 ║
// ║  ClinicPro patterns (Aman §5):                                  ║
// ║   1. Log raw body to dispatch_webhook_logs BEFORE parse         ║
// ║   2. Fast 200; heavy work via EdgeRuntime.waitUntil             ║
// ║   3. Constant-time secret compare                               ║
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

  try { rawBody = await req.text(); } catch (e) {
    console.error('[vapi-webhook] body read failed', e);
    rawBody = '';
  }

  const auth = await verifyVapiWebhook(req, rawBody);
  const signatureValid = auth.ok;
  if (!auth.ok) { httpStatus = 401; errorMsg = `auth_failed: ${auth.reason}`; }

  try { parsed = rawBody ? JSON.parse(rawBody) : null; }
  catch (e) { errorMsg = errorMsg ?? `json_parse_failed: ${(e as Error).message}`; }

  // 1. Log raw payload always
  await sb.from('dispatch_webhook_logs').insert({
    source: 'vapi',
    raw_body: rawBody.slice(0, 64_000),
    parsed_body: parsed,
    headers: Object.fromEntries(req.headers),
    signature_valid: signatureValid,
    http_status: httpStatus,
    processing_ms: Date.now() - t0,
    error: errorMsg,
  });

  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.reason }), {
      status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
  if (!parsed) {
    return new Response(JSON.stringify({ error: 'no_body' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const message = parsed.message ?? parsed;
  const eventType: string = message.type ?? 'unknown';
  const vapiCall = message.call ?? {};
  const callId: string | undefined = vapiCall.id;

  const respond = () => new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

  switch (eventType) {
    case 'status-update':
    case 'call.started':
      // @ts-expect-error edge runtime
      EdgeRuntime?.waitUntil?.(handleCallStarted(callId, vapiCall, message));
      return respond();

    case 'end-of-call-report':
      // @ts-expect-error edge runtime
      EdgeRuntime?.waitUntil?.(handleEndOfCall(callId, vapiCall, message, rawBody));
      return respond();

    case 'transcript':
    case 'speech-update':
      // @ts-expect-error edge runtime
      EdgeRuntime?.waitUntil?.(handleTranscript(callId, message));
      return respond();

    case 'tool-calls':
      // Handled by dedicated tool endpoints (consent-capture, etc.) — ack here
      return respond();

    default:
      console.log('[vapi-webhook] unknown event', eventType);
      return respond();
  }
});

async function handleCallStarted(callId: string | undefined, vapiCall: any, _message: any) {
  if (!callId) return;
  const sb = supabaseAdmin();

  const phone = vapiCall.customer?.number ?? vapiCall.phoneNumber?.number;
  const assistantId = vapiCall.assistantId;
  const orgId = vapiCall.orgId ?? vapiCall.organization?.id;

  // ── Unknown vapi_org_id guard (Aman §11) ─────────────────────
  const { data: tenant } = await sb.from('tenants')
    .select('id, name').eq('vapi_org_id', orgId).maybeSingle();

  if (!tenant) {
    await sb.from('ops_incidents').insert({
      severity: 'high',
      source: 'vapi_webhook',
      category: 'unknown_vapi_org_id',
      title: `Unrecognized VAPI orgId ${orgId}`,
      description: `vapi_call_id=${callId} phone=${phone}`,
      payload: { vapi_call: vapiCall },
    });
    return;
  }

  // Upsert patient
  let patientId: string | null = null;
  if (phone) {
    const { data: existing } = await sb.from('patients')
      .select('id').eq('phone_e164', phone).eq('tenant_id', tenant.id).maybeSingle();
    if (existing) {
      patientId = existing.id;
    } else {
      const { data: created } = await sb.from('patients').insert({
        phone_e164: phone, tenant_id: tenant.id, preferred_language: 'hi',
      }).select('id').single();
      patientId = created?.id ?? null;
    }
  }

  // Upsert calls row
  await sb.from('calls').upsert({
    vapi_call_id: callId,
    tenant_id: tenant.id,
    patient_id: patientId,
    vapi_assistant_id: assistantId,
    channel: 'voice',
    outcome: 'in_progress',
    started_at: vapiCall.startedAt ?? new Date().toISOString(),
    lang_declared: 'hi',
  }, { onConflict: 'vapi_call_id' });
}

async function handleEndOfCall(
  callId: string | undefined,
  vapiCall: any,
  message: any,
  rawBody: string,
) {
  if (!callId) return;
  const sb = supabaseAdmin();

  // ── EOC idempotency claim (Aman §10) ──────────────────────────
  const idempotencyKey = await sha256Hex(`vapi:eoc:${callId}:${rawBody.length}`);
  const { data: dupCheck } = await sb.from('dispatch_idempotency_keys')
    .select('idempotency_key')
    .eq('source', 'vapi').eq('idempotency_key', idempotencyKey).maybeSingle();
  if (dupCheck) {
    console.log('[vapi-webhook] duplicate EOC ignored', callId);
    return;
  }
  await sb.from('dispatch_idempotency_keys').insert({
    source: 'vapi', idempotency_key: idempotencyKey, resolution: 'processed',
  });

  // Cost breakdown from VAPI report
  const costs = message.costs ?? [];
  const llmCost = sumByType(costs, ['model']);
  const sttCost = sumByType(costs, ['transcriber']);
  const ttsCost = sumByType(costs, ['voice']);
  const totalCost = (message.cost ?? 0) as number;

  const duration = vapiCall.duration ?? message.durationSeconds ?? null;
  const transcript: string = message.transcript ?? '';
  const summary: string = message.summary ?? '';
  const endedAt = vapiCall.endedAt ?? new Date().toISOString();

  // Conditional update — only claim if still in_progress (idempotency belt + braces)
  const { data: claim } = await sb.from('calls')
    .update({
      ended_at: endedAt,
      duration_seconds: duration,
      outcome: 'completed',
      cost_inr: usdToInr(totalCost),
      cost_breakdown: {
        usd_total: totalCost, usd_llm: llmCost, usd_stt: sttCost, usd_tts: ttsCost,
      },
    })
    .eq('vapi_call_id', callId)
    .eq('outcome', 'in_progress')
    .select('id').maybeSingle();

  if (!claim) {
    console.log('[vapi-webhook] EOC claim missed — already processed');
    return;
  }

  // Dispatch to process-call-records (best-effort)
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const MASTER = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (SUPABASE_URL && MASTER) {
    fetch(`${SUPABASE_URL}/functions/v1/process-call-records`, {
      method: 'POST',
      headers: { authorization: `Bearer ${MASTER}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        call_id: claim.id,
        vapi_call_id: callId,
        transcript, summary,
      }),
    }).catch((e) => console.error('[vapi-webhook] process-call-records dispatch failed', e));
  }
}

async function handleTranscript(callId: string | undefined, message: any) {
  if (!callId) return;
  const sb = supabaseAdmin();

  // Look up internal call id
  const { data: call } = await sb.from('calls')
    .select('id, patient_id, tenant_id').eq('vapi_call_id', callId).maybeSingle();
  if (!call) return; // race vs call.started — drop silently

  const role = message.role === 'assistant' ? 'assistant' : 'user';
  const text = message.transcript ?? '';
  const isFinal = (message.transcriptType ?? message.transcript_type) === 'final';
  const lang = message.language ?? 'hi';

  if (!isFinal || !text.trim()) return;

  // Get next turn idx atomically
  const { data: idxRow } = await sb.rpc('next_turn_idx', { p_call_id: call.id });
  const turnIdx = (idxRow ?? 1) as number;

  await sb.from('turns').insert({
    call_id: call.id,
    turn_idx: turnIdx,
    role,
    transcript: text,
    lang,
    stt_latency_ms: message.transcriptionDuration ?? null,
  });

  // Fire mid-call red-flag-check on every patient turn
  if (role === 'user') {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const MASTER = Deno.env.get('WEBHOOK_MASTER_KEY');
    if (SUPABASE_URL && MASTER) {
      fetch(`${SUPABASE_URL}/functions/v1/red-flag-check`, {
        method: 'POST',
        headers: { authorization: `Bearer ${MASTER}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          call_id: call.id,
          transcript: text,
          lang,
          patient_id: call.patient_id,
          tenant_id: call.tenant_id,
        }),
      }).catch((e) => console.error('[vapi-webhook] red-flag-check dispatch failed', e));
    }
  }
}

function sumByType(costs: any[], types: string[]): number {
  return costs.filter((c) => types.includes(c?.type)).reduce((s, c) => s + (c?.cost ?? 0), 0);
}

function usdToInr(usd: number): number {
  const RATE = 83.5;
  return Math.round(usd * RATE * 100) / 100;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
