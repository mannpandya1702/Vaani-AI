// _shared/vapi-auth.ts
// VAPI webhook signature verification.
// VAPI signs every webhook with `x-vapi-secret` header (or `x-vapi-signature`
// for HMAC mode depending on dashboard config). We support both shapes.

import { constantTimeEqual } from './constant-time-compare.ts';

export interface VapiAuthResult {
  ok: boolean;
  reason?: string;
}

export async function verifyVapiWebhook(req: Request, rawBody: string): Promise<VapiAuthResult> {
  const secret = Deno.env.get('VAPI_WEBHOOK_SECRET');
  if (!secret) return { ok: false, reason: 'no_webhook_secret_configured' };

  // Mode 1: shared secret in `x-vapi-secret` header
  const shared = req.headers.get('x-vapi-secret') ?? '';
  if (shared && constantTimeEqual(shared, secret)) {
    return { ok: true };
  }

  // Mode 2: HMAC SHA-256 signature in `x-vapi-signature`
  const sig = req.headers.get('x-vapi-signature') ?? '';
  if (sig) {
    const expected = await hmacHex(secret, rawBody);
    if (constantTimeEqual(sig, expected)) {
      return { ok: true };
    }
    return { ok: false, reason: 'hmac_mismatch' };
  }

  return { ok: false, reason: 'no_signature_header' };
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
