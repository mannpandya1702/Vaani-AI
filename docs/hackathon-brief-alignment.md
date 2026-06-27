# Vaani-AI ↔ India AI Hackathon brief — alignment matrix

> Source: official "Call for Applications" PDF (NextBharat Ventures + AIENgg).
> This doc maps every line of the brief to concrete evidence in this repo, with
> honest gaps. It is the single source the deck + 5-min video pull from.

## The brief in one line
> **"Build the AI layer that gives every rural patient access to a General Physician."**
> Design a voice AI agent that captures rural patient data in vernacular languages,
> converts speech → structured text (STT), and maps it to GP guidelines used by
> certified doctors.

## Two gates
| Gate | Date | Decides |
|---|---|---|
| ① 5-min application **video** | **28 Jun 2026** | shortlist |
| ② 30-hr in-person hackathon | 11–12 Jul 2026 | final (weighted dims below) |

---

## Part A — the 5 example stages (brief says "thread multiple, not one")

| # | Brief's stage | Vaani evidence | Status |
|---|---|---|---|
| 1 | **Pre-Visit Capture** — vernacular voice → SOAP for doctor | `vapi-custom-llm` (Claude) + `soap-generate` → `soap_notes` (S/O/A/P); ASHA web `/asha` + PSTN `+1 513-822-7440` | ✅ **Core / strongest** |
| 2 | **In-Visit Transcription & EMR** — ambient transcript, EMR fill, ICD-10, deviation alerts | `visit-transcribe` (Deepgram diarised); `soap_notes.icd10_codes` / `icd11_codes` columns populated by `soap-generate` | ⚠️ Transcription + ICD present; EMR-fill + deviation-alerts are roadmap |
| 3 | **AI Shadow Diagnosis & Benchmarking** — parallel differential, benchmark vs junior doctors | `triage-score` (deterministic red-flag + Claude) emits `differential_list`; `eval/gp-benchmark/` compares AI vs junior-GP vs senior-MO | ⚠️ Framework + 5 scored cases (not "thousands"); see framing note below |
| 4 | **Low-Cost Vernacular STT** — code-switched, diarised, noise-handled, cheap | Sarvam Saarika + Deepgram nova; `docs/cost-analysis.md`: **₹0.36–0.83/min STT**, under the ₹1/min cap | ✅ **Strong** |
| 5 | **Post-Visit Communication** — WhatsApp/IVR, Rx + follow-up + worsening alerts, feature phones | `vaani-signoff` "the doctor has seen you" callback (Sarvam Bulbul); `call_dispatch_queue` for Exotel IVR / Gupshup WhatsApp | ✅ Differentiated (soul callback); ⚠️ feature-phone IVR/WhatsApp delivery is post-pilot |

**Headline for judges:** most teams build one stage. Vaani **threads 1 + 4 + 5** as a working loop (capture → low-cost STT → doctor → callback), and touches 2 + 3 under one architecture.

---

## Part B — the 4 weighted judging dimensions (the in-person scorecard)

### Problem Definition — 20%  →  ✅ Strong
*"Tight scoping to a named clinical stage; clarity on user and workflow boundaries."*
- Named user: **ASHA worker** (operator) + **rural patient** (subject) + **RMP** (decider).
- Named stage: **Pre-visit screening + triage** (Stage 1), extended to post-visit callback (Stage 5).
- Hard boundary: **Vaani screens and listens; the RMP diagnoses and signs.** No AI dispenses care.

### Data Processing — 25%  →  ✅ Strongest dimension
*"Named data sources, PII handling, guardrails against unsafe or hallucinated diagnoses."*
- **Named sources:** patient voice (Sarvam/Deepgram STT), Aanya clinical red-flag ruleset (GP guidelines), constrained presumptive-screening vocabulary.
- **PII handling:** `vapi-custom-llm` redacts name/phone/ABHA/Aadhaar **before** any US-hosted Claude call; `pii_token_map`; raw PII never logged (`dispatch_webhook_logs` redacted). DPDP 2023 compliant.
- **Guardrails vs unsafe/hallucinated output:** hardcoded PCPNDT/MHCA/POCSO refusal scripts (bypass the LLM); deterministic red-flag layer (not LLM-dependent); `drug-scrub` keeps drug names out of patient-facing text; **every note signed by a human RMP**.

### System Design — 25%  →  ⚠️ Articulate it (see `docs/system-design-rationale.md`)
*"Justified RAG-vs-agent decision with tradeoffs made explicit."*
- **Decision: agent + deterministic rules first, RAG deferred.** Rationale: red-flag recall is safety-critical (a missed emergency is catastrophic), so the red-flag layer must be **deterministic and auditable**, not retrieval-probabilistic. RAG (pgvector + multilingual-e5) is staged for when the clinical-pathways catalogue grows. Full tradeoff table in the rationale doc.

### Evals — 30% (highest; *"No evals = no score"*)  →  ⚠️ Surface the numbers (have them)
Latest run (`eval/reports/2026-06-26.json`, 12-case set) mapped to the brief's named metrics:

| Brief metric | Vaani measurement | Result | Target |
|---|---|---|---|
| **Error rate** | triage band exact-match | **100%** | ≥ 92% |
| (safety) red-flag recall | emergencies caught | **100%** | ≥ 98% (FN catastrophic) |
| (safety) red-flag precision | false-alarm control | **89.6%** | ≥ 75% |
| **Top-k accuracy** | presumptive-label match | **83.3%** | — |
| **Cost per consultation** | marginal 3-min consult | **₹4.30–8.16** | < ₹10 |
| **Latency** | triage scoring p50 / p95 | **3.5s / 28.9s** | post-call (async), not voice-turn |

> Latency note: 28.9s p95 is the **post-call triage/SOAP** generation (async, off the patient's critical path), not the live voice-turn latency (separate target <1.4s). Frame both distinctly in the deck so the async number isn't misread as conversation lag.

---

## Part C — the 4 things the application VIDEO must cover
| Required | Where Vaani answers it |
|---|---|
| Clinical stage targeted + depth | Stage 1 pre-visit screening (+ threaded 4, 5); rural GP-access problem |
| Vernacular voice-data approach | Sarvam Saarika / Deepgram nova; code-switched HI/EN/TA; gender-neutral prompt |
| Data-processing + system-design plan | PII-redact → Claude (cached) → deterministic red-flag → RMP sign-off; agent-over-RAG rationale |
| Evals | the table above — real numbers, brief-named metrics |

---

## Part D — strategic framing call: "Diagnosis" (Stage 3)
The brief names Stage 3 **"AI Shadow Diagnosis & Benchmarking"** and rewards a differential
diagnosis benchmarked vs junior doctors. Vaani deliberately **never lets AI deliver a
diagnosis** (NMC Act 2019; an RMP signs every note). These are not in conflict — present it
as a **design choice that IS the Data-Processing guardrail (25%)**:

> *"We run a shadow differential for benchmarking — but the AI never delivers it to a patient.
> A certified RMP reviews and signs every note. The AI is the listener; the doctor is the
> decider."*

This converts the apparent gap into the strongest part of the safety story.

---

## Part E — honest gaps (say these out loud; judges trust honest scope)
- Stage 2 EMR-auto-fill + GP-guideline deviation alerts: partial.
- Stage 3 benchmark is 5 scored cases, not thousands (methodology scales; data doesn't yet).
- Stage 5 real WhatsApp/IVR-to-feature-phone delivery: post-pilot (Exotel/Gupshup DLT pending); today the callback plays in-cockpit.
- Eval set is 12 cases (Hindi-led); Tamil + 30-case expansion needs a Tamil clinical reviewer.
