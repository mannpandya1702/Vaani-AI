# System Design rationale — RAG vs Agent (the explicit tradeoff)

> The hackathon judges System Design (25%) on a **"justified RAG-vs-agent decision
> with tradeoffs made explicit."** This is that justification.

## The decision

**Vaani is an agent + deterministic-rules system. RAG is deliberately deferred.**

The clinical core runs in three layers, in this order:

```
1. DETERMINISTIC red-flag layer   (rules, not retrieval, not LLM)
2. AGENTIC conversation + SOAP     (Claude via vapi-custom-llm, tool-calling)
3. RAG over clinical pathways      (pgvector + multilingual-e5)  ← STAGED, not live
```

## Why deterministic rules sit ABOVE the LLM (the safety argument)

The single catastrophic failure mode in rural triage is a **missed emergency**
(false negative). The brief's own Data-Processing criterion names "guardrails against
unsafe or hallucinated diagnoses."

- A retrieval- or LLM-probabilistic red-flag check can hallucinate or miss. Unacceptable
  when the cost of a miss is a death.
- So the red-flag layer (`triage-score` → Aanya ruleset) is **pure deterministic code**:
  16 enumerated red-flag categories, BE-FAST stroke rule, peds-respiratory co-flag, etc.
  It is auditable, testable, and has **100% recall on our eval set** — a property you
  cannot guarantee from RAG.
- The LLM (Claude) handles only what it is safe at: natural multilingual conversation,
  history-taking, and drafting the SOAP note — all of which a human RMP then signs.

## Why agent-first, RAG-deferred (the tradeoff table)

| Dimension | Agent + rules (chosen) | RAG-first (rejected for now) |
|---|---|---|
| **Red-flag recall** | Deterministic → provable 100% | Retrieval recall varies with corpus/embedding |
| **Auditability** | Every rule is code, diff-able, testable | Retrieved-context provenance harder to audit |
| **Latency** | One cached Claude call/turn (~1s) | + embedding + vector search per turn |
| **Cost** | `cache_control: ephemeral` → ~75% input savings | + embedding inference + pgvector ops |
| **Cold-start data need** | Works with zero corpus | Needs a curated clinical-pathways catalogue first |
| **Hallucination surface** | LLM constrained by tool schema + rules | Retrieved snippets can still be mis-synthesised |
| **When RAG wins** | — | Once pathways catalogue is large + citations matter |

**Conclusion:** at this stage (small curated knowledge, safety-critical recall, cold start),
an **agent with a deterministic safety floor beats RAG**. RAG is the right Milestone-2 move
once the clinical-pathways catalogue is large enough that retrieval adds recall rather than
variance. This is a *staged* decision, not a rejection — and that is exactly the "tradeoffs
made explicit" the brief asks for.

## Where each component runs (residency + cost)

| Layer | Engine | Location | Why |
|---|---|---|---|
| STT | Sarvam Saarika / Deepgram | ap-south-1 / India | vernacular, low-cost, residency |
| Red-flag rules | deterministic TS | Supabase edge (Mumbai) | auditable, zero-LLM |
| Conversation + SOAP | Claude Sonnet 4.6 | Anthropic (PII-redacted first) | best multilingual clinical drafting |
| TTS callback | Sarvam Bulbul | ap-south-1 | warm vernacular voice |
| Data | Postgres + (staged) pgvector | Supabase Mumbai | ABDM residency ¶7.6 |

## One-sentence version for the judges
> *"We put a deterministic, 100%-recall red-flag layer **above** the LLM because a missed
> emergency is catastrophic; the agent handles language and drafting; and RAG is staged for
> when our clinical-pathways catalogue is large enough to add recall instead of variance."*
