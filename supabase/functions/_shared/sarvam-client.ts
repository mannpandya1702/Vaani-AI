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
// Bulbul v3 voices (per Sarvam best-practices docs, Jun 2026):
//   Hindi female: priya (warmest), suhani
//   Tamil female: ishita, ritu
//   Male: shubh (Hindi), ratan (Tamil)
// v2 deprecated voices (anushka, vidya, ...) are not used.
const TTS_SPEAKER = Deno.env.get('SARVAM_TTS_SPEAKER') ?? 'priya';
const TTS_MODEL = Deno.env.get('SARVAM_TTS_MODEL') ?? 'bulbul:v3';

// Per-language speaker preference for didi persona.
// Hindi: ritu (user A/B 2026-06-23 — lighter/younger timbre vs priya/pooja)
// Tamil: ishita (Sarvam best-practices default)
const SPEAKER_BY_LANG: Record<string, string> = {
  'hi-IN': 'ritu',
  'ta-IN': 'ishita',
  'en-IN': 'ritu',
};

export function defaultSpeakerForLang(lang: string): string {
  return SPEAKER_BY_LANG[lang] ?? TTS_SPEAKER;
}

function apiKey(): string {
  const k = Deno.env.get('SARVAM_API_KEY');
  if (!k) throw new Error('Missing SARVAM_API_KEY');
  return k;
}

const STT_MODEL = Deno.env.get('SARVAM_STT_MODEL') ?? 'saaras:v3';

// Exponential backoff retry on 429 + 5xx (Aman §16)
async function sarvamFetch(url: string, init: RequestInit): Promise<Response> {
  const backoffs = [100, 300, 900];
  let lastResp: Response | null = null;
  for (let i = 0; i <= backoffs.length; i++) {
    lastResp = await fetch(url, init);
    if (lastResp.ok) return lastResp;
    // Don't retry 4xx (programming errors); only 429 + 5xx
    if (lastResp.status !== 429 && lastResp.status < 500) return lastResp;
    if (i === backoffs.length) return lastResp;
    // Jitter ±25% to avoid thundering herd
    const wait = backoffs[i] * (0.75 + Math.random() * 0.5);
    await new Promise((r) => setTimeout(r, wait));
  }
  return lastResp!;
}

// ── Saarika/Saaras STT (one-shot, non-streaming) ────────────────
export async function sarvamSTT(audio: Blob | ArrayBuffer, opts: {
  languageCode?: string;
  model?: string;
} = {}): Promise<{ transcript: string; detected_lang?: string }> {
  const form = new FormData();
  form.append('file', new Blob([audio instanceof Blob ? await audio.arrayBuffer() : audio]));
  form.append('language_code', opts.languageCode ?? 'unknown');
  form.append('model', opts.model ?? STT_MODEL);
  const resp = await sarvamFetch(SARVAM_STT_URL, {
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
// Bulbul v3 does NOT accept pitch or loudness (rejected with 400). Only `pace`
// is supported. Pace 1.0 = natural, per Sarvam best-practices doc.
export async function sarvamTTS(text: string, opts: {
  targetLang?: string;
  speaker?: string;
  pace?: number;
} = {}): Promise<ArrayBuffer> {
  const lang = opts.targetLang ?? 'hi-IN';
  const body: Record<string, unknown> = {
    inputs: [text],
    target_language_code: lang,
    speaker: opts.speaker ?? defaultSpeakerForLang(lang),
    model: TTS_MODEL,
    pace: opts.pace ?? 1.0,
    sample_rate: 16000, // VAPI customVoice expects 16kHz s16le
  };
  const resp = await sarvamFetch(SARVAM_TTS_URL, {
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
    // sarvam-m deprecated June 2026 → use sarvam-30b (or sarvam-105b for harder tasks)
    model: Deno.env.get('SARVAM_M_MODEL') ?? 'sarvam-30b',
    messages: params.messages,
    temperature: params.temperature ?? 0.1,
    max_tokens: params.maxTokens ?? 512,
  };
  if (params.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  const resp = await sarvamFetch(SARVAM_M_URL, {
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
