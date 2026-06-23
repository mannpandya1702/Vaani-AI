// _shared/sarvam-client.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Sarvam AI client wrappers — Saarika STT + Bulbul TTS + Sarvam-M║
// ║                                                                 ║
// ║  Sarvam is India-domiciled, so it MAY see raw text.             ║
// ║  No PII redaction required for Sarvam-M intent classification.  ║
// ║  Use this for: vernacular intent, off-topic detection, in-      ║
// ║  language summaries, red-flag classifier (cheap tier).          ║
// ║                                                                 ║
// ║  STT bridge: streaming WS — see supabase/functions/             ║
// ║    sarvam-stt-bridge/                                           ║
// ║  TTS bridge: HTTP — see supabase/functions/sarvam-tts-bridge/   ║
// ╚════════════════════════════════════════════════════════════════╝

const SARVAM_STT_URL = Deno.env.get('SARVAM_STT_ENDPOINT')
  ?? 'https://api.sarvam.ai/speech-to-text-translate';
const SARVAM_TTS_URL = Deno.env.get('SARVAM_TTS_ENDPOINT')
  ?? 'https://api.sarvam.ai/text-to-speech';
const SARVAM_M_URL = Deno.env.get('SARVAM_M_ENDPOINT')
  ?? 'https://api.sarvam.ai/v1/chat/completions';
const TTS_SPEAKER = Deno.env.get('SARVAM_TTS_SPEAKER') ?? 'anushka';
const TTS_MODEL = Deno.env.get('SARVAM_TTS_MODEL') ?? 'bulbul:v2';

function apiKey(): string {
  const k = Deno.env.get('SARVAM_API_KEY');
  if (!k) throw new Error('Missing SARVAM_API_KEY');
  return k;
}

// ── Saarika STT (one-shot, non-streaming) ───────────────────────
export async function sarvamSTT(audio: Blob | ArrayBuffer, opts: {
  languageCode?: string;
  model?: string;
} = {}): Promise<{ transcript: string; detected_lang?: string }> {
  const form = new FormData();
  form.append('file', new Blob([audio instanceof Blob ? await audio.arrayBuffer() : audio]));
  form.append('language_code', opts.languageCode ?? 'unknown');
  form.append('model', opts.model ?? 'saarika:v2');
  const resp = await fetch(SARVAM_STT_URL, {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey() },
    body: form,
  });
  if (!resp.ok) throw new Error(`Sarvam STT ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return {
    transcript: json.transcript ?? '',
    detected_lang: json.language_code,
  };
}

// ── Bulbul TTS ──────────────────────────────────────────────────
export async function sarvamTTS(text: string, opts: {
  targetLang?: string;
  speaker?: string;
  pitch?: number;
  pace?: number;
  loudness?: number;
} = {}): Promise<ArrayBuffer> {
  const body = {
    inputs: [text],
    target_language_code: opts.targetLang ?? 'hi-IN',
    speaker: opts.speaker ?? TTS_SPEAKER,
    model: TTS_MODEL,
    pitch: opts.pitch ?? -0.15, // Aanya: Vaani Didi a touch lower pitch
    pace: opts.pace ?? 0.9,
    loudness: opts.loudness ?? 1.2,
  };
  const resp = await fetch(SARVAM_TTS_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Sarvam TTS ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  // Bulbul returns base64-encoded WAV in `audios[0]`
  const b64 = json.audios?.[0];
  if (!b64) throw new Error('Sarvam TTS returned no audio');
  return base64ToArrayBuffer(b64);
}

// ── Sarvam-M (Indic LLM — intent / small talk / vernacular) ─────
export interface SarvamMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function sarvamM(params: {
  messages: SarvamMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const body: Record<string, unknown> = {
    model: 'sarvam-m',
    messages: params.messages,
    temperature: params.temperature ?? 0.1,
    max_tokens: params.maxTokens ?? 512,
  };
  if (params.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  const resp = await fetch(SARVAM_M_URL, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Sarvam-M ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
