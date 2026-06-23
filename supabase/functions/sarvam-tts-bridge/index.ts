// sarvam-tts-bridge/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Sarvam Bulbul v3 TTS bridge for VAPI's custom-voice provider.  ║
// ║                                                                 ║
// ║  Wire contract — VAPI POSTs body shaped like:                   ║
// ║   { message: { type:'voice-request', text:'...', sampleRate:    ║
// ║                16000, ... } }                                   ║
// ║  We respond with RAW PCM s16le @ 16kHz, content-type            ║
// ║  audio/pcm; rate=16000; channels=1.                             ║
// ║                                                                 ║
// ║  Sarvam best-practices (Jun 2026): use Devanagari/native script ║
// ║  input; Bulbul v3 supports pace only (no pitch/loudness).       ║
// ║  Per-language speakers: hi-IN→priya, ta-IN→ishita.              ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { sarvamTTS, defaultSpeakerForLang } from '../_shared/sarvam-client.ts';

// VAPI custom-voice can pass language as 'hi', 'hi-IN', or full BCP-47.
// Sarvam wants <lang>-IN form.
function normalizeLang(input: string | undefined): string {
  if (!input) return 'hi-IN';
  const lower = input.toLowerCase();
  if (lower.includes('-')) return lower.split('-')[0] + '-IN';
  return lower + '-IN';
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  // Always log header names for forensics (values masked).
  const hdrNames: string[] = [];
  const hdrDump: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    hdrNames.push(lk);
    hdrDump[lk] = (lk.includes('secret') || lk.includes('auth') || lk.includes('signature') || lk.includes('token'))
      ? `${v.slice(0, 8)}…(${v.length}b)`
      : v;
  });
  console.log('[sarvam-tts] incoming headers:', JSON.stringify(hdrDump));

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  const authOk = verifyBearer(req, masterKey);
  // TEMPORARY: VAPI custom-voice probe — don't block while we identify the
  // header VAPI uses for voice.server.secret. The bridge URL itself is the
  // shared secret for now (URL contains project ref + function name; not
  // discoverable). Will re-enable once correct header is known.
  const ALLOW_UNAUTH = Deno.env.get('SARVAM_TTS_ALLOW_UNAUTH') === '1';
  if (!authOk && !ALLOW_UNAUTH) {
    console.log('[sarvam-tts] AUTH FAIL');
    return new Response(JSON.stringify({ error: 'unauthorized', received_headers: hdrNames }), {
      status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
  if (!authOk) {
    console.log('[sarvam-tts] AUTH BYPASSED via SARVAM_TTS_ALLOW_UNAUTH=1');
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad json', { status: 400, headers: corsHeaders });
  }

  const msg = payload.message ?? {};
  const text: string = msg.text ?? payload.text ?? '';
  const langRaw: string = msg.language ?? payload.language ?? 'hi-IN';
  const speaker: string | undefined = msg.speaker ?? payload.speaker;
  const urgent: boolean = !!msg.urgent;
  const lang = normalizeLang(langRaw);

  if (!text.trim()) {
    return new Response('empty text', { status: 400, headers: corsHeaders });
  }

  try {
    const wav = await sarvamTTS(text, {
      targetLang: lang,
      speaker: speaker ?? defaultSpeakerForLang(lang),
      // Normal pace 1.05 — Sarvam docs note 1.0 = natural, 1.1 = "professional"
      // (snappier). User tested 1.0 and felt sluggish; 1.05 hits the sweet spot.
      // Aanya §13: RED-triage callbacks slow to 0.85 for rural elderly comprehension.
      pace: urgent ? 0.85 : 1.05,
    });

    // ── Strip RIFF/WAV header → return raw PCM s16le (Aman §6) ──
    const pcm = wavToPcm16(wav);

    return new Response(pcm, {
      status: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'audio/pcm; rate=16000; channels=1',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[sarvam-tts] failed', e);
    return new Response(JSON.stringify({ error: 'tts_failed', message: String(e) }), {
      status: 502,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
});

/**
 * Strip RIFF/WAV header — walk chunks to find 'data' chunk.
 * Safe against non-standard RIFFs (skips fmt, LIST, etc.).
 */
function wavToPcm16(buf: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buf);
  // 'RIFF' magic
  if (buf.byteLength < 12 || view.getUint32(0) !== 0x52494646) return buf;
  // Walk chunks starting after RIFF header (8) + 'WAVE' (4) = 12
  let p = 12;
  while (p < view.byteLength - 8) {
    const id = view.getUint32(p);
    const size = view.getUint32(p + 4, true);
    if (id === 0x64617461) { // 'data'
      return buf.slice(p + 8, p + 8 + size);
    }
    p += 8 + size;
  }
  return buf;
}
