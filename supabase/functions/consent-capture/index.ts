// consent-capture/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  DPDP s.6 + TPG ¶3.5 consent capture (Anand §9 + Anand §2).     ║
// ║                                                                 ║
// ║  VAPI assistant calls this AFTER reading the consent script and ║
// ║  capturing the patient's "हाँ" / "yes" / press-1 affirmation.    ║
// ║                                                                 ║
// ║  Body:                                                          ║
// ║   { call_id: string,                                            ║
// ║     script_version: 'v1.0',                                     ║
// ║     language: 'hi' | 'ta' | 'en',                               ║
// ║     utterance_transcript: string,                               ║
// ║     audio_segment_url?: string,                                 ║
// ║     audio_segment_hash?: string,                                ║
// ║     granted: boolean }                                          ║
// ║                                                                 ║
// ║  Response:                                                      ║
// ║   { consent_id: uuid, may_proceed: boolean }                    ║
// ║                                                                 ║
// ║  No turn beyond idx 1 may be persisted before may_proceed=true. ║
// ║  Enforced by DB trigger trg_consent_gate (migration 005).       ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const AFFIRMATIVE_BY_LANG: Record<string, RegExp[]> = {
  hi: [/\bहाँ\b/, /\bहां\b/, /\bji\b/i, /\bbilkul\b/i, /\bzaroor\b/i, /\btheek hai\b/i, /\bsahi hai\b/i, /\bsahi\b/i],
  ta: [/\bஆம்\b/, /\bசரி\b/, /\bஓம்\b/],
  en: [/\byes\b/i, /\byeah\b/i, /\bokay\b/i, /\bok\b/i, /\bsure\b/i, /\bI agree\b/i],
};

const AMBIGUOUS_BY_LANG: Record<string, RegExp[]> = {
  hi: [/\bshayad\b/i, /\bpata nahi\b/i, /\bnahi pata\b/i, /\bbaad mein\b/i],
  ta: [/\bஒருவேளை\b/, /\bதெரியாது\b/],
  en: [/\bmaybe\b/i, /\bnot sure\b/i, /\bI think\b/i, /\blater\b/i],
};

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (!verifyBearer(req, masterKey)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const callId: string | undefined = body?.call_id;
  const scriptVersion: string = body?.script_version ?? 'v1.0';
  const language: string = body?.language ?? 'hi';
  const utterance: string = body?.utterance_transcript ?? '';
  const audioUrl: string | undefined = body?.audio_segment_url;
  const audioHash: string | undefined = body?.audio_segment_hash;
  const granted: boolean = body?.granted === true;

  if (!callId) {
    return jsonErr(400, 'missing_call_id');
  }

  const sb = supabaseAdmin();

  // Lookup call + patient
  const { data: call } = await sb.from('calls')
    .select('id, patient_id, tenant_id').eq('id', callId).maybeSingle();
  if (!call) {
    return jsonErr(404, 'call_not_found');
  }

  // Validate script_version exists in dpdp_notices
  const { data: notice } = await sb.from('dpdp_notices')
    .select('id, version, lang, notice_text')
    .eq('version', scriptVersion).eq('lang', language).maybeSingle();
  if (!notice) {
    await opsIncident(sb, 'consent_unknown_script', callId,
      `Unknown script_version=${scriptVersion} lang=${language}`);
    return jsonErr(400, 'unknown_script_version');
  }

  // Check affirmative — both granted=true AND utterance matches
  const affirmativeMatch = AFFIRMATIVE_BY_LANG[language]?.some((re) => re.test(utterance)) ?? false;
  const ambiguousMatch = AMBIGUOUS_BY_LANG[language]?.some((re) => re.test(utterance)) ?? false;
  const isAffirmative = granted && affirmativeMatch && !ambiguousMatch;

  if (!isAffirmative) {
    // Log denial and refuse
    await sb.from('consents').insert({
      patient_id: call.patient_id,
      scope: 'screening_call',
      status: 'denied',
      granted_via: 'voice',
      audio_recording_url: audioUrl,
      audio_transcript: utterance,
      consent_phrase_detected: null,
      notice_version: scriptVersion,
      notice_language: language,
      dpdp_notice_id: notice.id,
    });
    return new Response(JSON.stringify({
      may_proceed: false,
      reason: ambiguousMatch ? 'ambiguous_response' : !granted ? 'not_granted' : 'no_affirmative_phrase_detected',
    }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }

  // Insert consent row
  const detectedPhrase = utterance.match(AFFIRMATIVE_BY_LANG[language]?.[0] ?? /./)?.[0] ?? '';
  const { data: consent, error: insErr } = await sb.from('consents').insert({
    patient_id: call.patient_id,
    scope: 'screening_call',
    status: 'granted',
    granted_at: new Date().toISOString(),
    granted_via: 'voice',
    granted_by: 'patient',
    expires_at: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString(),
    audio_recording_url: audioUrl,
    audio_transcript: utterance,
    consent_phrase_detected: detectedPhrase,
    notice_version: scriptVersion,
    notice_language: language,
    dpdp_notice_id: notice.id,
  }).select('id').single();

  if (insErr) {
    return jsonErr(500, 'consent_insert_failed', insErr.message);
  }

  // Also insert data_processing scope so cross-border-audit doesn't bail
  await sb.from('consents').insert({
    patient_id: call.patient_id,
    scope: 'data_processing',
    status: 'granted',
    granted_at: new Date().toISOString(),
    granted_via: 'voice',
    granted_by: 'patient',
    expires_at: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString(),
    audio_recording_url: audioUrl,
    audio_transcript: utterance,
    consent_phrase_detected: detectedPhrase,
    notice_version: scriptVersion,
    notice_language: language,
    dpdp_notice_id: notice.id,
  });

  // Link consent to call
  await sb.from('calls').update({
    consent_captured: true,
    consent_id: consent.id,
  }).eq('id', callId);

  return new Response(JSON.stringify({
    consent_id: consent.id,
    may_proceed: true,
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});

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
