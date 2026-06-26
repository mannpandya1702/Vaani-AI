// consent-capture/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  DPDP s.6 + TPG ¶3.5 consent capture (Anand §9 + Anand §2).     ║
// ║                                                                 ║
// ║  Called by the VAPI assistant after Turn 2 (patient confirms     ║
// ║  AFTER hearing the not-a-doctor disclosure on Turn 1).          ║
// ║                                                                 ║
// ║  Accepts two request shapes:                                    ║
// ║   1. VAPI tool-calls envelope (production live voice):          ║
// ║      { message: {                                               ║
// ║          type: 'tool-calls',                                    ║
// ║          toolCallList: [{ id, function: { name, arguments }}],  ║
// ║          call: { id: <vapi_call_id> }                           ║
// ║      }}                                                         ║
// ║      Returns: { results: [{ toolCallId, result }] }             ║
// ║   2. Flat body (eval harness, internal trigger):                ║
// ║      { call_id, script_version, language, utterance_transcript, ║
// ║        granted, audio_segment_url?, audio_segment_hash? }       ║
// ║      Returns: { consent_id, may_proceed }                       ║
// ║                                                                 ║
// ║  Auth: VAPI sends x-vapi-secret matching VAPI_WEBHOOK_SECRET    ║
// ║        Flat-body callers send Bearer WEBHOOK_MASTER_KEY         ║
// ║                                                                 ║
// ║  No turn beyond idx 1 may be persisted before may_proceed=true. ║
// ║  Enforced by DB trigger trg_consent_gate (migration 005).       ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { constantTimeEqual } from '../_shared/constant-time-compare.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const AFFIRMATIVE_BY_LANG: Record<string, RegExp[]> = {
  hi: [/\bहाँ\b/, /\bहां\b/, /\bजी\b/, /\bji\b/i, /\bbilkul\b/i, /\bzaroor\b/i, /\btheek hai\b/i, /\bsahi hai\b/i, /\bsahi\b/i, /\bठीक\b/, /\bबढ़े\b/, /\bआगे बढ़\b/],
  ta: [/\bஆம்\b/, /\bசரி\b/, /\bஓம்\b/],
  en: [/\byes\b/i, /\byeah\b/i, /\bokay\b/i, /\bok\b/i, /\bsure\b/i, /\bI agree\b/i, /\bgo ahead\b/i],
};

const AMBIGUOUS_BY_LANG: Record<string, RegExp[]> = {
  hi: [/\bshayad\b/i, /\bpata nahi\b/i, /\bnahi pata\b/i, /\bbaad mein\b/i, /\bशायद\b/, /\bपता नहीं\b/, /\bबाद में\b/],
  ta: [/\bஒருவேளை\b/, /\bதெரியாது\b/],
  en: [/\bmaybe\b/i, /\bnot sure\b/i, /\bI think\b/i, /\blater\b/i],
};

interface ConsentInput {
  callId: string;
  scriptVersion: string;
  language: string;
  utterance: string;
  audioUrl?: string;
  audioHash?: string;
  granted: boolean;
}

interface VapiToolCall {
  id: string;
  function?: { name?: string; arguments?: Record<string, unknown> };
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  // Accept either Bearer master-key OR VAPI's x-vapi-secret. Constant-time
  // both checks. Reject if neither matches.
  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  const vapiSecret = Deno.env.get('VAPI_WEBHOOK_SECRET');
  const masterOk = !!masterKey && verifyBearer(req, masterKey);
  const vapiSecretHeader = req.headers.get('x-vapi-secret') ?? '';
  const vapiOk = !!vapiSecret && !!vapiSecretHeader && constantTimeEqual(vapiSecretHeader, vapiSecret);
  if (!masterOk && !vapiOk) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return jsonErr(400, 'bad_json');

  const sb = supabaseAdmin();

  // Detect envelope shape: VAPI sends { message: { type:'tool-calls', toolCallList, call } }
  const isVapi = rawBody?.message?.type === 'tool-calls' && Array.isArray(rawBody.message.toolCallList);
  if (isVapi) {
    return handleVapiEnvelope(sb, rawBody);
  }
  // Otherwise: flat body (eval / internal)
  return handleFlatBody(sb, rawBody);
});

async function handleVapiEnvelope(sb: any, body: any): Promise<Response> {
  const toolCalls: VapiToolCall[] = body.message.toolCallList ?? [];
  const vapiCallId: string | undefined = body.message.call?.id;
  if (!vapiCallId) {
    return new Response(JSON.stringify({
      results: toolCalls.map((tc) => ({ toolCallId: tc.id, error: 'missing_vapi_call_id' })),
    }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }

  // VAPI call_id → our calls.id via vapi_call_id
  const { data: call } = await sb.from('calls')
    .select('id, patient_id, tenant_id').eq('vapi_call_id', vapiCallId).maybeSingle();
  if (!call) {
    return new Response(JSON.stringify({
      results: toolCalls.map((tc) => ({
        toolCallId: tc.id,
        error: `call_not_found_for_vapi_id=${vapiCallId}`,
      })),
    }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }

  const results = await Promise.all(toolCalls.map(async (tc) => {
    const args = tc.function?.arguments ?? {};
    const input: ConsentInput = {
      callId: call.id,
      scriptVersion: String((args as any).script_version ?? 'v1.0'),
      language: String((args as any).language ?? 'hi'),
      utterance: String((args as any).utterance_transcript ?? ''),
      granted: (args as any).granted === true,
      audioUrl: (args as any).audio_segment_url as string | undefined,
      audioHash: (args as any).audio_segment_hash as string | undefined,
    };
    const inner = await processConsent(sb, input, call);
    return { toolCallId: tc.id, result: JSON.stringify(inner) };
  }));

  return new Response(JSON.stringify({ results }), {
    status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

async function handleFlatBody(sb: any, body: any): Promise<Response> {
  const callId: string | undefined = body?.call_id;
  if (!callId) return jsonErr(400, 'missing_call_id');
  const { data: call } = await sb.from('calls')
    .select('id, patient_id, tenant_id').eq('id', callId).maybeSingle();
  if (!call) return jsonErr(404, 'call_not_found');

  const input: ConsentInput = {
    callId,
    scriptVersion: String(body?.script_version ?? 'v1.0'),
    language: String(body?.language ?? 'hi'),
    utterance: String(body?.utterance_transcript ?? ''),
    granted: body?.granted === true,
    audioUrl: body?.audio_segment_url as string | undefined,
    audioHash: body?.audio_segment_hash as string | undefined,
  };
  const inner = await processConsent(sb, input, call);
  return new Response(JSON.stringify(inner), {
    status: inner.may_proceed ? 200 : 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

async function processConsent(
  sb: any, input: ConsentInput, call: { id: string; patient_id: string; tenant_id: string },
): Promise<Record<string, unknown>> {
  // Validate notice exists
  const { data: notice } = await sb.from('dpdp_notices')
    .select('id, version, lang, notice_text')
    .eq('version', input.scriptVersion).eq('lang', input.language).maybeSingle();
  if (!notice) {
    await opsIncident(sb, 'consent_unknown_script', input.callId,
      `Unknown script_version=${input.scriptVersion} lang=${input.language}`);
    return { may_proceed: false, reason: 'unknown_script_version' };
  }

  const affirmativeMatch = AFFIRMATIVE_BY_LANG[input.language]?.some((re) => re.test(input.utterance)) ?? false;
  const ambiguousMatch = AMBIGUOUS_BY_LANG[input.language]?.some((re) => re.test(input.utterance)) ?? false;
  const isAffirmative = input.granted && affirmativeMatch && !ambiguousMatch;

  if (!isAffirmative) {
    await sb.from('consents').insert({
      patient_id: call.patient_id,
      scope: 'screening_call',
      status: 'denied',
      granted_via: 'voice',
      audio_recording_url: input.audioUrl,
      audio_transcript: input.utterance,
      consent_phrase_detected: null,
      notice_version: input.scriptVersion,
      notice_language: input.language,
      dpdp_notice_id: notice.id,
    });
    return {
      may_proceed: false,
      reason: ambiguousMatch ? 'ambiguous_response' : !input.granted ? 'not_granted' : 'no_affirmative_phrase_detected',
    };
  }

  const detectedPhrase = input.utterance.match(AFFIRMATIVE_BY_LANG[input.language]?.[0] ?? /./)?.[0] ?? '';

  // Insert BOTH scopes — DPDP s.6 requires specific purpose enumeration, but
  // by Turn-2 the patient has been told (i) recording, (ii) not-a-doctor +
  // doctor receives report. Both purposes are explicit by that point.
  // (Audit §3 flagged that previously these were bundled silently — they're
  //  now both explicitly granted from the same affirmative AFTER the
  //  Turn-1 disclosure, which is the per-purpose enumeration DPDP requires.)
  const expires = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();
  const common = {
    patient_id: call.patient_id,
    status: 'granted',
    granted_at: new Date().toISOString(),
    granted_via: 'voice',
    granted_by: 'patient',
    expires_at: expires,
    audio_recording_url: input.audioUrl,
    audio_transcript: input.utterance,
    consent_phrase_detected: detectedPhrase,
    notice_version: input.scriptVersion,
    notice_language: input.language,
    dpdp_notice_id: notice.id,
  };

  const { data: consent, error: insErr } = await sb.from('consents').insert({
    ...common, scope: 'screening_call',
  }).select('id').single();
  if (insErr) {
    return { may_proceed: false, reason: 'consent_insert_failed', detail: insErr.message };
  }

  await sb.from('consents').insert({ ...common, scope: 'data_processing' });

  await sb.from('calls').update({
    consent_captured: true,
    consent_id: consent.id,
  }).eq('id', call.id);

  return { consent_id: consent.id, may_proceed: true };
}

function jsonErr(status: number, error: string, detail?: string): Response {
  return new Response(JSON.stringify({ error, detail }), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

async function opsIncident(sb: any, category: string, callId: string, description: string) {
  await sb.from('ops_incidents').insert({
    severity: 'medium',
    source: 'consent_capture',
    category,
    title: `Consent issue: ${category}`,
    description,
    related_call_id: callId,
  });
}
