-- ════════════════════════════════════════════════════════════════
-- RAG hybrid retrieval — gte-small (384-dim) dense + GIN lexical
-- ════════════════════════════════════════════════════════════════
-- The baseline schema provisioned rag_chunks.embedding vector(1024) for
-- intfloat/multilingual-e5-large. We don't have an e5/Gemini embedding key,
-- but the Supabase edge runtime ships a built-in `gte-small` model (384-dim)
-- that runs IN-REGION (ap-south-1) with no external API — so the retrieval
-- embedding never leaves India (DPDP/ABDM win). Add a 384-dim column + HNSW
-- index alongside the dormant 1024 column (kept for the future e5 path).
alter table rag_chunks add column if not exists embedding_gte vector(384);

create index if not exists idx_rag_embedding_gte
  on rag_chunks using hnsw (embedding_gte vector_cosine_ops);

-- ────────────────────────────────────────────────────────────────
-- Hybrid match: dense cosine KNN + lexical full-text, fused with
-- Reciprocal Rank Fusion (RRF). Embedding is passed as text and cast so
-- supabase-js never has to serialize a pgvector param. query_text drives the
-- GIN lexical leg; an empty tsquery simply contributes nothing.
-- ────────────────────────────────────────────────────────────────
create or replace function match_rag_chunks(
  query_embedding text,
  query_text text,
  match_count int default 6,
  rrf_k int default 60,
  pool int default 30
)
returns table (
  id text,
  doc_id text,
  section text,
  content text,
  source_authority text,
  guideline_version text,
  page int,
  dense_rank int,
  lexical_rank int,
  score double precision
)
language sql stable
as $$
  with dense as (
    select rc.id,
           row_number() over (order by rc.embedding_gte <=> query_embedding::vector(384)) as rnk
    from rag_chunks rc
    where rc.embedding_gte is not null
    order by rc.embedding_gte <=> query_embedding::vector(384)
    limit pool
  ),
  lexical as (
    select rc.id,
           row_number() over (
             order by ts_rank(to_tsvector('simple', rc.content),
                              websearch_to_tsquery('simple', query_text)) desc
           ) as rnk
    from rag_chunks rc
    where query_text is not null
      and websearch_to_tsquery('simple', query_text) @@ to_tsvector('simple', rc.content)
    limit pool
  ),
  fused as (
    select coalesce(d.id, l.id) as id,
           d.rnk as dense_rank,
           l.rnk as lexical_rank,
           coalesce(1.0 / (rrf_k + d.rnk), 0) + coalesce(1.0 / (rrf_k + l.rnk), 0) as score
    from dense d
    full outer join lexical l on d.id = l.id
  )
  select rc.id, rc.doc_id, rc.section, rc.content, rc.source_authority,
         rc.guideline_version, rc.page,
         f.dense_rank, f.lexical_rank, f.score
  from fused f
  join rag_chunks rc on rc.id = f.id
  order by f.score desc
  limit match_count;
$$;
