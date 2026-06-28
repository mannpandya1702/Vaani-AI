# RAG Integration — Vaani-AI

**Status: live (additive grounding in SOAP + shadow), eval-gated out of triage.**

## What it is

A hybrid retrieval layer over a curated corpus of Indian primary-care clinical
protocols. It **grounds the clinician-facing outputs** (the SOAP note and the
AI shadow differential) in cited national guidelines — it does **not** make any
triage/urgency decision.

## Architecture

```
rag_chunks (Postgres)
  ├─ content            curated protocol text (37 chunks)
  ├─ embedding_gte      vector(384)  — Supabase gte-small, IN-REGION (ap-south-1)
  ├─ HNSW index         dense cosine KNN
  └─ GIN index          lexical full-text
        │
match_rag_chunks(query_embedding, query_text)   ← hybrid, fused via RRF
        │
_shared/rag.ts  →  retrieveProtocols() / formatProtocolContext()
        │
   injected into the USER message (not the cached system block) of:
     • soap-generate     (RAG_ENABLED)   ← grounds assessment/plan, cites [doc_id:chunk_id]
     • shadow-diagnosis  (RAG_ENABLED)   ← grounds differential + workup
     • triage-score      (RAG_TRIAGE_ENABLED — OFF)   ← see decision below
```

- **Embeddings never leave India.** `gte-small` runs inside the Supabase edge
  runtime (ap-south-1); no external embedding API. The retrieval query is also
  digit/email-scrubbed before it embeds. This strengthens the DPDP/ABDM story.
- **Hybrid, not just vector.** Dense (semantic) carries conversational queries;
  lexical (GIN) carries keyword queries; RRF fuses them server-side.
- **Corpus:** 37 chunks across WHO IMCI, MoHFW ANC, ICMR STW, India PEN, NTEP,
  national snakebite/rabies/Tele-MANAS protocols. Demo-curated; production needs
  clinical (Aanya) sign-off and a larger catalogue.

## The decision: why RAG is OUT of triage

We A/B-tested RAG **inside the triage band decision** on the 24-case eval
(2026-06-28):

| Metric | RAG **off** (shipped) | RAG **on** in triage |
|---|---|---|
| Emergency sensitivity (RED recall) | **100%** | 100% |
| Band exact-match | **100%** | 95.8% |
| Cases passed | 19/24 | 18/24 |

RAG in triage **regressed band accuracy** (one febrile case downgraded
AMBER→GREEN) with **no offsetting gain** — emergency sensitivity was already
100% from the deterministic rule layer, which RAG cannot improve. So, exactly
per our architecture thesis (*retrieval is probabilistic; the safety-critical
decision must be deterministic*), **RAG stays out of the triage band** and is
used only where it is purely additive: grounding the doctor-facing SOAP and the
shadow differential with cited protocols. Verified live — the shadow differential
now carries `[ICMR_STW_2022:…]` / `[IndiaPEN_2020:…]` citations.

## Flags

- `RAG_ENABLED=true` — RAG active in soap-generate + shadow-diagnosis.
- `RAG_TRIAGE_ENABLED` (unset) — RAG in triage; kept for future experiments only.

## Re-ingesting the corpus

```
# embeds each chunk with gte-small (server-side) and upserts; batch ≤5 to stay
# under the edge worker compute limit.
POST /functions/v1/rag-ingest  { "chunks": [...] }   (WEBHOOK_MASTER_KEY bearer)
# standalone retrieval probe:
POST /functions/v1/rag-retrieve { "query": "...", "k": 6 }
```
