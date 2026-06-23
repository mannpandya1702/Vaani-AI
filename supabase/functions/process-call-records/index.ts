// process-call-records/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Post-call orchestrator. Stub for Day 2 Part 1.5.               ║
// ║                                                                 ║
// ║  Pipeline when complete:                                        ║
// ║   1. Pull final transcript from `turns`                         ║
// ║   2. Call triage-score (full Claude triage)                     ║
// ║   3. Call soap-generate (eSanjeevani SOAP)                      ║
// ║   4. Enqueue vaani_didi_signoff in call_dispatch_queue          ║
// ║   5. Update call_costs aggregate                                ║
// ║                                                                 ║
// ║  Day 2 Part 2 will fill steps 2-5.                              ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const masterKey = Deno.env.get('WEBHOOK_MASTER_KEY');
  if (!verifyBearer(req, masterKey)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const callId: string | undefined = body?.call_id;
  if (!callId) {
    return new Response(JSON.stringify({ error: 'missing_call_id' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sb = supabaseAdmin();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

  // Step 1: Trigger triage-score
  if (SUPABASE_URL) {
    fetch(`${SUPABASE_URL}/functions/v1/triage-score`, {
      method: 'POST',
      headers: { authorization: `Bearer ${masterKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ call_id: callId }),
    }).catch((e) => console.error('[process-call-records] triage-score failed', e));
  }

  // Step 2-5: Day 2 Part 2 stubs.
  await sb.from('ops_incidents').insert({
    severity: 'low',
    source: 'process_call_records',
    category: 'stub_invoked',
    title: `Stub invoked for call ${callId}`,
    description: 'Day 2 Part 2 will fill SOAP generation + dispatch enqueue',
    related_call_id: callId,
  });

  return new Response(JSON.stringify({
    ok: true,
    stub: true,
    next_steps: ['triage-score', 'soap-generate', 'vaani_didi_signoff', 'cost_rollup'],
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
