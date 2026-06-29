// vapi-custom-llm/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Custom-LLM proxy for VAPI's live voice path.                   ║
// ║                                                                 ║
// ║  Closes 9-dim audit §2 findings D1 + D2:                       ║
// ║   - D1: live caller speech was hitting Anthropic US with no    ║
// ║         PII redaction (DPDP §16, Anand §3.9, ABDM HDM ¶7.6     ║
// ║         violation on every turn).                              ║
// ║   - D2: PCPNDT/MHCA/POCSO refusals only fired post-call. The   ║
// ║         live LLM could improv around statutorily-mandated      ║
// ║         scripts. PCPNDT s.22 / MHCA s.18 exposure.             ║
// ║                                                                 ║
// ║  VAPI hits this endpoint in OpenAI-compatible chat-completions ║
// ║  format. For each turn we:                                     ║
// ║   1. Check the latest USER message against the deterministic   ║
// ║      refusal triggers (PCPNDT / MHCA / POCSO). If matched,     ║
// ║      return the verbatim language-appropriate refusal as the   ║
// ║      assistant's response. Bypass Claude entirely.             ║
// ║   2. Otherwise, PII-redact the whole conversation, call Claude ║
// ║      with cache_control on the system block, log a row to      ║
// ║      cross_border_transfers, stream the response back in       ║
// ║      OpenAI SSE format.                                        ║
// ║                                                                 ║
// ║  Auth: Bearer WEBHOOK_MASTER_KEY (set on VAPI assistant under  ║
// ║  model.headers.Authorization).                                 ║
// ║                                                                 ║
// ║  To enable on the assistant:                                   ║
// ║    PATCH /assistant/<id> {                                     ║
// ║      "model": {                                                ║
// ║        "provider": "custom-llm",                               ║
// ║        "url": "<SUPABASE_URL>/functions/v1/vapi-custom-llm",   ║
// ║        "model": "claude-sonnet-4-6",                           ║
// ║        ...everything else preserved...                          ║
// ║      }                                                          ║
// ║    }                                                            ║
// ║                                                                 ║
// ║  Until the assistant is flipped, VAPI keeps using its own       ║
// ║  managed Anthropic provider. This function is wired but inert   ║
// ║  until you flip the assistant config. See `eval/enable-custom-  ║
// ║  llm.ts` for the one-liner.                                     ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { redactPII } from '../_shared/pii-redactor.ts';
import { checkRefusal, scriptForLang } from '../_shared/refusal-scripts.ts';
import { auditCrossBorderTransfer } from '../_shared/cross-border-audit.ts';

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
// Live-voice model. The conversation is short screening Q&A — Haiku's much lower
// time-to-first-token cuts per-turn latency hard. The heavy clinical reasoning
// (triage/SOAP/shadow) runs post-call on Sonnet via the direct anthropic-client,
// NOT through this proxy, so it is unaffected. Override via env to roll back.
const VOICE_LLM_MODEL = Deno.env.get('VOICE_LLM_MODEL') ?? 'claude-haiku-4-5-20251001';

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | unknown;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: { name: string; description?: string; parameters?: unknown };
}

interface OpenAIRequest {
  model?: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  // VAPI forwards the assistant's tools so the model can call
  // capture_consent / escalate_to_doctor. We MUST translate these to
  // Anthropic's tool format or Claude verbalises the call as text.
  tools?: OpenAITool[];
  tool_choice?: unknown;
  // VAPI passes its call object inline so we can correlate
  call?: { id?: string };
}

// OpenAI function tools → Anthropic tools.
function toAnthropicTools(tools?: OpenAITool[]) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools
    .filter((t) => t?.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description ?? '',
      input_schema: (t.function.parameters as Record<string, unknown>) ?? { type: 'object', properties: {} },
    }));
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (!verifyBearer(req, masterKey)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  if (!ANTHROPIC_KEY) {
    return jsonErr(500, 'missing_anthropic_key');
  }

  const body = (await req.json().catch(() => null)) as OpenAIRequest | null;
  if (!body || !Array.isArray(body.messages)) {
    return jsonErr(400, 'bad_request', 'expected OpenAI-compat chat completions');
  }

  const wantsStream = body.stream === true;
  const sb = supabaseAdmin();

  // Map VAPI's vapi_call_id → our calls.id (if a row exists). Best-effort.
  const vapiCallId = body.call?.id ?? null;
  let dbCallId: string | null = null;
  let patientId: string | null = null;
  let tenantId: string | null = null;
  let callLang: string | null = null;
  if (vapiCallId) {
    const { data } = await sb.from('calls')
      .select('id, lang_declared, lang_detected, patient_id, tenant_id')
      .eq('vapi_call_id', vapiCallId).maybeSingle();
    dbCallId = data?.id ?? null;
    patientId = (data as any)?.patient_id ?? null;
    tenantId = (data as any)?.tenant_id ?? null;
    callLang = (data as any)?.lang_declared ?? (data as any)?.lang_detected ?? null;
  }

  // Refusal-script language from the call (Tamil routes through this proxy too
  // now — a Tamil PCPNDT/MHCA refusal must speak the Tamil script). Default hi.
  const lang = callLang ?? 'hi';

  // ── STEP 1: Refusal interception (D2) ───────────────────────
  // Find the latest user message; check against checkRefusal.
  const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
  const lastUserText = typeof lastUser?.content === 'string' ? lastUser.content : '';
  if (lastUserText) {
    const match = checkRefusal(lastUserText);
    if (match) {
      const refusalText = scriptForLang(match, lang);
      console.log(`[vapi-custom-llm] refusal intercepted: ${match.category}`);
      // Audit: write a refusal_log row so we have a permanent record
      // that the deterministic script fired (not Claude's improv).
      if (dbCallId) {
        // Columns must match the live table (category/trigger_text/
        // refusal_script_used are NOT NULL). The prior insert used
        // script_id/spoken_text/lang/source — none exist — so every
        // live-voice refusal silently failed to log (refusal_log=0).
        // PCPNDT rows additionally require audio evidence (chk_pcpndt_complete)
        // which this text proxy has no access to — those are completed by the
        // post-call audit path. MHCA / POCSO / drug-Rx log fine here.
        await sb.from('refusal_log').insert({
          call_id: dbCallId,
          patient_id: patientId,
          tenant_id: tenantId,
          category: match.category,
          trigger_text: match.matched_phrase_redacted,
          refusal_script_used: match.script_id,
        }).then(() => {}, (e: any) => console.error('[refusal_log insert]', e));
      }
      return openaiResponse(refusalText, body.model ?? 'claude-sonnet-4-6', wantsStream);
    }
  }

  // ── STEP 2: PII-redact + build Anthropic messages (tool-aware) ──
  // system is our static prompt (never PII). Each turn is redacted, and
  // tool_use / tool_result blocks are preserved so the model can actually
  // CALL capture_consent / escalate_to_doctor instead of speaking the call.
  const systemPrompt = String(body.messages.find((m) => m.role === 'system')?.content ?? '');
  const dialogue = body.messages.filter((m) => m.role !== 'system');
  let sessionToken: string | null = null;
  // background persist → the pii_token_map insert never sits on the per-turn
  // voice latency path (that DB await, done sequentially over a growing
  // history, was why responses got slower and slower as the call went on).
  const redact = async (text: string): Promise<string> => {
    if (!text) return '';
    const { redactedText, sessionToken: tok } = await redactPII(text, dbCallId, {}, { persist: 'background' });
    if (!sessionToken) sessionToken = tok;
    return redactedText;
  };

  // ── OpenAI branch (VOICE_LLM_MODEL = gpt-*) ─────────────────
  // The agent already speaks OpenAI chat-completions, so this is a near
  // passthrough: redact each turn's PII in place, remap the params the
  // GPT-5 family is fussy about (max_tokens → max_completion_tokens;
  // reasoning_effort:none for instant turns; drop the incoming temperature,
  // which gpt-5.2 rejects unless it's the default), forward, and stream the
  // OpenAI SSE straight back — no Anthropic translation. STEP 1's statutory
  // refusal scripts already fired above, so a PCPNDT/MHCA/POCSO turn never
  // reaches GPT either. Redaction (STEP 2 redact()) still runs on every turn,
  // so no raw PII crosses to OpenAI US — DPDP §16 / ABDM HDM ¶7.6 hold.
  const isOpenAiModel = /^(gpt|o\d|chatgpt)/i.test(VOICE_LLM_MODEL);
  if (isOpenAiModel) {
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
    if (!openaiKey) return jsonErr(500, 'missing_openai_key');

    const openaiDialogue = await Promise.all(dialogue.map(async (m) => {
      if (m.role === 'assistant') {
        const out: Record<string, unknown> = {
          role: 'assistant',
          content: typeof m.content === 'string' ? m.content : (m.content ?? null),
        };
        if (m.tool_calls?.length) {
          out.tool_calls = await Promise.all(m.tool_calls.map(async (tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.function?.name, arguments: await redact(tc.function?.arguments ?? '{}') },
          })));
        }
        return out;
      }
      if (m.role === 'tool') {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
        return { role: 'tool', tool_call_id: m.tool_call_id ?? '', content: await redact(text) };
      }
      return { role: 'user', content: await redact(typeof m.content === 'string' ? m.content : '') };
    }));

    const openaiMessages = [{ role: 'system', content: systemPrompt }, ...openaiDialogue];

    auditCrossBorderTransfer({
      callId: dbCallId ?? undefined,
      provider: 'openai',
      model: VOICE_LLM_MODEL,
      region: 'us-east-1',
      regionAttestedBy: 'openai_api_default',
      payloadPiiRedacted: true,
      redactionMethod: 'pii_token_map_v1',
      redactionSessionToken: sessionToken,
      payloadText: JSON.stringify(openaiMessages),
    }).catch((e) => console.error('[cross-border-audit]', e));

    const openaiBody: Record<string, unknown> = {
      model: VOICE_LLM_MODEL,
      messages: openaiMessages,
      max_completion_tokens: (body as any).max_completion_tokens ?? body.max_tokens ?? 384,
      stream: wantsStream,
    };
    if (Array.isArray(body.tools) && body.tools.length) openaiBody.tools = body.tools;
    if (body.tool_choice) openaiBody.tool_choice = body.tool_choice;
    // gpt-5.* reasoning models: 'none' = instant (zero reasoning tokens),
    // the lowest-latency mode for live voice. chat-latest is NOT a reasoning
    // model and 400s on reasoning_effort, so guard it out.
    if (/^gpt-5/i.test(VOICE_LLM_MODEL) && !/chat/i.test(VOICE_LLM_MODEL)) {
      openaiBody.reasoning_effort = 'none';
    }

    const oaUpstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(openaiBody),
    });

    if (!oaUpstream.ok) {
      const errText = await oaUpstream.text();
      console.error('[vapi-custom-llm] openai upstream error', oaUpstream.status, errText.slice(0, 200));
      return jsonErr(502, 'openai_upstream_error', `${oaUpstream.status}: ${errText.slice(0, 200)}`);
    }

    // OpenAI already emits OpenAI format — the agent consumes it directly.
    if (wantsStream) {
      return new Response(oaUpstream.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
        },
      });
    }
    return new Response(await oaUpstream.text(), {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  // Build messages in PARALLEL (Promise.all), not a sequential await-per-message
  // loop — and DON'T redact Vaani's OWN output (assistant text is PII-free by
  // prompt design; only patient utterances + tool args/results carry PII).
  const anthropicMessages = await Promise.all(dialogue.map(async (m) => {
    if (m.role === 'assistant') {
      const blocks: unknown[] = [];
      const text = typeof m.content === 'string' ? m.content : '';
      if (text) blocks.push({ type: 'text', text });  // own output — no redaction
      for (const tc of m.tool_calls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name,
          input: safeParse(await redact(tc.function?.arguments ?? '{}')),
        });
      }
      return { role: 'assistant' as const, content: blocks.length ? blocks : '' };
    }
    if (m.role === 'tool') {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
      return { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: await redact(text) }] };
    }
    return { role: 'user' as const, content: await redact(typeof m.content === 'string' ? m.content : '') };
  }));

  // ── STEP 3: cross_border_transfers audit log ────────────────
  // Use the shared helper (same path the post-call functions use, which
  // writes correctly). The prior inline insert used non-existent columns
  // (target_region/target_provider/payload_size_bytes/purpose) so every
  // live-voice turn transferred to US Claude with ZERO audit row. Kept
  // non-blocking (.catch) so a transient audit failure never breaks a
  // live call; the helper still re-scans for phone/ABHA/Aadhaar leaks.
  auditCrossBorderTransfer({
    callId: dbCallId ?? undefined,
    provider: 'anthropic',
    model: VOICE_LLM_MODEL,
    region: 'us-east-1',
    regionAttestedBy: 'anthropic_api_default',
    payloadPiiRedacted: true,
    redactionMethod: 'pii_token_map_v1',
    redactionSessionToken: sessionToken,
    payloadText: JSON.stringify(anthropicMessages),
  }).catch((e) => console.error('[cross-border-audit]', e));

  // ── STEP 4: Call Claude with cache_control on system + tools ──
  const anthropicTools = toAnthropicTools(body.tools);
  const anthropicBody: Record<string, unknown> = {
    model: VOICE_LLM_MODEL,
    max_tokens: body.max_tokens ?? 384,
    temperature: body.temperature ?? 0.2,
    stream: wantsStream,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: anthropicMessages,
  };
  if (anthropicTools) anthropicBody.tools = anthropicTools;

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(anthropicBody),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error('[vapi-custom-llm] anthropic upstream error', upstream.status, errText.slice(0, 200));
    return jsonErr(502, 'anthropic_upstream_error', `${upstream.status}: ${errText.slice(0, 200)}`);
  }

  if (wantsStream) {
    return new Response(anthropicSseToOpenAiSse(upstream.body!), {
      status: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      },
    });
  }

  // Non-streaming path — translate text + tool_use blocks.
  const j = await upstream.json();
  const blocks = Array.isArray(j?.content) ? j.content : [];
  const text = blocks.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
  const toolUses = blocks.filter((b: any) => b?.type === 'tool_use');
  if (toolUses.length > 0) {
    return openaiToolResponse(text, toolUses, body.model ?? 'claude-sonnet-4-6');
  }
  return openaiResponse(text, body.model ?? 'claude-sonnet-4-6', false);
});

// Non-streaming OpenAI response carrying tool_calls (finish_reason=tool_calls).
function openaiToolResponse(text: string, toolUses: any[], model: string): Response {
  const tool_calls = toolUses.map((b) => ({
    id: b.id,
    type: 'function',
    function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
  }));
  return new Response(JSON.stringify({
    id: `chatcmpl_${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text || null, tool_calls },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

function openaiResponse(text: string, model: string, stream: boolean): Response {
  if (!stream) {
    return new Response(JSON.stringify({
      id: `cmpl_${crypto.randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }
  // Stream as a single SSE chunk + DONE
  const encoder = new TextEncoder();
  const stream$ = new ReadableStream({
    start(controller) {
      const id = `chatcmpl_${crypto.randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);
      const evt = (delta: Record<string, unknown>) =>
        `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`;
      const done = `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
      controller.enqueue(encoder.encode(evt({ role: 'assistant', content: text })));
      controller.enqueue(encoder.encode(done));
      controller.close();
    },
  });
  return new Response(stream$, {
    status: 200,
    headers: {
      ...corsHeaders,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    },
  });
}

/**
 * Streaming reasoning-stripper. Some Claude models (notably Sonnet on a long,
 * instruction-dense clinical prompt) emit a soft chain-of-thought as PLAIN
 * TEXT wrapped in <thinking>…</thinking> — this is NOT Anthropic's extended-
 * thinking channel (which we never enable and never forward), it's literal
 * markup in the text block. Because every text_delta is streamed to Sarvam
 * TTS, that monologue gets SPOKEN to the patient (the "Vaani read her thoughts
 * aloud" bug — call e9f5002d, turn 23). This filter removes <thinking>/<think>
 * spans from the live text stream before it ever reaches the voice. It is
 * stateful and tolerant of a tag arriving split across SSE chunks.
 */
const _OPEN_TAG = /<think(?:ing)?\s*>/i;
const _CLOSE_TAG = /<\/think(?:ing)?\s*>/i;
const _OPEN_CANDS = ['<thinking>', '<think>'];
const _CLOSE_CANDS = ['</thinking>', '</think>'];

// Longest suffix of `s` that is a strict prefix of any candidate tag — i.e. how
// much trailing text must be held back in case a tag is still arriving.
function _partialTailLen(s: string, cands: string[]): number {
  const lower = s.toLowerCase();
  let best = 0;
  for (const tag of cands) {
    const max = Math.min(lower.length, tag.length - 1);
    for (let k = max; k > best; k--) {
      if (tag.startsWith(lower.slice(lower.length - k))) { best = k; break; }
    }
  }
  return best;
}

class ReasoningStripper {
  private hold = '';
  private inThinking = false;

  feed(chunk: string): string {
    this.hold += chunk;
    let out = '';
    for (;;) {
      if (!this.inThinking) {
        const m = _OPEN_TAG.exec(this.hold);
        if (m) {
          out += this.hold.slice(0, m.index);
          this.hold = this.hold.slice(m.index + m[0].length);
          this.inThinking = true;
          continue;
        }
        // No complete open tag: emit everything except a tail that could be a
        // partial '<thinking>' still arriving (so we never speak half a tag).
        const keep = _partialTailLen(this.hold, _OPEN_CANDS);
        out += this.hold.slice(0, this.hold.length - keep);
        this.hold = this.hold.slice(this.hold.length - keep);
        return out;
      }
      const c = _CLOSE_TAG.exec(this.hold);
      if (c) {
        this.hold = this.hold.slice(c.index + c[0].length);
        this.inThinking = false;
        continue;
      }
      // Inside a thinking block: discard everything except a possible partial
      // closing tag we might still be mid-receiving. `hold` stays bounded.
      const keep = _partialTailLen(this.hold, _CLOSE_CANDS);
      this.hold = this.hold.slice(this.hold.length - keep);
      return out;
    }
  }

  // Stream ended: drop an unclosed thinking block; otherwise release whatever
  // is held, unless it's a dangling partial tag (never speak a stray "<thi…").
  flush(): string {
    if (this.inThinking) { this.hold = ''; return ''; }
    const out = this.hold;
    this.hold = '';
    return /^<\/?think/i.test(out) ? '' : out;
  }
}

/**
 * Translate Anthropic's `messages` SSE stream into OpenAI's
 * chat.completion.chunk SSE stream that VAPI consumes.
 *
 * Text:  content_block_delta(text_delta) → choices[0].delta.content
 * Tools: content_block_start(tool_use)   → delta.tool_calls[{id,name,arguments:''}]
 *        content_block_delta(input_json_delta) → delta.tool_calls[{arguments: partial}]
 *        finish_reason becomes 'tool_calls' when any tool_use occurred.
 * End:   message_stop → finish_reason + [DONE]
 *
 * Without the tool branch, Claude's tool intent (capture_consent / escalate_
 * to_doctor) leaked back to VAPI as spoken TEXT — the "agent says consent
 * capture out loud" bug.
 */
function anthropicSseToOpenAiSse(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const id = `chatcmpl_${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  let buf = '';
  let firstSent = false;
  let stopReason: 'stop' | 'tool_calls' = 'stop';
  const blockToToolIdx = new Map<number, number>();
  let toolCount = 0;
  // Removes any <thinking> monologue from the text before it reaches TTS.
  const stripper = new ReasoningStripper();

  const emit = (controller: ReadableStreamDefaultController, delta: Record<string, unknown>, finish: string | null = null) => {
    if (!firstSent) { delta = { role: 'assistant', ...delta }; firstSent = true; }
    controller.enqueue(encoder.encode(
      `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: 'claude-sonnet-4-6', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
    ));
  };

  return new ReadableStream({
    async start(controller) {
      const reader = input.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split(/\r?\n\r?\n/);
          buf = parts.pop() ?? '';
          for (const part of parts) {
            let eventName = '';
            let dataStr = '';
            for (const line of part.split(/\r?\n/)) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
            }
            if (!eventName || !dataStr) continue;
            let data: any;
            try { data = JSON.parse(dataStr); } catch { continue; }

            if (eventName === 'content_block_start' && data?.content_block?.type === 'tool_use') {
              const cb = data.content_block;
              const toolIdx = toolCount++;
              blockToToolIdx.set(data.index, toolIdx);
              stopReason = 'tool_calls';
              emit(controller, { tool_calls: [{ index: toolIdx, id: cb.id, type: 'function', function: { name: cb.name, arguments: '' } }] });
            } else if (eventName === 'content_block_delta' && data?.delta?.type === 'input_json_delta') {
              const toolIdx = blockToToolIdx.get(data.index) ?? 0;
              emit(controller, { tool_calls: [{ index: toolIdx, function: { arguments: data.delta.partial_json ?? '' } }] });
            } else if (eventName === 'content_block_delta' && data?.delta?.type === 'text_delta') {
              const clean = stripper.feed(data.delta.text ?? '');
              if (clean) emit(controller, { content: clean });
            } else if (eventName === 'message_delta' && data?.delta?.stop_reason === 'tool_use') {
              stopReason = 'tool_calls';
            } else if (eventName === 'message_stop') {
              const tail = stripper.flush();
              if (tail) emit(controller, { content: tail });
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: 'claude-sonnet-4-6', choices: [{ index: 0, delta: {}, finish_reason: stopReason }] })}\n\n`,
              ));
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            }
          }
        }
      } catch (e) {
        console.error('[vapi-custom-llm] stream error', e);
        controller.error(e);
      } finally {
        try { controller.close(); } catch {/* already closed */}
      }
    },
  });
}

function jsonErr(status: number, error: string, detail?: string): Response {
  return new Response(JSON.stringify({ error, detail }), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
