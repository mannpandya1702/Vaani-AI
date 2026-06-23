// _shared/pii-redactor.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Anand §3.9 + §6 + Red Line #5 — MANDATORY PII REDACTION       ║
// ║  Every payload sent to Claude (US-domiciled) MUST pass          ║
// ║  through this redactor first. Claude sees session tokens like   ║
// ║  "Patient-Session-7G4F: 45y F, c/o cough x 3 wks" — never name, ║
// ║  phone, ABHA, or village.                                       ║
// ║                                                                 ║
// ║  Sarvam-M (India-domiciled) MAY see raw text — it doesn't       ║
// ║  cross borders. Use redactor only for Claude/Bedrock calls.     ║
// ╚════════════════════════════════════════════════════════════════╝

import { supabaseAdmin } from './supabase-admin.ts';

export interface RedactedPayload {
  /** Text safe to send to Claude — PII replaced with tokens. */
  redactedText: string;
  /** Session token to correlate later. */
  sessionToken: string;
  /** Map for re-hydration server-side after Claude responds. */
  tokenMap: Record<string, string>;
}

/**
 * Redacts PII from `rawText` and persists the reverse-map to pii_token_map.
 *
 * @param rawText  The text that came out of Sarvam STT (may contain name/phone/etc).
 * @param callId   The call_id to associate with the token map row.
 * @param hints    Optional known PII (patient name, phone, ABHA, village) for
 *                 deterministic replacement even when STT misspells them.
 */
export async function redactPII(
  rawText: string,
  callId: string,
  hints: {
    name?: string;
    phone_e164?: string;
    abha_id?: string;
    village?: string;
  } = {},
): Promise<RedactedPayload> {
  let text = rawText;
  const tokenMap: Record<string, string> = {};
  let counter = { NAME: 0, PHONE: 0, ABHA: 0, VILLAGE: 0 };

  // 1. Hint-based deterministic replacement (most reliable for the patient
  //    we already know about — the caller).
  if (hints.name) {
    counter.NAME++;
    const token = `NAME_${counter.NAME}`;
    text = replaceAll(text, hints.name, `[${token}]`);
    tokenMap[token] = hints.name;
  }
  if (hints.phone_e164) {
    counter.PHONE++;
    const token = `PHONE_${counter.PHONE}`;
    text = replaceAll(text, hints.phone_e164, `[${token}]`);
    // Also strip the bare 10-digit variant
    const tenDigit = hints.phone_e164.replace(/^\+?91/, '');
    if (tenDigit.length === 10) {
      text = replaceAll(text, tenDigit, `[${token}]`);
    }
    tokenMap[token] = hints.phone_e164;
  }
  if (hints.abha_id) {
    counter.ABHA++;
    const token = `ABHA_${counter.ABHA}`;
    text = replaceAll(text, hints.abha_id, `[${token}]`);
    tokenMap[token] = hints.abha_id;
  }
  if (hints.village) {
    counter.VILLAGE++;
    const token = `VILLAGE_${counter.VILLAGE}`;
    text = replaceAll(text, hints.village, `[${token}]`);
    tokenMap[token] = hints.village;
  }

  // 2. Regex sweep for un-hinted PII patterns the patient might mention
  //    (their relatives' names, other phones, ABHAs, Aadhaars).

  // ABHA: 14-digit with hyphens (XX-XXXX-XXXX-XXXX) OR @abdm address
  text = text.replace(
    /\b\d{2}-?\d{4}-?\d{4}-?\d{4}\b/g,
    (m) => {
      counter.ABHA++;
      const token = `ABHA_${counter.ABHA}`;
      tokenMap[token] = m;
      return `[${token}]`;
    },
  );
  text = text.replace(/[\w._-]+@abdm\b/gi, (m) => {
    counter.ABHA++;
    const token = `ABHA_${counter.ABHA}`;
    tokenMap[token] = m;
    return `[${token}]`;
  });

  // Aadhaar: 12-digit with optional spaces — also redact even though we
  // shouldn't be collecting it. Defence in depth.
  text = text.replace(
    /\b\d{4}\s?\d{4}\s?\d{4}\b/g,
    (m) => {
      counter.PHONE++; // bucket under PHONE for simplicity
      const token = `AADHAAR_${counter.PHONE}`;
      tokenMap[token] = m;
      return `[${token}]`;
    },
  );

  // Phone — Indian mobile 10-digit starting 6/7/8/9, optionally +91 prefix
  text = text.replace(
    /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g,
    (m) => {
      counter.PHONE++;
      const token = `PHONE_${counter.PHONE}`;
      tokenMap[token] = m;
      return `[${token}]`;
    },
  );

  // 3. Generate session token + persist reverse map
  const sessionToken = await generateSessionToken(callId);
  const sb = supabaseAdmin();
  const { error } = await sb.from('pii_token_map').insert({
    session_token: sessionToken,
    call_id: callId,
    token_map: tokenMap,
  });
  if (error) {
    console.error('[pii-redactor] failed to persist token map', error);
    throw new Error('PII redactor could not persist — refusing to send to Claude');
  }

  return { redactedText: text, sessionToken, tokenMap };
}

/**
 * After Claude responds, re-hydrate any tokens in its output back to the
 * actual values. Use sparingly — only when the response will be shown to
 * a human who has authority to see PII (MO cockpit summary).
 */
export function rehydrate(textWithTokens: string, tokenMap: Record<string, string>): string {
  let out = textWithTokens;
  for (const [token, value] of Object.entries(tokenMap)) {
    out = replaceAll(out, `[${token}]`, value);
  }
  return out;
}

function replaceAll(text: string, needle: string, replacement: string): string {
  if (!needle) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), replacement);
}

async function generateSessionToken(callId: string): Promise<string> {
  const seed = Deno.env.get('PII_REDACTION_SEED') ?? 'dev-seed';
  const data = new TextEncoder().encode(`${seed}:${callId}:${Date.now()}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `Patient-Session-${hex.slice(0, 8).toUpperCase()}`;
}
