// _shared/anthropic-client.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Claude client wrapper with two non-negotiable invariants:      ║
// ║                                                                 ║
// ║   1. EVERY call writes a row to cross_border_transfers BEFORE   ║
// ║      the request fires (Anand §6).                              ║
// ║   2. The caller MUST pass `redactedText` produced by            ║
// ║      pii-redactor.ts — raw PHI cannot be sent (Red Line #5).    ║
// ║                                                                 ║
// ║  We expose a thin Messages API. Prompt caching is enabled by    ║
// ║  default on the system block to keep cost <₹2/consult.          ║
// ╚════════════════════════════════════════════════════════════════╝

import { auditCrossBorderTransfer } from './cross-border-audit.ts';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content:
    | string
    | Array<{
        type: 'text';
        text: string;
        cache_control?: { type: 'ephemeral' };
      }>;
}

export interface ClaudeCallParams {
  /** System prompt (will be prompt-cached). */
  system: string;
  /** Already-PII-redacted messages. */
  messages: ClaudeMessage[];
  maxTokens: number;
  temperature?: number;
  responseFormat?: 'json' | 'text';
  /** For audit lineage. */
  callId?: string;
  turnId?: number;
  /** Session token from redactor — confirms redaction ran. */
  redactionSessionToken: string;
  redactionMethod?: string;
  /** Optional tool-use schema for forced JSON. */
  tools?: unknown[];
  toolChoice?: 'auto' | { type: 'tool'; name: string };
}

export interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  stopReason: string;
  raw: unknown;
}

export async function claudeCall(params: ClaudeCallParams): Promise<ClaudeResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  // Concatenate the payload text we are about to send for audit hashing.
  const payloadText = `[system]\n${params.system}\n[messages]\n` +
    params.messages.map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n');

  // 1. WRITE the audit row BEFORE the request fires.
  //    (If the request fails, the audit row stands as "we attempted".)
  await auditCrossBorderTransfer({
    callId: params.callId,
    turnId: params.turnId,
    provider: 'anthropic',
    model: DEFAULT_MODEL,
    region: 'us-east-1', // Anthropic API default; switch to ap-south-1 on Bedrock migration
    regionAttestedBy: 'anthropic_api_default',
    payloadPiiRedacted: true, // invariant: caller must have redacted
    redactionMethod: params.redactionMethod ?? 'pii_token_map_v1',
    redactionSessionToken: params.redactionSessionToken,
    payloadText,
  });

  // 2. Build the request body.
  const body: Record<string, unknown> = {
    model: DEFAULT_MODEL,
    max_tokens: params.maxTokens,
    temperature: params.temperature ?? 0.1,
    // Prompt-cache the static system block — ~60% savings on repeat calls.
    system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
    messages: params.messages,
  };
  if (params.tools) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;

  // 3. Fire.
  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const json = await resp.json();

  // 4. Extract text from content blocks (could be text or tool_use).
  let text = '';
  for (const block of json.content ?? []) {
    if (block.type === 'text') text += block.text;
    if (block.type === 'tool_use') text = JSON.stringify(block.input);
  }

  return {
    text,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    cachedTokens: json.usage?.cache_read_input_tokens ?? 0,
    stopReason: json.stop_reason ?? 'unknown',
    raw: json,
  };
}
