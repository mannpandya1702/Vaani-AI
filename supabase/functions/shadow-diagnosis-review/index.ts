// shadow-diagnosis-review/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Captures the doctor's final decision on an AI shadow opinion.  ║
// ║                                                                 ║
// ║  The RMP can Ignore / Accept / Edit the AI opinion. We store    ║
// ║  the doctor's decision ALONGSIDE the AI recommendation (never   ║
// ║  overwriting it) so agreement + referral metrics are derivable. ║
// ║                                                                 ║
// ║  This module never changes the AI fields — it only writes the   ║
// ║  doctor_* columns. The doctor is the final authority.           ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTIONS = ['ignored', 'accepted', 'edited'];
const URGENCIES = ['Routine', 'Urgent', 'Emergency'];

// Project ref derived from the injected SUPABASE_URL (e.g. https://<ref>.supabase.co).
const PROJECT_REF = (Deno.env.get('SUPABASE_URL') ?? '').match(/https?:\/\/([a-z0-9]+)\.supabase\./)?.[1] ?? '';
const ALLOWED_ROLES = new Set(['anon', 'authenticated', 'service_role']);

// This path does an RLS-bypassing service-role write of the doctor's recorded
// decision, so a bare "has a Bearer" check is not enough. Authorize on EITHER:
//   (a) a constant-time WEBHOOK_MASTER_KEY match (server callers), or
//   (b) a Supabase JWT issued for THIS project — ref matches, role is an
//       expected Supabase role, and the token is not expired.
// (b) accepts the cockpit's anon key regardless of value/rotation (we can't
// rely on the injected SUPABASE_ANON_KEY equalling the key the browser sends),
// while still rejecting empty / garbage / wrong-project bearers.
function authorized(req: Request): boolean {
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

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  // (soap-sign carries the older bare-Bearer posture and should be lifted to
  // this same gate — roadmap.)
  if (!authorized(req)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const shadowId: string | undefined = body?.shadow_id;
  const action: string | undefined = body?.action;
  if (!shadowId || !action || !ACTIONS.includes(action)) {
    return new Response(JSON.stringify({ error: 'bad_request', detail: 'shadow_id + action(ignored|accepted|edited) required' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sb = supabaseAdmin();

  const update: Record<string, unknown> = {
    doctor_action: action,
    doctor_decided_at: new Date().toISOString(),
  };

  // Optional doctor overrides (present on Edit; also accepted on Accept).
  if (typeof body.doctor_referral_decision === 'boolean') {
    update.doctor_referral_decision = body.doctor_referral_decision;
  }
  if (typeof body.doctor_urgency === 'string' && URGENCIES.includes(body.doctor_urgency)) {
    update.doctor_urgency = body.doctor_urgency;
  }
  if (typeof body.doctor_notes === 'string') {
    update.doctor_notes = body.doctor_notes.slice(0, 4000);
  }
  if (body.doctor_final_differential != null) {
    update.doctor_final_differential = body.doctor_final_differential;
  }
  if (typeof body.doctor_user_id === 'string' && UUID_RE.test(body.doctor_user_id)) {
    update.doctor_user_id = body.doctor_user_id;
  }

  // On Accept with no explicit override, mirror the AI recommendation as the
  // doctor's decision so "agreement" is unambiguous downstream.
  if (action === 'accepted' && update.doctor_referral_decision === undefined) {
    const { data: ai } = await sb
      .from('shadow_diagnoses')
      .select('referral_recommended, urgency')
      .eq('id', shadowId)
      .maybeSingle();
    if (ai) {
      update.doctor_referral_decision = ai.referral_recommended;
      if (update.doctor_urgency === undefined) update.doctor_urgency = ai.urgency;
    }
  }

  const { data, error } = await sb
    .from('shadow_diagnoses')
    .update(update)
    .eq('id', shadowId)
    .select('id, doctor_action, doctor_referral_decision, doctor_urgency, doctor_decided_at')
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: 'update_failed', detail: error.message }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }
  if (!data) {
    return new Response(JSON.stringify({ error: 'shadow_not_found' }), {
      status: 404, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, decision: data }), {
    status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
