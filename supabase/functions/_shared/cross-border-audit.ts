// _shared/cross-border-audit.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Anand §6 — Cross-border transfer audit.                        ║
// ║  Every call to a non-India LLM (Claude direct, Claude via       ║
// ║  Bedrock us-east-1, OpenAI, etc.) MUST write a row to           ║
// ║  cross_border_transfers BEFORE the request fires.               ║
// ║  Killer query: SELECT COUNT(*) WHERE payload_pii_redacted=false ║
// ║  must always return 0. Indexed for instant DPDP Board demos.    ║
// ╚════════════════════════════════════════════════════════════════╝

import { supabaseAdmin } from './supabase-admin.ts';

type LlmRegion =
  | 'ap-south-1'      // Mumbai (safe — counts as India for residency)
  | 'asia-south1'     // GCP Mumbai
  | 'in-mumbai'
  | 'us-east-1'
  | 'us-east-2'
  | 'eu-west-1'
  | 'eu-central-1'
  | 'unknown';

interface CrossBorderEntry {
  callId?: string;
  turnId?: number;
  provider: 'anthropic' | 'bedrock' | 'openai' | 'google' | 'sarvam' | string;
  model: string;
  region: LlmRegion;
  regionAttestedBy: string;     // 'aws_sdk_response_header' | 'anthropic_api_default' | etc
  payloadPiiRedacted: boolean;
  redactionMethod: string;
  redactionSessionToken?: string;
  payloadText: string;          // hashed inside, never persisted raw
}

export async function auditCrossBorderTransfer(entry: CrossBorderEntry): Promise<void> {
  // Hash the payload — we never store the raw text, only its sha256.
  const hash = await sha256Hex(entry.payloadText);
  const sb = supabaseAdmin();
  const { error } = await sb.from('cross_border_transfers').insert({
    call_id: entry.callId,
    turn_id: entry.turnId,
    provider: entry.provider,
    model: entry.model,
    region: entry.region,
    region_attested_by: entry.regionAttestedBy,
    payload_pii_redacted: entry.payloadPiiRedacted,
    redaction_method: entry.redactionMethod,
    redaction_session_token: entry.redactionSessionToken,
    payload_sha256: hash,
    payload_byte_size: new TextEncoder().encode(entry.payloadText).length,
  });
  if (error) {
    // We do NOT throw here — failing audit is itself an incident, but the
    // request still went out and we must not retro-fail it. Log loudly.
    console.error('[cross-border-audit] insert failed', error);
    // Best effort: write an ops incident as a backstop.
    await sb.from('ops_incidents').insert({
      severity: 'high',
      source: 'cross_border_audit',
      category: 'audit_write_failed',
      title: 'cross_border_transfers insert failed',
      description: error.message ?? 'unknown',
      related_call_id: entry.callId,
    });
  }
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
