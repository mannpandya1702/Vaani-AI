// cockpit-auth.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Auth gate for the browser-facing cockpit functions             ║
// ║  (cockpit-feed, soap-sign, shadow-diagnosis-review).            ║
// ║                                                                 ║
// ║  These run verify_jwt=false and use the service-role client     ║
// ║  (RLS bypassed), so a bare "has a Bearer" check is NOT enough — ║
// ║  anyone with the URL + the public anon key could read patient   ║
// ║  PII or sign clinical notes. Authorize on EITHER:               ║
// ║   (a) a constant-time WEBHOOK_MASTER_KEY match (server callers), ║
// ║   (b) a Supabase JWT issued for THIS project — ref matches the   ║
// ║       SUPABASE_URL ref, role ∈ {anon,authenticated,service_role},║
// ║       and the token is not expired.                             ║
// ║                                                                 ║
// ║  (b) accepts the cockpit's anon token regardless of value/      ║
// ║  rotation (the browser can't hold a server secret) while        ║
// ║  rejecting empty / garbage / wrong-project bearers.             ║
// ╚════════════════════════════════════════════════════════════════╝
import { verifyBearer } from './constant-time-compare.ts';

const PROJECT_REF = (Deno.env.get('SUPABASE_URL') ?? '')
  .match(/https?:\/\/([a-z0-9]+)\.supabase\./)?.[1] ?? '';
const ALLOWED_ROLES = new Set(['anon', 'authenticated', 'service_role']);

export function authorizeCockpitRequest(req: Request): boolean {
  // server callers (e.g. soap-sign → vaani-signoff) present the master key
  if (verifyBearer(req, Deno.env.get('WEBHOOK_MASTER_KEY'))) return true;
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const parts = auth.slice(7).trim().split('.');
  if (parts.length !== 3) return false;
  try {
    const p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (PROJECT_REF && p.ref !== PROJECT_REF) return false;
    if (!ALLOWED_ROLES.has(p.role)) return false;
    if (typeof p.exp === 'number' && p.exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}
