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

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

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
  if (vapiCallId) {
    const { data } = await sb.from('calls').select('id, lang_declared, lang_detected, patient_id').eq('vapi_call_id', vapiCallId).maybeSingle();
    dbCallId = data?.id ?? null;
  }

  // Decide language: VAPI doesn't pass it explicitly. Default hi.
  // (Later, the patient row will tell us.)
  const lang = 'hi';

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
        await sb.from('refusal_log').insert({
          call_id: dbCallId,
          category: match.category,
          script_id: match.script_id,
          script_version: 'v2',
          lang,
          source: 'vapi_custom_llm_intercept',
          spoken_text: refusalText,
          matched_phrase_redacted: match.matched_phrase_redacted,
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
  const redact = async (text: string): Promise<string> => {
    if (!text) return '';
    const { redactedText, sessionToken: tok } = await redactPII(text, dbCallId, {});
    if (!sessionToken) sessionToken = tok;
    return redactedText;
  };

  const anthropicMessages: { role: 'user' | 'assistant'; content: unknown }[] = [];
  for (const m of dialogue) {
    if (m.role === 'assistant') {
      const blocks: unknown[] = [];
      const text = typeof m.content === 'string' ? m.content : '';
      if (text) blocks.push({ type: 'text', text: await redact(text) });
      for (const tc of m.tool_calls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name,
          input: safeParse(await redact(tc.function?.arguments ?? '{}')),
        });
      }
      anthropicMessages.push({ role: 'assistant', content: blocks.length ? blocks : '' });
    } else if (m.role === 'tool') {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
      anthropicMessages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: await redact(text) }],
      });
    } else {
      anthropicMessages.push({ role: 'user', content: await redact(typeof m.content === 'string' ? m.content : '') });
    }
  }

  // ── STEP 3: cross_border_transfers audit log ────────────────
  await sb.from('cross_border_transfers').insert({
    call_id: dbCallId,
    target_region: 'us-east-1',
    target_provider: 'anthropic',
    redaction_method: 'pii_token_map_v1',
    redaction_session_token: sessionToken,
    payload_size_bytes: JSON.stringify(anthropicMessages).length,
    purpose: 'live_voice_screening',
  }).then(() => {}, (e: any) => console.error('[cross-border-audit]', e));

  // ── STEP 4: Call Claude with cache_control on system + tools ──
  const anthropicTools = toAnthropicTools(body.tools);
  const anthropicBody: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: body.max_tokens ?? 512,
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
              emit(controller, { content: data.delta.text });
            } else if (eventName === 'message_delta' && data?.delta?.stop_reason === 'tool_use') {
              stopReason = 'tool_calls';
            } else if (eventName === 'message_stop') {
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
