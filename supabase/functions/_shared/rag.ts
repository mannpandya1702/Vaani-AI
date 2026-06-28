// rag.ts
// ╔════════════════════════════════════════════════════════════════╗
// ║  Retrieval layer for the clinical-protocol RAG store.           ║
// ║                                                                 ║
// ║  Dense embeddings come from the Supabase edge runtime's built-in ║
// ║  `gte-small` (384-dim) — it runs IN-REGION (ap-south-1) with no  ║
// ║  external API call, so the retrieval query embedding never       ║
// ║  leaves India. Retrieval is HYBRID: dense cosine KNN + GIN       ║
// ║  full-text, fused server-side via RRF in match_rag_chunks().     ║
// ║                                                                 ║
// ║  This layer ADVISES. It is additive context for the LLM — the   ║
// ║  deterministic red-flag rules and statutory refusals always      ║
// ║  take precedence and are never gated on retrieval.              ║
// ╚════════════════════════════════════════════════════════════════╝

export interface ProtocolChunk {
  id: string;
  doc_id: string;
  section: string | null;
  content: string;
  source_authority: string | null;
  guideline_version: string | null;
  page: number | null;
  dense_rank: number | null;
  lexical_rank: number | null;
  score: number;
}

// One Session per isolate — model load is cached after first use.
let _session: { run: (t: string, o: Record<string, unknown>) => Promise<number[]> } | null = null;
function aiSession() {
  if (!_session) {
    // @ts-ignore — Supabase global is injected in the deployed edge runtime
    _session = new Supabase.ai.Session('gte-small');
  }
  return _session!;
}

/** 384-dim normalized embedding for `text`, computed in-region (no external API). */
export async function embedText(text: string): Promise<number[]> {
  const out = await aiSession().run(text, { mean_pool: true, normalize: true });
  return out as number[];
}

// Defense-in-depth: even though gte-small runs in-region, never embed obvious
// PII. The retrieval query should be CLINICAL signal (complaint + symptoms),
// not raw transcript — this strips stray phone/Aadhaar/ABHA digit runs + emails.
export function scrubForEmbedding(q: string): string {
  return (q ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ')   // emails
    .replace(/\+?\d[\d\s-]{7,}\d/g, ' ')          // phone / long digit runs
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, ' ')   // Aadhaar / ABHA blocks
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Hybrid-retrieve the top protocol chunks for a clinical query.
 * Returns [] on any failure — retrieval is best-effort and must NEVER break
 * the caller (triage/SOAP/shadow still run without it).
 */
export async function retrieveProtocols(
  // deno-lint-ignore no-explicit-any
  sb: any,
  rawQuery: string,
  matchCount = 6,
): Promise<ProtocolChunk[]> {
  const query = scrubForEmbedding(rawQuery);
  if (query.length < 3) return [];
  try {
    const embedding = await embedText(query);
    const { data, error } = await sb.rpc('match_rag_chunks', {
      query_embedding: JSON.stringify(embedding), // text param → cast to vector in SQL
      query_text: query,
      match_count: matchCount,
    });
    if (error) {
      console.error('[rag] match_rag_chunks failed:', error.message);
      return [];
    }
    return (data ?? []) as ProtocolChunk[];
  } catch (e) {
    console.error('[rag] retrieve threw:', String(e).slice(0, 200));
    return [];
  }
}

/**
 * Render retrieved chunks as a system-prompt block. Empty string when nothing
 * was retrieved (so the prompt is unchanged and stays cache-friendly).
 */
export function formatProtocolContext(chunks: ProtocolChunk[]): string {
  if (!chunks.length) return '';
  const body = chunks
    .map((c) => {
      const cite = `[${c.doc_id}:${c.id}]`;
      const prov = [c.source_authority, c.guideline_version, c.section]
        .filter(Boolean).join(' — ');
      return `${cite}${prov ? ` (${prov})` : ''}\n${c.content}`;
    })
    .join('\n\n');
  return [
    '<retrieved_protocols>',
    'Supporting clinical-protocol excerpts retrieved for THIS case. Use them as',
    'evidence and cite as [doc_id:chunk_id] when you rely on one. They ADVISE',
    'only — deterministic red-flag rules and statutory refusals always win, and',
    'absence of a matching protocol never lowers urgency.',
    '',
    body,
    '</retrieved_protocols>',
  ].join('\n');
}
