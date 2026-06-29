# Vaani-AI ↔ India AI Hackathon brief — alignment matrix

> Source: official "Call for Applications" PDF (NextBharat Ventures + AIENgg).
> This doc maps every line of the brief to **concrete, current evidence in this repo**,
> with honest gaps. It is the single source the deck + 5-min video pull from.
> Last reconciled against the code on **2026-06-29** (LiveKit-in-India voice stack,
> RAG built + eval-gated, 24-case eval, Stage-5 follow-up loop live).

## The brief in one line
> **"Build the AI layer that gives every rural patient access to a General Physician."**
> Design a voice AI agent that captures rural patient data in vernacular languages,
> converts speech → structured text (STT), and maps it to GP guidelines used by
> certified doctors.

## Two gates
| Gate | Date (brief) | Decides |
|---|---|---|
| ① 5-min application **video** | 28 Jun 2026 | shortlist |
| ② 30-hr in-person hackathon | 11–12 Jul 2026 | final (weighted dims below) |

The **video is the active deliverable.** Everything below is what it must evidence.

---

## Part A — the 5 example stages (brief says "thread multiple, not one")

| # | Brief's stage | Vaani evidence (current code) | Status |
|---|---|---|---|
| 1 | **Pre-Visit Capture** — vernacular voice → SOAP for doctor | LiveKit agent (`livekit-agent/agent.py`, ap-south-1) → `vapi-custom-llm` safety proxy → `soap-generate` → `soap_notes` (S/O/A/P). Web `/asha` (LiveKit) + PSTN fallback. | ✅ **Core / strongest** |
| 2 | **In-Visit Transcription & EMR** — ambient transcript, EMR fill, ICD-10, deviation alerts | `visit-transcribe` (Deepgram nova-3, diarised DOCTOR/PATIENT/ASHA); `soap_notes.icd10_codes` / `icd11_codes` populated by `soap-generate` | ⚠️ Transcription + ICD coding present; EMR auto-fill + guideline-deviation alerts are roadmap |
| 3 | **AI Shadow Diagnosis & Benchmarking** — parallel differential, benchmark vs junior doctors | `shadow-diagnosis` emits a **separate** AI opinion (differential + recommended tests + MO-only meds + referral + urgency + missing-info), RAG-grounded, with a deterministic safety override that can only *raise* urgency; `shadow-diagnosis-review` stores the doctor's final call beside the AI's. `eval/gp-benchmark/` compares AI vs a synthetic junior-GP. | ✅ Built end-to-end; ⚠️ benchmark counterpart is **synthetic**, not recruited GPs (see framing note) |
| 4 | **Low-Cost Vernacular STT** — code-switched, diarised, noise-handled, cheap | Sarvam Saarika v2 (`sarvam-stt-bridge`, streaming) + Deepgram nova-3 (in-visit, diarised); `docs/cost-analysis.md`: **₹0.36–₹0.83/min STT**, both under the ₹1/min cap | ✅ **Strong** |
| 5 | **Post-Visit Communication** — Rx + follow-up + worsening alerts, feature phones | **(5a)** `vaani-signoff` "the doctor has seen you" callback (Sarvam Bulbul, drug-scrubbed). **(5b)** real scheduled follow-up: `vaani-signoff` schedules a check-in on sign → `follow-up-scanner` voices "better / same / worse?" in-language days later → `follow-up-respond` records the outcome and **auto-re-escalates a *worsening* patient** back into the triage queue. Cockpit Follow-ups tab via `follow-ups-feed`. | ✅ **Differentiated** (soul callback + real worsening-alert loop); ⚠️ feature-phone IVR/WhatsApp delivery is post-pilot (today the audio plays in-cockpit) |

**Headline for judges:** most teams build one stage. Vaani **threads 1 + 3 + 4 + 5 into a working loop** — vernacular capture → low-cost STT → doctor-signed SOAP → "the doctor has seen you" callback → a follow-up that re-escalates if the patient worsens — and touches Stage 2 under one architecture.

---

## Part B — the 4 weighted judging dimensions (the in-person scorecard)

### Problem Definition — 20%  →  ✅ Strong
*"Tight scoping to a named clinical stage; clarity on user and workflow boundaries."*
- Named users: **ASHA worker** (operator) + **rural patient** (subject) + **RMP** (decider).
- Named stage: **Pre-visit screening + triage** (Stage 1), extended through the **post-visit callback + follow-up** (Stage 5).
- Hard boundary: **Vaani screens and listens; the RMP diagnoses and signs.** No AI dispenses care.

### Data Processing — 25%  →  ✅ Strongest dimension
*"Named data sources, PII handling, guardrails against unsafe or hallucinated diagnoses."*
- **Named sources:** patient voice (Sarvam Saarika / Deepgram nova-3 STT), Aanya clinical red-flag ruleset (GP guidelines: BE-FAST, IMCI, sepsis, silent-MI), constrained presumptive-screening vocabulary, and the RAG corpus of national protocols (WHO IMCI, ICMR STW, India PEN, NTEP).
- **PII handling:** the `vapi-custom-llm` proxy redacts name/phone/ABHA/Aadhaar/address **before** any cross-border reasoning call; `pii_token_map` maps PII → session tokens; a `cross_border_transfers` audit row is written per turn; raw PII is never logged. DPDP-2023 compliant by construction.
- **Guardrails vs unsafe/hallucinated output:** hardcoded PCPNDT/MHCA/POCSO refusal scripts that **bypass the LLM entirely** (`refusal_log`); a **deterministic red-flag layer** that is auditable code, not retrieval; `drug-scrub` keeps drug names out of every patient-facing string; ICD-grounding drops hallucinated codes; **every note is signed by a human RMP**.

### System Design — 25%  →  ✅ Strong (we made the call with data)
*"Justified RAG-vs-agent decision with tradeoffs made explicit."*
- **We didn't slogan the RAG-vs-agent call — we *built* RAG and A/B-tested it.** A hybrid pgvector + multilingual-e5 retrieval layer over India's national protocols is live (`rag-ingest` / `rag-retrieve`), wired into three functions behind env flags.
- **Result of the A/B:** inside the safety-critical **triage** decision, retrieval *lowered* accuracy with no recall gain — so it stays **off** there (`RAG_TRIAGE_ENABLED` unset; triage red-flags remain deterministic and provable). It stays **on** where grounding helps and is not safety-gating: the doctor's **SOAP note** and the **shadow differential** (`RAG_ENABLED` in `soap-generate` + `shadow-diagnosis`). Full tradeoff table in `docs/system-design-rationale.md`; integration notes in `docs/rag-integration.md`.
- **Data residency:** the entire vernacular voice stack — STT, TTS, and the agent itself — runs **in India on LiveKit** (ap-south-1). Only the PII-redacted reasoning call leaves the country.

### Evals — 30% (highest; *"No evals = no score"*)  →  ✅ Real numbers, honest misses
Latest run (`eval/reports/2026-06-28.md`, **24-case** senior-doctor-adjudicated set, 18 true emergencies) mapped to the brief's named metrics:

| Brief metric | Vaani measurement | Result | Target | Status |
|---|---|---|---|---|
| **(safety) emergency sensitivity** | RED recall on true emergencies (18/18 caught) | **100%** | ≥ 98% (FN catastrophic) | ✅ |
| **Error rate** | triage band exact-match (RED/AMBER/GREEN) | **100%** | ≥ 92% | ✅ |
| **Top-1 accuracy** | presumptive-label match | **90.5%** | ≥ 70% | ✅ |
| recommended-action keyword recall | safety-net phrasing present | **100%** | ≥ 95% | ✅ |
| red-flag **category** recall | exact danger-sign categories | **88.9%** | ≥ 98% | ❌ open |
| red-flag **precision** | false-category control | **66.7%** | ≥ 75% | ❌ open |
| **Cost per consultation** | marginal 3-min consult | **~₹8 (call-back) / ₹14 (toll-free)** | < ₹10 / competitive | ✅ |
| **Latency** | triage scoring p50 / p95 | **20.3s / 29.1s** | post-call (async), not voice-turn | ⚠️ async |

> **Latency note:** the ~29s p95 is the **post-call triage/SOAP** generation (async, off the patient's critical path), not live voice-turn latency (separately tuned <1.4s via LiveKit preemptive generation). Frame both distinctly so the async number isn't misread as conversation lag.
>
> **Honesty note:** we lead with the metric that matters — **100% emergency sensitivity** — and we *also* report the two we miss: category recall (88.9% vs 98%) and category precision (66.7% vs 75%). Both are *category-labelling* misses on cases we **still band correctly as RED** (e.g. postpartum sepsis tagged `neuro` instead of `sepsis`; head trauma tagged `neuro` instead of `trauma`). The patient is still fast-tracked to the doctor; the wrong sub-label is an audit-quality gap, not a missed emergency. The eval is what surfaced them — that's the point of having one.

---

## Part C — the 4 things the application VIDEO must cover
| Required | Where Vaani answers it |
|---|---|
| Clinical stage targeted + depth | Stage 1 pre-visit screening (+ threaded 3, 4, 5); rural GP-access problem |
| Vernacular voice-data approach | Sarvam Saarika / Deepgram nova-3; code-switched HI/EN/TA; gender-neutral prompt; the call *is* the dataset |
| Data-processing + system-design plan | PII-redact → reasoning → deterministic red-flag → RMP sign-off; RAG built + A/B-tested + eval-gated; LiveKit-in-India |
| Evals | the table above — real numbers, brief-named metrics, honest misses |

---

## Part D — strategic framing call: "Diagnosis" (Stage 3)
The brief names Stage 3 **"AI Shadow Diagnosis & Benchmarking"** and rewards a differential
benchmarked vs junior doctors. Vaani deliberately **never lets AI deliver a diagnosis to a
patient** (NMC Act 2019; an RMP signs every note). These are not in conflict — present it as a
**design choice that IS the Data-Processing guardrail (25%)**:

> *"We run a shadow differential for benchmarking — but the AI never delivers it to a patient.
> A certified RMP reviews and signs every note. The AI is the listener; the doctor is the
> decider."*

The shadow layer is genuinely built (`shadow-diagnosis`): a separate AI opinion produced *after*
the SOAP and *before* RMP review, with a deterministic safety override and a doctor-decision
capture (`shadow-diagnosis-review`). This converts the apparent "no diagnosis" gap into the
strongest part of the safety story.

---

## Part E — honest gaps (say these out loud; judges trust honest scope)
- **Stage 2** EMR auto-fill + GP-guideline **deviation alerts**: partial (transcription + ICD coding ship; the deviation-alert layer does not yet).
- **Stage 3** benchmark counterpart is a **synthetic** junior-GP, not recruited human GPs; scaling to a real cohort is post-pilot. We also do not yet score a formal top-k differential metric against the signing doctor (top-1 presumptive-label only).
- **Stage 5** real WhatsApp/IVR-to-feature-phone **delivery** is post-pilot (Exotel/Gupshup DLT pending); today the callback + follow-up audio play in-cockpit. The *logic* (schedule → check-in → worsening re-escalation) is fully built and live.
- **Evals:** red-flag **category recall (88.9%)** and **precision (66.7%)** miss their targets — both are sub-label quality on still-correctly-RED-banded cases, not missed emergencies. The set is 24 cases (Hindi-led); a Tamil + 50-case expansion needs a Tamil clinical reviewer.
- **No fine-tuning yet:** the corpus (every doctor-signed note) is being collected for it, but today the system is prompt + rules + RAG, not a tuned model.

---

## Reference documents (attach with submission)
| Document | Path |
|---|---|
| This alignment matrix | `docs/hackathon-brief-alignment.md` |
| 5-min video script | `docs/submission/video-script.md` |
| RAG-vs-agent rationale (dim 3) | `docs/system-design-rationale.md` |
| RAG integration notes | `docs/rag-integration.md` |
| Cost evidence (Stage 4) | `docs/cost-analysis.md` |
| Latest eval run | `eval/reports/2026-06-28.md` |
| GP-benchmark methodology (Stage 3) | `eval/gp-benchmark/methodology.md` |
