// rag-retrieve/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Standalone hybrid retrieval endpoint — POST { query, k } with   ║
// ║  the WEBHOOK_MASTER_KEY bearer. Used for testing retrieval        ║
// ║  quality in isolation and for demoing the RAG layer. The same     ║
// ║  retrieveProtocols() helper is what triage/SOAP/shadow call        ║
// ║  inline when RAG_ENABLED is set.                                  ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { retrieveProtocols, formatProtocolContext } from '../_shared/rag.ts';

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  if (!verifyBearer(req, Deno.env.get('WEBHOOK_MASTER_KEY'))) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const query: string | undefined = body?.query;
  const k = Math.min(12, Math.max(1, Number(body?.k ?? 6)));
  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'missing_query' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const sb = supabaseAdmin();
  const chunks = await retrieveProtocols(sb, query, k);

  return new Response(JSON.stringify({
    query,
    count: chunks.length,
    chunks,
    context_block: formatProtocolContext(chunks),
  }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
