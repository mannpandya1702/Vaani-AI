// livekit-token/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Mints a short-lived LiveKit access token so the browser can     ║
// ║  join a room that the deployed Vaani Cloud Agent auto-dispatches  ║
// ║  into. The LIVEKIT_API_SECRET must NEVER reach the browser — the  ║
// ║  token is signed here (HS256) and only the JWT is returned.       ║
// ║                                                                  ║
// ║  Gated by authorizeCockpitRequest (a real project JWT or the     ║
// ║  master key) — the /asha-live page is RequireAuth, so the browser ║
// ║  presents its Supabase session token.                            ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { authorizeCockpitRequest } from '../_shared/cockpit-auth.ts';

const API_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') ?? '';

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function mintToken(identity: string, room: string, name: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: API_KEY,
    sub: identity,
    name,
    nbf: now - 5,
    exp: now + 60 * 30, // 30 min
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  if (!authorizeCockpitRequest(req)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }
  if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
    return new Response(JSON.stringify({ error: 'livekit_not_configured' }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const lang = (body?.lang === 'ta' ? 'ta' : 'hi');
  // Unique room + identity per session. crypto.randomUUID is available in the edge runtime.
  const room = `vaani-${lang}-${crypto.randomUUID().slice(0, 8)}`;
  const identity = `patient-${crypto.randomUUID().slice(0, 8)}`;
  const token = await mintToken(identity, room, 'Patient');

  return new Response(JSON.stringify({ token, url: LIVEKIT_URL, room, identity }), {
    status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
