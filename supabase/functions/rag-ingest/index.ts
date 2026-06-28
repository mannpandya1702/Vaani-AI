// rag-ingest/index.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Embeds clinical-protocol chunks with in-region gte-small and    ║
// ║  upserts them into rag_chunks. POST { chunks: [...] } with the    ║
// ║  WEBHOOK_MASTER_KEY bearer. Idempotent on chunk id.              ║
// ║                                                                 ║
// ║  Embedding must happen server-side (Supabase.ai is only          ║
// ║  available in the edge runtime), so the corpus is streamed in    ║
// ║  via the request body by the local ingest driver.               ║
// ╚════════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { verifyBearer } from '../_shared/constant-time-compare.ts';
import { embedText } from '../_shared/rag.ts';

interface InChunk {
  id: string;
  doc_id: string;
  page?: number | null;
  section?: string | null;
  content: string;
  token_count?: number | null;
  lang?: string;
  tags?: string[];
  source_authority?: string | null;
  guideline_version?: string | null;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  if (!verifyBearer(req, Deno.env.get('WEBHOOK_MASTER_KEY'))) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  const chunks: InChunk[] | undefined = body?.chunks;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return json({ error: 'missing_chunks' }, 400);
  }

  const sb = supabaseAdmin();
  let embedded = 0;
  let upserted = 0;
  const errors: { id: string; error: string }[] = [];

  for (const c of chunks) {
    if (!c?.id || !c?.content) {
      errors.push({ id: String(c?.id ?? '?'), error: 'missing id/content' });
      continue;
    }
    try {
      const vec = await embedText(c.content);
      embedded++;
      const row = {
        id: c.id,
        doc_id: c.doc_id,
        page: c.page ?? null,
        section: c.section ?? null,
        content: c.content,
        token_count: c.token_count ?? c.content.split(/\s+/).length,
        lang: c.lang ?? 'en',
        tags: c.tags ?? [],
        source_authority: c.source_authority ?? null,
        guideline_version: c.guideline_version ?? null,
        embedding_gte: JSON.stringify(vec), // text repr → cast to vector on write
      };
      const { error } = await sb.from('rag_chunks').upsert(row, { onConflict: 'id' });
      if (error) errors.push({ id: c.id, error: error.message });
      else upserted++;
    } catch (e) {
      errors.push({ id: c.id, error: String(e).slice(0, 160) });
    }
  }

  return json({ received: chunks.length, embedded, upserted, errors });
});
