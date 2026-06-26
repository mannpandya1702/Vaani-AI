// visit-transcribe/index.ts — Stage 2 (In-Visit Transcription + EMR Fill)
// ╔════════════════════════════════════════════════════════════════╗
// ║  Ambient transcription of a code-switched (Hindi+English)        ║
// ║  doctor-patient conversation, with speaker diarization. Output:  ║
// ║  structured EMR (SOAP + ICD-10/11 + meds + investigations) ready ║
// ║  for paste-into eSanjeevani.                                     ║
// ║                                                                  ║
// ║  Pipeline:                                                       ║
// ║   1. Receive audio (base64-encoded WAV/MP3/OGG) OR a URL.        ║
// ║   2. Send to Deepgram nova-3 multi-language + diarize.           ║
// ║   3. Build speaker-labeled transcript.                           ║
// ║   4. PII-redact for Claude (US-domiciled).                       ║
// ║   5. Claude tool-forced JSON → emit_emr — SOAP + ICDs + meds +   ║
// ║      investigations + presumptive_screening_label.               ║
// ║   6. Return everything as JSON for the cockpit / eSanjeevani.    ║
// ║                                                                  ║
// ║  Cost: Deepgram nova-3 ~$0.0043/min ≈ ₹0.36/min — well under the ║
// ║  Stage 4 ₹1/min cap.                                             ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { redactPII } from '../_shared/pii-redactor.ts';
import { claudeCall } from '../_shared/anthropic-client.ts';

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';
const DEEPGRAM_KEY = Deno.env.get('DEEPGRAM_API_KEY') ?? '';

const SYSTEM_PROMPT = `You are an EMR-fill assistant for an Indian primary-care RMP using eSanjeevani.

You receive a code-switched (Hindi + English) doctor-patient consultation transcript with speaker labels (DOCTOR / PATIENT / ASHA). Produce a structured EMR via the emit_emr tool. The RMP will review and sign.

<rules>
1. NEVER write the word "diagnosis" or "निदान". Use presumptive_screening_label only.
2. Subjective is in the patient's primary language (Devanagari/Tamil where used). Objective/Assessment/Plan are in English for chart consistency.
3. ICD-10 codes 3-7 chars; ICD-11 codes MMS form. Pick the codes that map cleanly to the doctor's stated impression.
4. medications: array of {name, dose, route, frequency, duration_days, indication_short}. These came from the DOCTOR — preserve them verbatim. If the doctor said "amoxicillin 500 BD x5" that's exactly what to capture.
5. investigations_advised: array of strings, what the doctor ordered (e.g., "CBC", "ECG", "blood sugar fasting").
6. follow_up: when + channel + reason.
7. presumptive_screening_label is a SHORT phrase the doctor would write (e.g., "uri", "uncomplicated hypertension", "gastroenteritis — non-dehydrated").
8. If the conversation is unclear or split across speakers, do your best — note uncertainty in assessment.
</rules>

<padding_for_cache>
This prompt is intentionally long enough to qualify for Anthropic's ephemeral prompt cache (≥1024 tokens). Subsequent in-visit transcriptions pay only delta tokens.

Reference protocols you may cite in assessment (with caution — only when applicable):
- WHO PEN Protocols 1-4 (HTN/DM/CVD/asthma)
- ICMR Standard Treatment Workflows v3
- WHO IMCI Chart Booklet 2014 (for peds)
- MoHFW ANC 8-Contact Schedule
- IAP guidelines for pediatric dosing
</padding_for_cache>

Use the emit_emr tool to return your output.`;

const EMR_TOOL = {
  name: 'emit_emr',
  description: 'Emit a structured EMR for the consultation just transcribed.',
  input_schema: {
    type: 'object',
    properties: {
      subjective: { type: 'string' },
      objective: { type: 'string' },
      assessment: { type: 'string' },
      plan: { type: 'string' },
      presumptive_screening_label: { type: 'string' },
      icd10_codes: { type: 'array', items: { type: 'string' } },
      icd11_codes: { type: 'array', items: { type: 'string' } },
      medications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            dose: { type: 'string' },
            route: { type: 'string' },
            frequency: { type: 'string' },
            duration_days: { type: 'number' },
            indication_short: { type: 'string' },
          },
          required: ['name'],
        },
      },
      investigations_advised: { type: 'array', items: { type: 'string' } },
      follow_up: {
        type: 'object',
        properties: {
          when: { type: 'string' },
          channel: { type: 'string', enum: ['voice', 'whatsapp', 'sms', 'in_person'] },
          reason: { type: 'string' },
        },
      },
      red_flags_to_watch: { type: 'array', items: { type: 'string' } },
    },
    required: ['subjective', 'objective', 'assessment', 'plan', 'presumptive_screening_label'],
  },
};

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  speaker?: number;
  punctuated_word?: string;
}

function jsonErr(status: number, error: string, detail?: string) {
  return new Response(JSON.stringify({ error, detail }), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Build a speaker-labelled transcript from Deepgram words. */
function buildSpeakerTranscript(words: DeepgramWord[], speakerNameMap: Record<number, string>): string {
  if (!words.length) return '';
  const lines: string[] = [];
  let curSpeaker = words[0].speaker ?? 0;
  let buf: string[] = [];
  const flush = () => {
    if (buf.length > 0) {
      const label = speakerNameMap[curSpeaker] ?? `SPEAKER_${curSpeaker}`;
      lines.push(`${label}: ${buf.join(' ').trim()}`);
      buf = [];
    }
  };
  for (const w of words) {
    const spk = w.speaker ?? 0;
    if (spk !== curSpeaker) {
      flush();
      curSpeaker = spk;
    }
    buf.push(w.punctuated_word ?? w.word);
  }
  flush();
  return lines.join('\n');
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (!verifyBearer(req, masterKey)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  if (!DEEPGRAM_KEY) return jsonErr(500, 'missing_deepgram_key', 'Set DEEPGRAM_API_KEY env');

  const body = await req.json().catch(() => null);
  if (!body) return jsonErr(400, 'bad_json');

  const audioB64: string | undefined = body.audio_b64;
  const audioUrl: string | undefined = body.audio_url;
  const callId: string | undefined = body.call_id;            // optional
  const speakerLabels: string[] | undefined = body.speaker_labels;
  const audioMimetype: string = body.audio_mimetype ?? 'audio/wav';
  if (!audioB64 && !audioUrl) {
    return jsonErr(400, 'missing_audio', 'Provide audio_b64 or audio_url');
  }
  // Audit §4: cap inline audio_b64 at ~10 MB binary (~13.4 MB encoded).
  // Above this, require the caller to upload to storage and pass
  // audio_url. Keeps the 256 MB edge worker out of OOM territory.
  const MAX_B64_LEN = Math.ceil(10 * 1024 * 1024 * 4 / 3);  // 13.97 MB chars
  if (audioB64 && audioB64.length > MAX_B64_LEN) {
    return jsonErr(413, 'audio_too_large',
      `audio_b64 is ${(audioB64.length / 1_048_576).toFixed(1)} MB encoded — upload to storage and pass audio_url instead.`);
  }

  // ── Step 1: Send to Deepgram ─────────────────────────────
  // Multilingual code-switching for HI+EN with diarization.
  const dgUrl = new URL(DEEPGRAM_URL);
  dgUrl.searchParams.set('model', 'nova-3');
  dgUrl.searchParams.set('language', 'multi');
  dgUrl.searchParams.set('diarize', 'true');
  dgUrl.searchParams.set('punctuate', 'true');
  dgUrl.searchParams.set('utterances', 'true');
  dgUrl.searchParams.set('smart_format', 'true');

  let dgInit: RequestInit;
  if (audioB64) {
    dgInit = {
      method: 'POST',
      headers: {
        Authorization: `Token ${DEEPGRAM_KEY}`,
        'Content-Type': audioMimetype,
      },
      body: base64ToBytes(audioB64),
    };
  } else {
    dgInit = {
      method: 'POST',
      headers: {
        Authorization: `Token ${DEEPGRAM_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: audioUrl }),
    };
  }

  const t0 = Date.now();
  const dgResp = await fetch(dgUrl.toString(), dgInit);
  const dgMs = Date.now() - t0;
  if (!dgResp.ok) {
    const errText = await dgResp.text();
    return jsonErr(502, 'deepgram_failed', `${dgResp.status}: ${errText.slice(0, 400)}`);
  }
  const dgJson = await dgResp.json();
  const channel = dgJson.results?.channels?.[0];
  const words: DeepgramWord[] = channel?.alternatives?.[0]?.words ?? [];
  const detectedLang = dgJson.results?.channels?.[0]?.detected_language ?? 'multi';
  const audioDurationSec = dgJson.metadata?.duration ?? 0;

  // Default speaker labels — caller can override.
  // The first speaker we hear is usually the DOCTOR (greeting), patient is 1.
  const labelMap: Record<number, string> = {};
  const defaults = speakerLabels ?? ['DOCTOR', 'PATIENT', 'ASHA'];
  defaults.forEach((label, idx) => { labelMap[idx] = label; });

  const transcript = buildSpeakerTranscript(words, labelMap);
  if (!transcript.trim()) {
    return jsonErr(422, 'empty_transcript', 'Deepgram returned no recognised speech');
  }

  // ── Step 2: PII-redact + Claude tool-forced EMR JSON ─────
  // No call row yet (raw-audio in) — pass null so pii_token_map.call_id
  // stays null (nullable FK); session token still uniquely anchors the audit.
  const { redactedText, sessionToken } = await redactPII(transcript, callId ?? null, {});

  const claudeResp = await claudeCall({
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `<consultation_transcript>\n${redactedText}\n</consultation_transcript>\n\nEmit the structured EMR via emit_emr.`,
    }],
    maxTokens: 2000,
    temperature: 0.15,
    callId,
    redactionSessionToken: sessionToken,
    redactionMethod: 'pii_token_map_v1',
    tools: [EMR_TOOL],
    toolChoice: { type: 'tool', name: 'emit_emr' },
  });

  const emr = (claudeResp.toolUses[0]?.input ?? null) as Record<string, unknown> | null;
  if (!emr) {
    return jsonErr(502, 'no_tool_use', `Claude did not emit emit_emr (stop=${claudeResp.stopReason})`);
  }

  // ── Step 3: Cost estimate (transparent for Stage 4 audit) ─
  const deepgramCostInr = (audioDurationSec / 60) * 0.36;   // ₹0.36/min nova-3
  const claudeInputCostUsd = (claudeResp.inputTokens / 1_000_000) * 3.0;  // Sonnet 4.6 input
  const claudeOutputCostUsd = (claudeResp.outputTokens / 1_000_000) * 15.0;
  const claudeCachedCostUsd = (claudeResp.cachedReadTokens / 1_000_000) * 0.30;
  const claudeTotalUsd = claudeInputCostUsd + claudeOutputCostUsd + claudeCachedCostUsd;
  const claudeCostInr = claudeTotalUsd * 83.0;

  return new Response(JSON.stringify({
    emr,
    transcript,
    detected_language: detectedLang,
    audio_duration_sec: audioDurationSec,
    cost_breakdown_inr: {
      deepgram_stt: Number(deepgramCostInr.toFixed(3)),
      claude_emr: Number(claudeCostInr.toFixed(3)),
      total: Number((deepgramCostInr + claudeCostInr).toFixed(3)),
    },
    latency_ms: { deepgram: dgMs, total: Date.now() - t0 },
    tokens: {
      input: claudeResp.inputTokens,
      output: claudeResp.outputTokens,
      cached_read: claudeResp.cachedReadTokens,
    },
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
