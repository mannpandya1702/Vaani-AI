// follow-up-scanner/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Stage 5 · the scheduled follow-up check-in.                     ║
// ║                                                                  ║
// ║  Days after the doctor signs, Vaani Didi calls the patient back  ║
// ║  in their language: "are you better, the same, or worse?" — and  ║
// ║  reminds them what to watch for. This function finds DUE          ║
// ║  follow-ups (status='scheduled', scheduled_for <= now), writes   ║
// ║  the in-language check-in, synthesises Sarvam Bulbul audio, and  ║
// ║  marks them 'sent'.                                              ║
// ║                                                                  ║
// ║  • Production: a cron hits this; it dispatches via Exotel/WhatsApp║
// ║  • Demo: pass {follow_up_id} to run ONE immediately and get the  ║
// ║    audio back to play on stage (no waiting days).                ║
// ║                                                                  ║
// ║  Auth: Bearer WEBHOOK_MASTER_KEY (cron) — same as the scanners.  ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { sarvamTTS } from '../_shared/sarvam-client.ts';
import { authorizeCockpitRequest } from '../_shared/cockpit-auth.ts';

const SARVAM_LANG: Record<string, string> = { hi: 'hi-IN', ta: 'ta-IN', en: 'en-IN' };

// The in-language check-in. Keeps it to one question (better/same/worse) plus
// a worsening-alert reminder built from the doctor's safety-net (watch_for).
const CHECKIN: Record<string, (watch: string | null) => string> = {
  hi: (w) =>
    `नमस्ते जी, वाणी बोल रही हूँ। डॉक्टर साहब को दिखाने के कुछ दिन बाद हम आपका हाल जानना चाहते हैं — अब आपकी तबीयत कैसी है? बेहतर, वैसी ही, या ज़्यादा ख़राब?` +
    (w ? ` ध्यान रखिए — ${w}. ऐसा कुछ बढ़े तो तुरंत 108 पर कॉल कीजिए।` : ` अगर तकलीफ़ बढ़े तो तुरंत 108 पर कॉल कीजिए।`),
  ta: (w) =>
    `வணக்கம், நான் வாணி பேசுகிறேன். டாக்டரிடம் காட்டிய சில நாட்களுக்குப் பிறகு உங்கள் நிலையை அறிய விரும்புகிறோம் — இப்போது எப்படி உள்ளீர்கள்? மேம்பட்டதா, அப்படியேதா, அல்லது மோசமாகிவிட்டதா?` +
    (w ? ` கவனமாக இருங்கள் — ${w}. அதிகரித்தால் உடனே 108-ஐ அழைக்கவும்.` : ` அறிகுறிகள் அதிகரித்தால் உடனே 108-ஐ அழைக்கவும்.`),
  en: (w) =>
    `Hello, this is Vaani. A few days after your doctor review, we're checking in — how are you feeling now: better, the same, or worse?` +
    (w ? ` Watch out for ${w}. If it worsens, call 108 immediately.` : ` If you feel worse, call 108 immediately.`),
};

const TTS_CAP = 500;
const cap = (s: string) => (s.length <= TTS_CAP ? s : s.slice(0, TTS_CAP - 1).trim());

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  // Cron hits this with the master key; the cockpit's "run check-in now" demo
  // button hits it with the project (anon) JWT. Accept either.
  if (!verifyBearer(req, Deno.env.get('WEBHOOK_MASTER_KEY')) && !authorizeCockpitRequest(req)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const followUpId: string | undefined = body?.follow_up_id;
  const limit = Math.min(50, Math.max(1, Number(body?.limit ?? 20)));
  const sb = supabaseAdmin();

  // Targets: one explicit id (demo "run now"), else all due + scheduled.
  let q = sb.from('follow_ups')
    .select('id, patient_id, call_id, soap_id, tenant_id, watch_for, band, lang, status, scheduled_for');
  if (followUpId) q = q.eq('id', followUpId);
  else q = q.eq('status', 'scheduled').lte('scheduled_for', new Date().toISOString()).limit(limit);

  const { data: targets, error } = await q;
  if (error) return json({ error: 'query_failed', detail: error.message }, 500);

  const processed: unknown[] = [];
  for (const f of targets ?? []) {
    // Only (re)send things still awaiting send — unless an explicit id was given.
    if (!followUpId && f.status !== 'scheduled') continue;
    const lang = (f.lang ?? 'hi') as string;
    const msg = cap((CHECKIN[lang] ?? CHECKIN.hi)(f.watch_for ?? null));

    let audioB64: string | null = null;
    let ttsError: string | null = null;
    try {
      const wav = await sarvamTTS(msg, { targetLang: SARVAM_LANG[lang] ?? 'hi-IN', pace: 0.9, sampleRate: 24000 });
      audioB64 = bytesToBase64(new Uint8Array(wav));
    } catch (e) {
      ttsError = String(e).slice(0, 200);
      console.error('[follow-up-scanner] tts_failed', ttsError);
    }

    await sb.from('follow_ups')
      .update({ status: 'sent', sent_at: new Date().toISOString(), message: msg })
      .eq('id', f.id);

    processed.push({ id: f.id, lang, message: msg, audio_b64: audioB64, tts_error: ttsError });
  }

  return json({ processed_count: processed.length, processed });
});
