// sarvam-stt-bridge/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Sarvam Saarika v2 STT bridge for VAPI's customTranscriber.     ║
// ║                                                                 ║
// ║  VAPI opens a WebSocket to us; sends 16 kHz PCM audio frames.   ║
// ║  We forward to Sarvam streaming endpoint; relay back partial    ║
// ║  + final transcripts in VAPI's expected shape:                  ║
// ║    { type: 'transcriber-response', transcription, channel }     ║
// ║                                                                 ║
// ║  Aman §1: 400ms timeout per chunk → on failure, fall back       ║
// ║  to Deepgram Nova-2 en-IN (Day 3 hardening — V1 just errors).   ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

const SARVAM_WS = 'wss://api.sarvam.ai/speech-to-text/ws';

Deno.serve((req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const upgrade = req.headers.get('upgrade')?.toLowerCase();
  if (upgrade !== 'websocket') {
    return new Response(JSON.stringify({
      status: 'ready',
      hint: 'Open a WebSocket connection per VAPI customTranscriber spec.',
    }), { headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }

  const { socket: vapiWs, response } = Deno.upgradeWebSocket(req);
  const sarvamKey = Deno.env.get('SARVAM_API_KEY');
  if (!sarvamKey) {
    vapiWs.addEventListener('open', () =>
      vapiWs.send(JSON.stringify({ type: 'error', message: 'no_sarvam_key' })));
    return response;
  }

  let sarvamWs: WebSocket | null = null;
  let language = 'hi-IN';

  vapiWs.addEventListener('open', () => {
    sarvamWs = new WebSocket(`${SARVAM_WS}?api-subscription-key=${sarvamKey}&language_code=${language}`);

    sarvamWs.addEventListener('open', () => {
      console.log('[sarvam-stt] sarvam upstream open');
      sarvamWs!.send(JSON.stringify({
        config: {
          sample_rate: 16000,
          encoding: 'pcm_s16le',
          model: 'saarika:v2',
          interim_results: true,
        },
      }));
    });

    sarvamWs.addEventListener('message', (ev) => {
      // Relay Sarvam results back to VAPI in the shape VAPI expects.
      try {
        const data = JSON.parse(ev.data);
        const transcript = data.transcript ?? data.text ?? '';
        const isFinal = data.is_final ?? data.final ?? false;
        if (transcript) {
          vapiWs.send(JSON.stringify({
            type: 'transcriber-response',
            transcription: transcript,
            channel: 'customer',
            is_final: isFinal,
            language: data.language_code ?? language,
          }));
        }
      } catch {
        // ignore
      }
    });

    sarvamWs.addEventListener('error', (ev) => {
      console.error('[sarvam-stt] upstream error', ev);
      vapiWs.send(JSON.stringify({ type: 'error', message: 'sarvam_upstream_error' }));
    });
    sarvamWs.addEventListener('close', () => {
      console.log('[sarvam-stt] upstream closed');
    });
  });

  vapiWs.addEventListener('message', (ev) => {
    // VAPI sends either JSON configs (start, lang change) or binary PCM frames.
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'start-call') {
          language = msg.language ?? 'hi-IN';
        }
      } catch {
        // ignore
      }
    } else if (sarvamWs?.readyState === WebSocket.OPEN) {
      sarvamWs.send(ev.data);
    }
  });

  vapiWs.addEventListener('close', () => {
    sarvamWs?.close();
  });

  return response;
});
