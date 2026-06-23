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
      // Aanya §13: RED-triage callbacks slow to 0.85 for rural elderly comprehension
      pace: urgent ? 0.85 : 1.0,
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
