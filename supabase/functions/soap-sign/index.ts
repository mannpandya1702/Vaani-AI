// soap-sign/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Atomic "Approve & Sign" action for the MO Cockpit's demo.      ║
// ║                                                                 ║
// ║  1. Mark soap_notes.mo_signed_at = now() (service-role write).  ║
// ║  2. Invoke vaani-signoff to dispatch the soul callback +        ║
// ║     generate the audio.                                         ║
// ║  3. Return the audio + dispatch info to the cockpit so it can   ║
// ║     play the soul callback through speakers.                    ║
// ║                                                                 ║
// ║  Anand: the DB column stays `mo_signed_at`; the cockpit RENDERS ║
// ║  it as "AI Draft Timestamp" with the AI · DEMO MODE badge.      ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { authorizeCockpitRequest } from '../_shared/cockpit-auth.ts';

const SB_URL = Deno.env.get('SUPABASE_URL');
const MASTER_KEY = Deno.env.get('WEBHOOK_MASTER_KEY');

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  // Signing a clinical note is service-role (RLS-bypassing) and fires the
  // patient callback — require a real project JWT or the master key, not just
  // any non-empty bearer.
  if (!authorizeCockpitRequest(req)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const soapId: string | undefined = body?.soap_id;
  if (!soapId) {
    return new Response(JSON.stringify({ error: 'missing_soap_id' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sb = supabaseAdmin();

  // Mark signed (idempotent — only first call sets the timestamp).
  const { data: soap, error: updErr } = await sb
    .from('soap_notes')
    .update({ mo_signed_at: new Date().toISOString() })
    .eq('id', soapId)
    .is('mo_signed_at', null)
    .select('id, mo_signed_at')
    .maybeSingle();

  // If already signed, fetch the existing row so we can still re-dispatch (idempotent).
  if (!soap) {
    const { data: existing } = await sb
      .from('soap_notes')
      .select('id, mo_signed_at')
      .eq('id', soapId)
      .single();
    if (!existing) {
      return new Response(JSON.stringify({ error: 'soap_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }
  }

  // Dispatch the soul callback via vaani-signoff (which is idempotent).
  const signoffResp = await fetch(`${SB_URL}/functions/v1/vaani-signoff`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${MASTER_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ soap_id: soapId }),
  });
  const signoffBody = await signoffResp.json().catch(() => ({}));

  return new Response(JSON.stringify({
    signed_at: (soap?.mo_signed_at ?? null),
    signoff: signoffBody,
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
