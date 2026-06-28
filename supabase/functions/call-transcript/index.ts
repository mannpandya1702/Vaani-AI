// call-transcript/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Returns one call's turn-by-turn transcript (+ recording URL if  ║
// ║  one exists) for the cockpit's "listen & read the call" panel.   ║
// ║                                                                  ║
// ║  Lazy-loaded: the cockpit only hits this when the RMP opens the  ║
// ║  transcript on a card, so the 3s feed poll stays light.          ║
// ║                                                                  ║
// ║  Same auth + service-role posture as cockpit-feed: a real        ║
// ║  project JWT (anon/authenticated) or the master key — NOT any    ║
// ║  non-empty bearer — then a service-role read that bypasses RLS.  ║
// ║  The transcript is PHI; the cockpit is already the authorised    ║
// ║  RMP surface (ProtectedRoute + authorizeCockpitRequest), and the ║
// ║  SOAP it sits beside is derived from these same turns.           ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { authorizeCockpitRequest } from '../_shared/cockpit-auth.ts';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  if (!authorizeCockpitRequest(req)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const callId = url.searchParams.get('call_id');
  if (!callId) return json({ error: 'missing_call_id' }, 400);

  const sb = supabaseAdmin();

  const [turnsResp, callResp] = await Promise.all([
    sb.from('turns')
      .select('turn_idx, role, transcript, transcript_redacted, lang')
      .eq('call_id', callId)
      .order('turn_idx', { ascending: true }),
    sb.from('calls')
      .select('id, started_at, ended_at, duration_seconds, channel, lang_detected, audio_recording_url')
      .eq('id', callId)
      .maybeSingle(),
  ]);

  if (turnsResp.error) {
    return json({ error: 'turns_query_failed', detail: turnsResp.error.message }, 500);
  }

  // Only the human-readable dialogue reaches the doctor — tool/system turns are
  // internal plumbing. Prefer the raw transcript (the RMP is treating the
  // patient and needs the real words); fall back to the redacted copy.
  const turns = (turnsResp.data ?? [])
    .filter((t) => t.role === 'user' || t.role === 'assistant')
    .map((t) => ({
      idx: t.turn_idx,
      role: t.role as 'user' | 'assistant',
      text: (t.transcript ?? t.transcript_redacted ?? '').trim(),
    }))
    .filter((t) => t.text);

  const call = callResp.data;
  return json({
    call_id: callId,
    recording_url: call?.audio_recording_url ?? null,
    duration_seconds: call?.duration_seconds ?? null,
    lang: call?.lang_detected ?? null,
    turns,
  });
});
