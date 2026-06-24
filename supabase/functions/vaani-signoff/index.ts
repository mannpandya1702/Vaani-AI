// vaani-signoff/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  THE SOUL MOMENT.                                               ║
// ║                                                                 ║
// ║  Called by the MO Cockpit immediately after a SOAP note is      ║
// ║  signed (mo_signed_at IS NOT NULL transition).                  ║
// ║                                                                 ║
// ║  Behavior:                                                      ║
// ║   1. Verify the SOAP exists and is signed (idempotent re-check).║
// ║   2. Pick the localized "doctor saw you" message based on the   ║
// ║      patient's preferred language.                              ║
// ║   3. Generate Sarvam Bulbul v3 TTS audio (pace 0.85, "urgent"   ║
// ║      = warmer/slower; Aanya §13 for elderly comprehension).     ║
// ║   4. Insert a call_dispatch_queue row with                      ║
// ║      event_type='vaani_didi_signoff' + idempotency_key based on ║
// ║      the soap_id so re-sign is a NO-OP.                         ║
// ║   5. Return { message, audio_b64, dispatch_id, lang } so the    ║
// ║      cockpit can play the audio in the demo room.               ║
// ║                                                                 ║
// ║  In production, this same function would dial the patient's     ║
// ║  phone via VAPI outbound — for the demo, returning the audio    ║
// ║  in-band keeps the loop visible on stage without depending on   ║
// ║  Exotel DLT clearance.                                          ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { sarvamTTS } from '../_shared/sarvam-client.ts';

// Per-language soul message. Keep them SHORT — this is the patent moment;
// the silence after it lands matters more than the words.
const SOUL_MESSAGE: Record<string, string> = {
  hi: 'नमस्ते। डॉक्टर साहब ने आपकी रिपोर्ट देख ली है। आराम कीजिए — हम आपके साथ हैं।',
  ta: 'வணக்கம். டாக்டர் உங்கள் விவரத்தைப் பார்த்துவிட்டார். ஓய்வு எடுங்கள் — நாங்கள் உங்களுடன் இருக்கிறோம்.',
  en: 'Hello. The doctor has reviewed your report. Rest well — we are with you.',
};

const SARVAM_LANG_MAP: Record<string, string> = {
  hi: 'hi-IN',
  ta: 'ta-IN',
  en: 'en-IN',
};

function jsonErr(status: number, error: string, detail?: string) {
  return new Response(JSON.stringify({ error, detail }), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunk to avoid stack-blow on long PCM buffers
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (!verifyBearer(req, masterKey)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const soapId: string | undefined = body?.soap_id;
  if (!soapId) return jsonErr(400, 'missing_soap_id');

  const sb = supabaseAdmin();

  // ── Step 1: Verify SOAP exists + signed ────────────────────
  const { data: soap, error: soapErr } = await sb
    .from('soap_notes')
    .select('id, call_id, patient_id, tenant_id, lang, mo_signed_at, mo_user_id')
    .eq('id', soapId)
    .single();
  if (soapErr || !soap) return jsonErr(404, 'soap_not_found', soapErr?.message);
  if (!soap.mo_signed_at) {
    return jsonErr(409, 'not_signed_yet', 'mo_signed_at must be set before signoff');
  }

  // ── Step 2: Idempotency — has this signoff already dispatched? ─
  const idempotencyKey = `signoff_${soap.id}`;
  const { data: existing } = await sb
    .from('call_dispatch_queue')
    .select('id, status, dispatched_at')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existing && existing.status !== 'failed') {
    // Already dispatched (or in flight). Return the dispatch id but no
    // new audio — cockpit can replay from a cached copy if it wants.
    return new Response(JSON.stringify({
      dispatch_id: existing.id,
      already_dispatched: true,
      status: existing.status,
    }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }

  // ── Step 3: Resolve patient details ────────────────────────
  const { data: patient } = await sb
    .from('patients')
    .select('phone_e164, preferred_language, full_name')
    .eq('id', soap.patient_id)
    .single();
  const lang = (patient?.preferred_language ?? soap.lang ?? 'hi') as string;
  const phone = patient?.phone_e164 ?? '+919999999999'; // demo fallback
  const message = SOUL_MESSAGE[lang] ?? SOUL_MESSAGE.hi;

  // ── Step 4: Generate Sarvam Bulbul TTS audio ───────────────
  // Pace 0.85 = "urgent" path (Aanya §13 — slow for elderly listeners +
  // gives the moment its weight on stage).
  let audioB64: string | null = null;
  let audioBytes = 0;
  let ttsError: string | null = null;
  try {
    const wavBuf = await sarvamTTS(message, {
      targetLang: SARVAM_LANG_MAP[lang] ?? 'hi-IN',
      pace: 0.85,
      sampleRate: 24000,
    });
    const wavBytes = new Uint8Array(wavBuf);
    audioBytes = wavBytes.length;
    audioB64 = bytesToBase64(wavBytes);
  } catch (e) {
    ttsError = String(e).slice(0, 300);
    console.error('[vaani-signoff] tts_failed', ttsError);
    // Don't hard-fail — still write the dispatch row + return the message
    // text so the cockpit can synthesize via fallback.
  }

  // ── Step 5: Insert dispatch row ────────────────────────────
  const { data: inserted, error: insertErr } = await sb
    .from('call_dispatch_queue')
    .insert({
      tenant_id: soap.tenant_id,
      patient_id: soap.patient_id,
      patient_phone_e164: phone,
      event_type: 'vaani_didi_signoff',
      event_metadata: {
        soap_id: soap.id,
        call_id: soap.call_id,
        message,
        lang,
        audio_format: 'wav',
        audio_bytes: audioBytes,
        tts_error: ttsError,
      },
      channel: 'voice',
      scheduled_at: new Date().toISOString(),
      dispatched_at: new Date().toISOString(),
      status: ttsError ? 'failed' : 'dispatched',
      trigger: 'mo_action',
      trigger_source_table: 'soap_notes',
      trigger_source_id: soap.id,
      idempotency_key: idempotencyKey,
      last_error: ttsError,
    })
    .select('id')
    .single();

  if (insertErr) {
    return jsonErr(500, 'dispatch_insert_failed', insertErr.message);
  }

  return new Response(JSON.stringify({
    dispatch_id: inserted.id,
    soap_id: soap.id,
    call_id: soap.call_id,
    lang,
    message,
    audio_b64: audioB64,
    audio_format: 'wav',
    audio_bytes: audioBytes,
    tts_error: ttsError,
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
