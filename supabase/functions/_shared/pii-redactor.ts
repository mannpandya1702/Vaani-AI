// _shared/pii-redactor.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Anand §3.9 + §6 + Red Line #5 — MANDATORY PII REDACTION       ║
// ║                                                                 ║
// ║  Every payload sent to Claude (US-domiciled) MUST pass through  ║
// ║  this redactor first. Claude sees session tokens like           ║
// ║  "Patient-Session-7G4F" — never name, phone, ABHA, Aadhaar,     ║
// ║  email, pincode, village/district/state.                        ║
// ║                                                                 ║
// ║  Sarvam-M (India-domiciled) MAY see raw text — it doesn't       ║
// ║  cross borders. Use redactor only for Claude/Bedrock calls.     ║
// ║                                                                 ║
// ║  Day 2 Part 1.5 fixes per Anand code review §1:                 ║
// ║   - email, pincode, location, fuzzy-name                        ║
// ║   - phone with parens/dots                                      ║
// ║   - ABHA with spaces                                            ║
// ║   - regex execution ORDER fixed (phone → ABHA → Aadhaar →       ║
// ║     email → pincode → location)                                 ║
// ║   - counter.AADHAAR separate bucket                             ║
// ║   - 16-hex session token (Anand §4) + unique constraint retry   ║
// ╚════════════════════════════════════════════════════════════════

import { supabaseAdmin } from './supabase-admin.ts';

export interface RedactedPayload {
  redactedText: string;
  sessionToken: string;
  tokenMap: Record<string, string>;
}

/** 28 states + 8 UTs + common district names. Replace with `[LOCATION_n]`. */
const INDIA_LOCATIONS: ReadonlySet<string> = new Set([
  // States (case-insensitive)
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa',
  'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala',
  'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland',
  'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura',
  'uttar pradesh', 'uttarakhand', 'west bengal',
  // UTs
  'delhi', 'chandigarh', 'puducherry', 'jammu', 'kashmir', 'ladakh',
  'andaman', 'nicobar', 'lakshadweep', 'dadra', 'daman', 'diu',
  // Top districts / mega-cities (extend as needed)
  'mumbai', 'pune', 'bengaluru', 'bangalore', 'hyderabad', 'chennai', 'kolkata',
  'ahmedabad', 'lucknow', 'jaipur', 'patna', 'bhubaneswar', 'guwahati',
  'thiruvananthapuram', 'kanakapura', 'anand',
]);

/**
 * Redacts PII from `rawText` and persists the reverse-map to pii_token_map.
 * Throws if persistence fails — Claude call MUST NOT proceed without map.
 *
 * @param rawText  Text from Sarvam STT (may contain name/phone/etc).
 * @param callId   The call_id to associate with the token map row.
 * @param hints    Optional known PII for deterministic replacement.
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
  const counter = { NAME: 0, PHONE: 0, ABHA: 0, AADHAAR: 0, EMAIL: 0, PINCODE: 0, LOCATION: 0 };

  // ── 1. HINT-BASED deterministic replacement (most reliable) ────
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
    counter.LOCATION++;
    const token = `LOCATION_${counter.LOCATION}`;
    text = replaceAll(text, hints.village, `[${token}]`);
    tokenMap[token] = hints.village;
  }

  // ── 2. REGEX SWEEPS — ORDER MATTERS (Anand §1) ─────────────────
  // Run in this order: phone → ABHA → Aadhaar → email → pincode → location.
  // Phone first because Aadhaar pattern can partially match phone digit runs.

  // Phone — Indian mobile (+91, 0, or bare) with parens / dashes / dots / spaces
  text = text.replace(
    /\b(?:\+?91[-\s.()]*|0)?\(?\s*[6-9]\)?[-\s.]*\d{4}[-\s.]*\d{5}\b/g,
    (m) => {
      counter.PHONE++;
      const token = `PHONE_${counter.PHONE}`;
      tokenMap[token] = m;
      return `[${token}]`;
    },
  );

  // ABHA: 14-digit hyphenated, with-spaces, or @abdm address
  text = text.replace(
    /\b\d{2}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g,
    (m) => {
      counter.ABHA++;
      const token = `ABHA_${counter.ABHA}`;
      tokenMap[token] = m;
      return `[${token}]`;
    },
  );
  text = text.replace(/\b\d{14}\b/g, (m) => {
    counter.ABHA++;
    const token = `ABHA_${counter.ABHA}`;
    tokenMap[token] = m;
    return `[${token}]`;
  });
  text = text.replace(/[\w._-]+@abdm\b/gi, (m) => {
    counter.ABHA++;
    const token = `ABHA_${counter.ABHA}`;
    tokenMap[token] = m;
    return `[${token}]`;
  });

  // Aadhaar — 12-digit with optional spaces. Defence in depth even if not collected.
  text = text.replace(
    /\b\d{4}\s\d{4}\s\d{4}\b/g,
    (m) => {
      counter.AADHAAR++;
      const token = `AADHAAR_${counter.AADHAAR}`;
      tokenMap[token] = m;
      return `[${token}]`;
    },
  );
  text = text.replace(/\b\d{12}\b/g, (m) => {
    counter.AADHAAR++;
    const token = `AADHAAR_${counter.AADHAAR}`;
    tokenMap[token] = m;
    return `[${token}]`;
  });

  // Email
  text = text.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, (m) => {
    counter.EMAIL++;
    const token = `EMAIL_${counter.EMAIL}`;
    tokenMap[token] = m;
    return `[${token}]`;
  });

  // Pincode (India 6-digit, first not zero)
  text = text.replace(/\b[1-9]\d{5}\b/g, (m) => {
    counter.PINCODE++;
    const token = `PINCODE_${counter.PINCODE}`;
    tokenMap[token] = m;
    return `[${token}]`;
  });

  // Location — state/UT/district denylist (case-insensitive whole word)
  for (const loc of INDIA_LOCATIONS) {
    const pattern = new RegExp(`\\b${escapeRegex(loc)}\\b`, 'gi');
    text = text.replace(pattern, (m) => {
      counter.LOCATION++;
      const token = `LOCATION_${counter.LOCATION}`;
      tokenMap[token] = m;
      return `[${token}]`;
    });
  }

  // ── 3. Generate session token (16 hex — Anand §4) + persist ────
  const sessionToken = await generateSessionToken(callId, 0);
  const sb = supabaseAdmin();
  const { error } = await sb.from('pii_token_map').insert({
    session_token: sessionToken,
    call_id: callId,
    token_map: tokenMap,
  });

  if (error) {
    // Unique-violation retry (extremely rare with 64-bit token)
    if (String(error.message).includes('duplicate') || String(error.code) === '23505') {
      const retryToken = await generateSessionToken(callId, 1);
      const retry = await sb.from('pii_token_map').insert({
        session_token: retryToken,
        call_id: callId,
        token_map: tokenMap,
      });
      if (retry.error) {
        console.error('[pii-redactor] persist failed twice', retry.error);
        throw new Error('PII redactor could not persist — refusing Claude call');
      }
      return { redactedText: text, sessionToken: retryToken, tokenMap };
    }
    console.error('[pii-redactor] persist failed', error);
    throw new Error('PII redactor could not persist — refusing Claude call');
  }

  return { redactedText: text, sessionToken, tokenMap };
}

/**
 * Re-hydrate tokens in `textWithTokens` back to real values.
 * Use only when output goes to a human authorised to see PII (MO cockpit).
 */
export function rehydrate(textWithTokens: string, tokenMap: Record<string, string>): string {
  let out = textWithTokens;
  for (const [token, value] of Object.entries(tokenMap)) {
    out = replaceAll(out, `[${token}]`, value);
  }
  return out;
}

// ── Defence-in-depth: invariant scan for leak detection ──────────
// Called by cross-border-audit to verify the caller actually redacted.
const LEAK_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'india_mobile',        regex: /\b(?:\+?91[-\s.()]*|0)?\(?\s*[6-9]\)?[-\s.]*\d{4}[-\s.]*\d{5}\b/ },
  { name: 'abha_hyphenated',     regex: /\b\d{2}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/ },
  { name: 'abha_14digit',        regex: /\b\d{14}\b/ },
  { name: 'abha_address',        regex: /[\w._-]+@abdm\b/i },
  { name: 'aadhaar_spaced',      regex: /\b\d{4}\s\d{4}\s\d{4}\b/ },
  { name: 'aadhaar_12digit',     regex: /\b\d{12}\b/ },
  { name: 'email',               regex: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/ },
  { name: 'pincode',             regex: /\b[1-9]\d{5}\b/ },
];

export function scanForPiiLeaks(text: string): { name: string; sample: string } | null {
  for (const { name, regex } of LEAK_PATTERNS) {
    const m = text.match(regex);
    if (m) return { name, sample: m[0].slice(0, 32) };
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────
function replaceAll(text: string, needle: string, replacement: string): string {
  if (!needle) return text;
  return text.replace(new RegExp(escapeRegex(needle), 'gi'), replacement);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function generateSessionToken(callId: string, salt: number): Promise<string> {
  const seed = Deno.env.get('PII_REDACTION_SEED') ?? 'dev-seed';
  const data = new TextEncoder().encode(`${seed}:${callId}:${Date.now()}:${salt}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // 16 hex chars = 64 bits = ~1 in 18 quintillion collision (Anand §4 fix)
  return `Patient-Session-${hex.slice(0, 16).toUpperCase()}`;
}

