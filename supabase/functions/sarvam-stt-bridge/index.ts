// sarvam-stt-bridge/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Sarvam Saaras v3 STT bridge for VAPI's customTranscriber.      ║
// ║                                                                 ║
// ║  Day 2 Part 1.5 fix (Aman §4): PRE-WARM upstream Sarvam WS      ║
// ║  + BUFFER PCM frames until upstream is OPEN+configAcked.        ║
// ║  Previously we lost 150-300ms of leading audio while the        ║
// ║  Sarvam handshake completed — every consult started mid-syllable║
// ║                                                                 ║
// ║  Fallback: on Sarvam open failure within 400ms or 5xx event,    ║
// ║  log ops_incident + close connection so VAPI fails fast.        ║
// ║  Deepgram fallback hot-swap roadmapped Day 3.                   ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const SARVAM_WS = 'wss://api.sarvam.ai/speech-to-text/ws';
const STT_MODEL = Deno.env.get('SARVAM_STT_MODEL') ?? 'saaras:v3';

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

  const sarvamKey = Deno.env.get('SARVAM_API_KEY');
  if (!sarvamKey) {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.addEventListener('open', () =>
      socket.send(JSON.stringify({ type: 'error', message: 'no_sarvam_key' })));
    return response;
  }

  const language = new URL(req.url).searchParams.get('lang') ?? 'hi-IN';
  const { socket: vapiWs, response } = Deno.upgradeWebSocket(req);

  // ── PRE-WARM: open Sarvam WS *immediately*, not on vapi open ──
  const sarvamWs = new WebSocket(
    `${SARVAM_WS}?api-subscription-key=${sarvamKey}&language_code=${language}`,
  );
  let sarvamReady = false;
  let configAcked = false;
  const pcmBuffer: Array<ArrayBufferLike> = [];

  // ── Sarvam open: send config, mark ready, flush buffer ────────
  const openTimer = setTimeout(() => {
    if (!sarvamReady) {
      console.error('[sarvam-stt] upstream open timeout 400ms');
      logIncident('sarvam_stt_open_timeout', 'Sarvam STT failed to open within 400ms');
      try { vapiWs.send(JSON.stringify({ type: 'error', message: 'stt_upstream_timeout' })); } catch { /* */ }
      try { vapiWs.close(); } catch { /* */ }
      try { sarvamWs.close(); } catch { /* */ }
    }
  }, 400);

  sarvamWs.addEventListener('open', () => {
    clearTimeout(openTimer);
    sarvamReady = true;
    sarvamWs.send(JSON.stringify({
      config: {
        sample_rate: 16000,
        encoding: 'pcm_s16le',
        model: STT_MODEL,
        interim_results: true,
        language_code: language,
      },
    }));
    configAcked = true; // optimistic — flip on first ack frame if Sarvam sends one
    // Flush any buffered PCM frames that arrived during handshake
    for (const frame of pcmBuffer) {
      if (sarvamWs.readyState === WebSocket.OPEN) sarvamWs.send(frame);
    }
    pcmBuffer.length = 0;
  });

  sarvamWs.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
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
      // ignore non-JSON frames
    }
  });

  sarvamWs.addEventListener('error', (ev) => {
    console.error('[sarvam-stt] upstream error', ev);
    logIncident('sarvam_stt_upstream_error', String(ev));
    try { vapiWs.send(JSON.stringify({ type: 'error', message: 'sarvam_upstream_error' })); } catch { /* */ }
  });

  sarvamWs.addEventListener('close', () => {
    console.log('[sarvam-stt] upstream closed');
    try { vapiWs.close(); } catch { /* */ }
  });

  // ── VAPI side: route messages ─────────────────────────────────
  vapiWs.addEventListener('message', (ev) => {
    if (typeof ev.data === 'string') {
      // Config messages from VAPI — could update language mid-call (v1.1)
      return;
    }
    // Binary PCM frame
    if (sarvamReady && configAcked && sarvamWs.readyState === WebSocket.OPEN) {
      sarvamWs.send(ev.data);
    } else {
      // Buffer until Sarvam is ready — guards against 150-300ms loss
      pcmBuffer.push(ev.data as ArrayBufferLike);
      if (pcmBuffer.length > 200) {
        // ~4 seconds at 20ms frames — Sarvam clearly stuck, give up
        console.error('[sarvam-stt] buffer overflow — dropping connection');
        try { vapiWs.close(); } catch { /* */ }
        try { sarvamWs.close(); } catch { /* */ }
      }
    }
  });

  vapiWs.addEventListener('close', () => {
    try { sarvamWs.close(); } catch { /* */ }
  });

  return response;
});

async function logIncident(category: string, description: string): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb.from('ops_incidents').insert({
      severity: 'medium',
      source: 'sarvam_stt_bridge',
      category,
      title: `STT bridge incident: ${category}`,
      description,
    });
  } catch (e) {
    console.error('[sarvam-stt] ops_incidents write failed', e);
  }
}
