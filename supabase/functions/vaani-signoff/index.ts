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
import { scrubDrugMentions } from '../_shared/drug-scrub.ts';

// Per-language opening line. Followed in turn by the doctor's PLAN field
// from soap_notes (verbatim, the RMP-authored non-drug instructions),
// then a closing reassurance. Stage 5 architecture: Vaani is the delivery
// layer for the doctor's plan — NOT the source. Anand-clean.
const SOUL_OPENER: Record<string, string> = {
  hi: 'नमस्ते। डॉक्टर साहब ने आपकी रिपोर्ट देख ली है। उनकी सलाह सुनिए — ',
  ta: 'வணக்கம். டாக்டர் உங்கள் விவரத்தைப் பார்த்துவிட்டார். அவரின் ஆலோசனை கேளுங்கள் — ',
  en: 'Hello. The doctor has reviewed your report. Here is their plan — ',
};
const SOUL_CLOSER: Record<string, string> = {
  hi: ' — आराम कीजिए, हम आपके साथ हैं।',
  ta: ' — ஓய்வு எடுங்கள், நாங்கள் உங்களுடன் இருக்கிறோம்.',
  en: ' — rest well, we are with you.',
};
// Fallback (short opening) if SOAP plan is empty.
const SOUL_FALLBACK: Record<string, string> = {
  hi: 'नमस्ते। डॉक्टर साहब ने आपकी रिपोर्ट देख ली है। आराम कीजिए — हम आपके साथ हैं।',
  ta: 'வணக்கம். டாக்டர் உங்கள் விவரத்தைப் பார்த்துவிட்டார். ஓய்வு எடுங்கள் — நாங்கள் உங்களுடன் இருக்கிறோம்.',
  en: 'Hello. The doctor has reviewed your report. Rest well — we are with you.',
};

/**
 * Trim Plan to a callback-friendly chunk (≤200 chars, full sentence).
 * Audit §4: previously this could split mid-word and trailing ellipsis
 * landed in the middle of Tamil compound words. Now: prefer sentence
 * boundary; if none, fall back to the last whitespace under maxChars
 * so we never cut mid-token. Drop the ellipsis on Tamil/long Hindi
 * plans (they read as "..." spoken aloud).
 */
function trimPlan(plan: string, maxChars = 200): string {
  if (!plan) return '';
  const cleaned = plan.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastStop = Math.max(
    cut.lastIndexOf('।'),
    cut.lastIndexOf('.'),
    cut.lastIndexOf('!'),
    cut.lastIndexOf('?'),
  );
  if (lastStop > maxChars / 2) return cut.slice(0, lastStop + 1).trim();
  // No sentence boundary in the prefix — cut at last whitespace.
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxChars / 2) return cut.slice(0, lastSpace).trim();
  return cut.trim();  // hard cut; no ellipsis — TTS reads them as words
}

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

  // ── Step 1: Verify SOAP exists + signed (and read the plan) ──
  const { data: soap, error: soapErr } = await sb
    .from('soap_notes')
    .select('id, call_id, patient_id, tenant_id, lang, mo_signed_at, mo_user_id, plan')
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
  // Stage 5 reframe: the soul callback is the delivery layer for the
  // doctor's plan (read verbatim from soap_notes.plan, RMP-authored).
  // No drug names — soap-generate's contract keeps drugs in
  // mo_only_drug_hints, so plan is patient-safe to speak aloud.
  const rawPlan = String((soap as { plan?: string }).plan ?? '');
  // Belt-and-braces drug-scrub before reading anything to TTS.
  // The DB CHECK constraint catches drug names at write time; this catches
  // anything the LLM emits that the constraint missed (case differences,
  // homophones, transliteration variants).
  const scrubbed = scrubDrugMentions(rawPlan, lang);
  if (scrubbed.hit) {
    // Audit any leak we caught at runtime — the LLM should not be emitting
    // drug names in the patient-facing plan field.
    await sb.from('ops_incidents').insert({
      severity: 'high',
      source: 'vaani_signoff',
      category: 'drug_name_in_plan',
      title: `vaani-signoff scrubbed drug mention(s) from SOAP plan`,
      description: `soap_id=${soap.id} hits=${scrubbed.detections.join(',')}`,
      related_call_id: soap.call_id,
    }).then(() => {}, () => {/* best-effort */});
    console.warn(`[vaani-signoff] drug mention scrubbed from plan: ${scrubbed.detections.join(',')}`);
  }
  const planSnippet = trimPlan(scrubbed.cleaned);
  const message = planSnippet
    ? `${SOUL_OPENER[lang] ?? SOUL_OPENER.hi}${planSnippet}${SOUL_CLOSER[lang] ?? SOUL_CLOSER.hi}`
    : (SOUL_FALLBACK[lang] ?? SOUL_FALLBACK.hi);

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
  // Audit §4: dispatched_at should NOT be stamped on failed status.
  // Audit §4: handle the TOCTOU race when two RMP clicks fire at once —
  // the unique idempotency_key throws 23505; treat it as already_dispatched
  // (200 with existing row) instead of bubbling 500.
  const nowIso = new Date().toISOString();
  const dispatchedAt = ttsError ? null : nowIso;
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
      scheduled_at: nowIso,
      dispatched_at: dispatchedAt,
      status: ttsError ? 'failed' : 'dispatched',
      trigger: 'mo_action',
      trigger_source_table: 'soap_notes',
      trigger_source_id: soap.id,
      idempotency_key: idempotencyKey,
      last_error: ttsError,
    })
    .select('id')
    .single();

  if (insertErr && (insertErr as any).code === '23505') {
    // Unique-key clash on idempotency_key → another concurrent sign hit
    // first. Return the existing row instead of a 500.
    const { data: existing2 } = await sb
      .from('call_dispatch_queue')
      .select('id, status')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    return new Response(JSON.stringify({
      dispatch_id: existing2?.id,
      already_dispatched: true,
      status: existing2?.status ?? 'dispatched',
      message,
      audio_b64: audioB64,
    }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }

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
