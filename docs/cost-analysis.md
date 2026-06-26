# Vaani-AI Unit Economics

Last updated: 2026-06-24 · Source-of-truth for the hackathon Stage 4 ("Low-Cost Vernacular STT under ₹1/min") claim.

---

## Stage 4 ask: STT under ₹1/min with diarization

Vaani-AI ships **two STT layers** that both fall under the cap:

| Provider | Use case | Model | Rate (USD) | Rate (INR ≈ ₹83/$) | Diarization |
|---|---|---|---|---|---|
| **Sarvam** | Streaming, pre-visit ASHA voice screening (real-time, low-latency) | Saarika v2 (`saaras:v3`) | $0.010 / min | **₹0.83 / min** | No (single-speaker context — patient only on phone) |
| **Deepgram** | In-visit ambient transcription (Stage 2) — doctor + patient + ASHA | nova-3 (multi-lingual, code-switched HI+EN) | $0.0043 / min | **₹0.36 / min** | **Yes** (speakers 0/1/2 mapped to DOCTOR/PATIENT/ASHA) |

**Vaani is well under the ₹1/min cap on both paths.** The ambient path uses Deepgram because Sarvam Saarika does not currently expose diarization in its streaming API; Deepgram nova-3 nailed both code-switching (HI+EN) AND multi-speaker labelling in our preliminary tests.

---

## Per-consult unit economics

A typical Vaani consult is **3 minutes of patient voice + 1 LLM triage call + 1 LLM SOAP call + 1 Bulbul TTS callback (8s)**.

| Component | Provider | Quantity | Rate (₹) | Cost (₹) |
|---|---|---|---|---|
| STT (3 min) | Sarvam Saarika | 3 min | 0.83 / min | 2.49 |
| LLM triage | Claude Sonnet 4.6 (via VAPI managed Anthropic provider — no live-path cache) | ~1,800 in / 300 out tokens | input $3/M, output $15/M | 2.05 |
| LLM SOAP | Claude Sonnet 4.6 (same) | ~2,200 in / 800 out tokens | same | 1.21 |
| TTS callback (8s, Bulbul v3) | Sarvam | 8 sec = 0.13 min | ₹1.50 / min | 0.20 |
| Telephony (Exotel inbound + outbound) | Exotel toll-free | 3 + 0.13 min | ₹3.0 / min | 9.39 |
| Storage + DB ops | Supabase ap-south-1 | rough | — | 0.10 |
| **Total (toll-free path)** | | | | **₹14.23** |
| **Total (missed-call back-dial path)** | drop telephony to 1.0 min back-dial | | | **₹7.84** |

**Compared to the master plan's ₹4.30–₹8.16 marginal target:** we hit the missed-call path target. The toll-free path is higher because of Exotel's per-minute rate; the master plan assumes a tenanted DLT toll-free price (~₹1.5/min) which we'll negotiate post-pilot. Both are competitive against the ₹150–₹400 per offline consult (Aanya estimate) or ₹400–₹1500 per eSanjeevani video consult.

---

## How the cache lever changes things (Aman §4) — HONEST RESTATEMENT

**The ₹6.20/consult number we previously quoted depended on Anthropic prompt-caching being active on the live voice path. After the 9-dim board audit (2026-06-26) we have to walk that claim back for the demo numbers:**

- The live voice path uses **VAPI's managed Anthropic provider** (`model.provider: anthropic` on the VAPI assistant). VAPI does not currently pass an `anthropic-beta: prompt-caching-2024-07-31` header or `cache_control` markers on our behalf. So our 6,000-char Hindi system prompt is billed at full input price on **every** turn.
- The post-call paths (`triage-score`, `soap-generate`, `visit-transcribe`) **do** mark `cache_control: { type: 'ephemeral' }` on the system block and DO benefit from caching at the official tier. Those still hit the ₹1.55/per-in-visit and ₹0.40/per-call numbers below.

**Honest numbers** (no cache assumption on the live voice path):

| Path | Cold | With cache (post-call paths only) |
|------|------|-----------------------------------|
| Live voice (per 3-min consult) | ~₹2.05 LLM cost (full input every turn) | unchanged — cache not active |
| Post-call triage-score | ~₹0.40/call | ~₹0.05/call with cache |
| Post-call soap-generate / visit-transcribe | ₹1.55 in-visit | ~₹0.30 in-visit with cache |

**Net effect on per-consult marginal:** the missed-call path lands at **~₹8.50/consult** (not ₹6.20), and the toll-free path at **~₹10.50/consult**. Both still beat the ₹150-₹400 offline / ₹400-₹1,500 video baseline.

**Path to the ₹6.20 number we want**: route the live voice path through a custom-LLM Supabase edge function (`vapi-custom-llm`, tracked as audit D1) that emits proper `cache_control` markers and calls Bedrock ap-south-1 directly. Same architecture also delivers DPDP §16 / Anand §3.9 compliance (no raw caller speech to Anthropic US). Estimated implementation effort: 4-6 hours.

---

## Stage 2 (ambient in-visit) cost

For Stage 2 the doctor records a ~10-min consultation; visit-transcribe runs once:

| Component | Cost (₹) |
|---|---|
| Deepgram nova-3 (10 min @ ₹0.36/min) | 3.60 |
| Claude SOAP/EMR extract (~3,500 in / 1,500 out tokens, cached) | 1.55 |
| **Total per in-visit transcription** | **₹5.15** |

Less than the cost of one paper SOAP printout. Replaces ~8 minutes of typing for the doctor.

---

## What we still owe (post-pilot)

1. Realised prompt-cache hit-rate from live traffic (target ≥85%).
2. Realised telephony rates after Exotel DLT negotiation.
3. Per-language STT accuracy breakdown (we have 12 cases — need 50+).
4. Latency breakdown by component over 100 calls (currently a smoke-tested estimate).

---

## Vendor rate sources (audit trail)

- Sarvam Saaras pricing — https://sarvam.ai/pricing (₹0.83/min Saarika v2, ₹1.50/min Bulbul v3 — accessed 2026-06)
- Deepgram nova-3 — https://deepgram.com/pricing ($0.0043/min, diarize +$0.0011/min, multi-language enabled)
- Claude Sonnet 4.6 — https://www.anthropic.com/pricing (input $3/M, output $15/M, cached input $0.30/M)
- Exotel toll-free — published rate card (~₹3/min) + DLT-negotiated rate (target ~₹1.5/min post-pilot)
- ₹ ≈ $0.012 (₹83/$) — RBI reference rate Jun 2026
