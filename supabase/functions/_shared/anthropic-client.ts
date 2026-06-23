// _shared/anthropic-client.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Claude client wrapper with non-negotiable invariants:          ║
// ║                                                                 ║
// ║   1. EVERY call writes a row to cross_border_transfers BEFORE   ║
// ║      the request fires (Anand §6). Audit insert THROWS on       ║
// ║      failure → Claude call refused.                             ║
// ║   2. Caller MUST pass redactionSessionToken (Red Line #5).      ║
// ║   3. Audit row hashes the ACTUAL wire JSON body, not a          ║
// ║      reconstructed string (Anand code-review §5).               ║
// ║   4. After the response, region is attested from response       ║
// ║      headers (cf-ray, anthropic-region) and audit row updated   ║
// ║      (Anand code-review §7).                                    ║
// ║   5. Tool-use blocks accumulate in toolUses[]; text blocks      ║
// ║      concatenate (Aman code-review §9). Forced-JSON via tools.  ║
// ╚════════════════════════════════════════════════════════════════╝

import { auditCrossBorderTransfer, attestActualRegion, sha256Hex } from './cross-border-audit.ts';

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

export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeCallParams {
  system: string;
  messages: ClaudeMessage[];
  maxTokens: number;
  temperature?: number;
  callId?: string;
  turnId?: number;
  redactionSessionToken: string;
  redactionMethod?: string;
  tools?: ClaudeTool[];
  toolChoice?: { type: 'any' } | { type: 'tool'; name: string } | { type: 'auto' };
}

export interface ClaudeResponse {
  text: string;
  toolUses: Array<{ name: string; input: unknown }>;
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
  stopReason: string;
  raw: unknown;
}

export async function claudeCall(params: ClaudeCallParams): Promise<ClaudeResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

  // ── Build the EXACT wire body ─────────────────────────────────
  const body: Record<string, unknown> = {
    model: DEFAULT_MODEL,
    max_tokens: params.maxTokens,
    temperature: params.temperature ?? 0.1,
    system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
    messages: params.messages,
  };
  if (params.tools) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;

  const wireBody = JSON.stringify(body);
  const wireSha256 = await sha256Hex(wireBody);

  // ── 1. AUDIT FIRST (Anand §6) — throws on failure ─────────────
  await auditCrossBorderTransfer({
    callId: params.callId,
    turnId: params.turnId,
    provider: 'anthropic',
    model: DEFAULT_MODEL,
    region: 'us-east-1', // initial assumption; overwritten by attestActualRegion below
    regionAttestedBy: 'anthropic_api_default',
    payloadPiiRedacted: true, // re-verified inside audit via scanForPiiLeaks
    redactionMethod: params.redactionMethod ?? 'pii_token_map_v1',
    redactionSessionToken: params.redactionSessionToken,
    payloadText: wireBody,
    precomputedSha256: wireSha256,
  });

  // ── 2. Fire ────────────────────────────────────────────────────
  const resp = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'content-type': 'application/json',
    },
    body: wireBody,
  });

  // ── 3. Attest actual region from response headers (Anand §7) ──
  const cfRay = resp.headers.get('cf-ray') ?? '';
  const anthropicRegion = resp.headers.get('anthropic-region') ?? '';
  const actualRegion = anthropicRegion || cfRay.split('-').pop() || 'unknown';
  // Async — don't block the hot path
  if (params.callId) {
    // @ts-expect-error edge runtime
    EdgeRuntime?.waitUntil?.(
      attestActualRegion(params.callId, wireSha256, actualRegion, anthropicRegion ? 'anthropic-region_header' : 'cf-ray_header'),
    );
  }

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const json = await resp.json();

  // ── 4. Aggregate content blocks (Aman §9) ──────────────────────
  let text = '';
  const toolUses: Array<{ name: string; input: unknown }> = [];
  for (const block of json.content ?? []) {
    if (block.type === 'text') text += block.text;
    if (block.type === 'tool_use') toolUses.push({ name: block.name, input: block.input });
  }

  return {
    text,
    toolUses,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    cachedReadTokens: json.usage?.cache_read_input_tokens ?? 0,
    cachedWriteTokens: json.usage?.cache_creation_input_tokens ?? 0,
    stopReason: json.stop_reason ?? 'unknown',
    raw: json,
  };
}
