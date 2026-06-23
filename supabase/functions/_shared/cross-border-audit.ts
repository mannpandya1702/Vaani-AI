// _shared/cross-border-audit.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Anand §6 — Cross-border transfer audit.                        ║
// ║                                                                 ║
// ║  Every call to a non-India LLM MUST write a row to              ║
// ║  cross_border_transfers BEFORE the request fires.               ║
// ║                                                                 ║
// ║  Day 2 Part 1.5 fixes (Anand code review §2 + §6):              ║
// ║   - SERVER-SIDE re-scan for unmasked PII (defence in depth):    ║
// ║     if redactor lied or caller forgot to redact, we catch here. ║
// ║   - THROW on audit-insert failure: refuses Claude call rather   ║
// ║     than silently making an unaudited cross-border transfer.    ║
// ║                                                                 ║
// ║  Killer DPO query (always 0):                                   ║
// ║   SELECT count(*) FROM cross_border_transfers                   ║
// ║   WHERE created_at > now() - interval '24h'                     ║
// ║     AND payload_pii_redacted = false;                           ║
// ╚════════════════════════════════════════════════════════════════╝

import { supabaseAdmin } from './supabase-admin.ts';
import { scanForPiiLeaks } from './pii-redactor.ts';

type LlmRegion =
  | 'ap-south-1' | 'asia-south1' | 'in-mumbai'
  | 'us-east-1' | 'us-east-2' | 'eu-west-1' | 'eu-central-1' | 'unknown';

interface CrossBorderEntry {
  callId?: string;
  turnId?: number;
  provider: 'anthropic' | 'bedrock' | 'openai' | 'google' | 'sarvam' | string;
  model: string;
  region: LlmRegion;
  regionAttestedBy: string;
  payloadPiiRedacted: boolean;
  redactionMethod: string;
  redactionSessionToken?: string;
  payloadText: string;
  /** Optional: precomputed sha256 (lets caller hash sync, then audit waitUntil). */
  precomputedSha256?: string;
}

export async function auditCrossBorderTransfer(entry: CrossBorderEntry): Promise<void> {
  const sb = supabaseAdmin();

  // ── DEFENCE IN DEPTH: re-scan payload for PII (Anand §2) ──────
  // Caller claims it's redacted; we verify. If they lied OR the redactor
  // missed something, we fail loud + log the attempt.
  if (entry.payloadPiiRedacted) {
    const leak = scanForPiiLeaks(entry.payloadText);
    if (leak) {
      await sb.from('ops_incidents').insert({
        severity: 'critical',
        source: 'cross_border_audit',
        category: 'pii_leak_attempt',
        title: `PII leak detected post-redaction (${leak.name})`,
        description: `Pattern matched: ${leak.name}. Sample: ${leak.sample}`,
        related_call_id: entry.callId,
        payload: { provider: entry.provider, model: entry.model },
      });
      throw new Error(`[cross-border-audit] PII leak detected post-redaction: ${leak.name}`);
    }
  }

  // ── Hash (use precomputed if provided) ─────────────────────────
  const hash = entry.precomputedSha256 ?? await sha256Hex(entry.payloadText);

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
    // ── THROW (Anand §6): never silently transfer without record ─
    // DPDP Board considers absence-of-audit = non-compliance.
    // CERT-In s.70B requires 180-day log preservation.
    await sb.from('ops_incidents').insert({
      severity: 'critical',
      source: 'cross_border_audit',
      category: 'audit_write_failed',
      title: 'cross_border_transfers insert failed — refusing transfer',
      description: error.message ?? 'unknown',
      related_call_id: entry.callId,
      payload: { provider: entry.provider, model: entry.model },
    }).catch((e) => console.error('[cross-border-audit] ops_incidents fallback failed', e));
    throw new Error(`Cross-border audit write failed; refusing transfer: ${error.message}`);
  }
}

/**
 * Update the audit row with region attestation from response headers.
 * Called AFTER the Claude/Bedrock response is received.
 */
export async function attestActualRegion(
  callId: string | undefined,
  payloadSha256: string,
  actualRegion: string,
  attestedBy: string,
): Promise<void> {
  if (!callId || !payloadSha256) return;
  const sb = supabaseAdmin();
  await sb.from('cross_border_transfers')
    .update({
      region_attested_value: actualRegion,
      region_attested_at: new Date().toISOString(),
    })
    .eq('call_id', callId)
    .eq('payload_sha256', payloadSha256);
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
