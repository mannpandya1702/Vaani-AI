// sarvam-tts-bridge/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Sarvam Bulbul v2 TTS bridge for VAPI's customVoice.            ║
// ║                                                                 ║
// ║  VAPI POSTs { message, sampleRate } → we call Sarvam Bulbul     ║
// ║  → return raw 16 kHz PCM stream.                                ║
// ║                                                                 ║
// ║  Voice persona = "Vaani Didi" (Anushka, pitch -0.15, pace 0.9,  ║
// ║  warmth +20%). Locked by Priya §6.                              ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { sarvamTTS } from '../_shared/sarvam-client.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  // VAPI authenticates with the master key we configured.
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

  if (!text.trim()) {
    return new Response('empty text', { status: 400, headers: corsHeaders });
  }

  try {
    const audio = await sarvamTTS(text, {
      targetLang: lang,
      speaker,
      pitch: -0.15,
      pace: 0.9,
      loudness: 1.2,
    });
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'audio/wav',
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
