// _shared/health.ts
//
// Returns a structured health-check response for every edge function.
// Production observability — synthetic monitors hit GET /health.
//
// Usage at top of a Deno.serve handler:
//
//   if (new URL(req.url).pathname.endsWith('/health')) {
//     return healthOk(req, { name: 'vapi-webhook', deps: ['supabase'] });
//   }

import { corsHeaders } from './cors.ts';

export interface HealthMeta {
  name: string;
  version?: string;     // SHA or semver; falls back to GIT_SHA env
  deps?: string[];      // upstream dependencies to mention (informational)
  status?: 'ok' | 'degraded' | 'down';
}

export function healthOk(_req: Request, meta: HealthMeta): Response {
  const body = {
    ok: true,
    status: meta.status ?? 'ok',
    name: meta.name,
    version: meta.version ?? Deno.env.get('GIT_SHA') ?? 'dev',
    deps: meta.deps ?? [],
    timestamp: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

export function isHealthCheck(req: Request): boolean {
  try { return new URL(req.url).pathname.endsWith('/health'); } catch { return false; }
}
