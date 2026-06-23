// sarvam-tts-bridge/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Sarvam Bulbul v2 TTS bridge for VAPI's customVoice.            ║
// ║                                                                 ║
// ║  Day 2 Part 1.5 fix (Aman §6): strip RIFF/WAV header before     ║
// ║  returning to VAPI. VAPI customVoice expects RAW PCM s16le @    ║
// ║  16kHz — the WAV header would otherwise play as a click/pop.    ║
// ║                                                                 ║
// ║  Voice persona = "Vaani Didi" (Anushka, pitch -0.15, pace 0.9, ║
// ║  warmth +20%). Locked by Priya §6.                              ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { sarvamTTS } from '../_shared/sarvam-client.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (!verifyBearer(req, masterKey)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad json', { status: 400, headers: corsHeaders });
  }

  const text: string = payload.message?.text ?? payload.text ?? '';
  const lang: string = payload.message?.language ?? payload.language ?? 'hi-IN';
  const speaker: string | undefined = payload.message?.speaker ?? payload.speaker;
  const urgent: boolean = !!payload.message?.urgent;

  if (!text.trim()) {
    return new Response('empty text', { status: 400, headers: corsHeaders });
  }

  try {
    const wav = await sarvamTTS(text, {
      targetLang: lang,
      speaker,
      pitch: -0.15,
      // Aanya §13: RED-triage callbacks slow to 0.8 for rural elderly comprehension
      pace: urgent ? 0.8 : 0.9,
      loudness: 1.2,
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
