# CLAUDE.md — Vaani-AI Agent Guide

## Quick Reference

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (port 8080) |
| `npm run build` | Production build (tsc + vite) |
| `npm run lint` | ESLint |
| `npm run typecheck` | tsc --noEmit |
| `supabase db push` | Apply migrations to live Supabase |
| `supabase db diff -f <name>` | Generate migration from schema diff |
| `supabase functions deploy <name> --no-verify-jwt` | Deploy webhook functions |
| `supabase gen types typescript --project-id kjhpmoqybqnjpqfqitqr > src/integrations/supabase/types.ts` | Regenerate DB types |

---

## The Board — Use Before Merging Anything

Before any non-trivial change, spawn the relevant advisor(s) via the Agent tool. Charters are in:
- `scratchpad/board-review-aanya.md` — 🩺 Dr. Aanya Sharma, Clinical CCO
- `scratchpad/board-review-aman.md` + `board-review-aman-clinicpro-mining.md` — 🧠 Aman Khurana, AI Eng VP
- `scratchpad/board-review-vikram.md` — 💰 Vikram Mehta, VC
- `scratchpad/board-review-priya.md` — 🎨 Priya Iyer, Head of Design
- `scratchpad/board-review-anand.md` — ⚖️ Adv. Anand Subramanian, Counsel
- `scratchpad/board-review-kavya.md` — ✍️ Kavya Rao, Prompt Master (persona + conversational naturalness)
- `scratchpad/board-review-arjun.md` — 🎙️ Arjun Iyengar, Voice Engineer (TTS prosody + endpointing)
- `scratchpad/board-review-ishaan.md` — 📋 Ishaan Kapoor, Director of Program Management (timeline + scope + risk register)
- `scratchpad/board-review-devansh.md` — 💻 Devansh Iyer, Lead Full-Stack Engineer (implementation execution + code quality)

Re-spawn agents with `general-purpose` subagent_type and the same persona prompt as a self-contained brief.

| Change touches… | Required reviewer(s) |
|---|---|
| Patient-facing UI / IVR script | Aanya + Priya + Anand + Kavya |
| Voice persona / TTS settings / endpointing / latency | Arjun + Priya + Kavya |
| Agent system prompt / firstMessage / fillers | Kavya + Aanya + Aman |
| Triage prompt / red-flag rules | Aanya + Aman + Kavya |
| Schema / RLS / data flow | Aman + Anand + Devansh |
| Marketing / deck / public claim | Vikram + Anand |
| PII redaction / consent / DPDP | Anand (veto) |
| Cost / pricing / unit economics | Vikram + Aman |
| Frontend / cockpit UI / ASHA app | Devansh + Priya |
| Sprint plan / scope cuts / demo readiness | Ishaan + Vikram + Devansh |
| Code implementation / PR review | Devansh + Aman |

---

## Runtime Personas (NOT board members — system agents)

### वाणी (Vaani) — AI Health-Screening Voice Assistant

- **VAPI assistants:** Hindi `466283fd-a6ed-4652-a960-e486009a85a8`, Tamil `70d9fe0c-24c8-4597-ab7c-7254e77671be`
- **Voice:** ElevenLabs Turbo v2.5 / `aSFxChEgBmCyExpaDqHd` (gender-neutral)
- **Model:** Claude Sonnet 4.6 via VAPI (anthropic provider)
- **STT:** Deepgram nova-3 multi-language (handles HI / EN / TA code-switching)
- **Role:** captures consent → walks the clinical chain (chief complaint → onset → severity → associated → demographic gate) → on red-flag, fires `escalate_to_doctor` + speaks a calm hold-line → ends ≤3 min wall-clock.
- **Vaani does NOT diagnose, transfer mid-call to another AI, or speak drug names.** The handoff target is always a real RMP (see below).

### The handoff target is a real RMP — never another AI

Earlier versions of the demo introduced "मनोरमा (Manorama)" — an AI Medical-Officer Agent that received Vaani's mid-call transfers. That layer is **removed** (2026-06-26). The cockpit IS the RMP queue. A real, named human Registered Medical Practitioner (SMC-verified + NMC HPR-linked under ABDM) sits at the cockpit and is the only one who signs SOAP notes and unlocks the patient callback.

For demo day on stage, the real RMP is whoever is signed into the cockpit. Their display name + MCI/HPR Reg # appear on every patient-facing message and on slide 8. **TODO before submission:** fill `RMP_NAME`, `RMP_MCI_REG`, and (production-mode) `RMP_PHONE_E164` in `.env.local`. Until then, the cockpit / slide / Vaani prompt all use `डॉक्टर साहब` as a placeholder.

Production-mode (slide 8 caveat): when Vaani is dialled via Exotel PSTN instead of the web SDK, `escalate_to_doctor` ALSO dials the RMP's `RMP_PHONE_E164` via SIP transfer, so the RMP joins the live call. WebRTC (web-call) does not cross to PSTN cleanly, so the web demo stays cockpit-only.

### Founder Q&A (judges ask "where's the doctor?") — memorize verbatim

> *"The doctor is right there — at the cockpit. Vaani is the front door: she screens, captures the patient's history in their language, and the moment she spots a red flag she pushes the report to the real RMP on call. That RMP is SMC-verified, HPR-linked under ABDM, and they personally review and sign every SOAP note before the patient ever hears back. The patent we're showing is the closed-loop callback — the patient learns the doctor has actually seen them. No AI signs a note. No AI dispenses care. The AI is the listener, the doctor is the decider."*

---

## Architecture (locked v2)

### Voice Pipeline — actual live flow (post-Sarvam swap, post-custom-LLM proxy)

```
Caller opens https://app.vaani.ai/asha (web) OR dials Exotel toll-free (PSTN)
  → VAPI media (Mumbai region) — assistant config:
      transcriber.provider = custom-transcriber → /functions/v1/sarvam-stt-bridge
      voice.provider       = custom-voice       → /functions/v1/sarvam-tts-bridge
      model.provider       = custom-llm         → /functions/v1/vapi-custom-llm
      tools                = capture_consent, escalate_to_doctor, end_call
    → /functions/v1/sarvam-stt-bridge
        forwards raw mic audio to Sarvam Saarika v2 (ap-south-1)
        returns text + word-level timestamps to VAPI
    → /functions/v1/vapi-custom-llm  (our proxy — closes audit D1 + D2)
        STEP 1: checkRefusal() on the last user message — PCPNDT / MHCA /
                POCSO / drug-Rx-attempt. If matched, return verbatim
                language-appropriate refusal script + insert refusal_log row.
                Bypass Claude entirely. Statutorily compliant.
        STEP 2: redactPII() on every non-system message (name / phone /
                ABHA / Aadhaar / address). Persists pii_token_map row +
                cross_border_transfers audit row per turn.
        STEP 3: Anthropic /v1/messages with cache_control: ephemeral on
                the system block. ~75% input-cost reduction in steady
                state. (Future: route via Bedrock ap-south-1 for data
                residency.)
        STEP 4: Stream Anthropic SSE → OpenAI SSE → VAPI for low-latency
                voice. content_block_delta → chat.completion.chunk.
    → /functions/v1/sarvam-tts-bridge
        Sarvam Bulbul v3 — pace 0.85 for "urgent" path (Aanya §13).
        Returns PCM s16le @ 16kHz → VAPI → speaker.

  In parallel, VAPI fires server webhooks to /functions/v1/vapi-webhook:
    → transcript     → handleTranscript → turns table insert (PII-redacted in logs)
    → status-update  → handleCallStartedIfMissing (idempotent)
    → end-of-call    → handleEndOfCall → cost breakdown + claim → dispatch to
                       /functions/v1/process-call-records
                          → /functions/v1/triage-score
                              → checkRefusal() (post-call audit) + Aanya rules
                                (deterministic red-flag layer) + Claude Sonnet
                                4.6 fallback for ambiguous cases
                              → insert triage_decisions row
                          → /functions/v1/soap-generate
                              → Claude with tool-forced emit_soap JSON
                              → mo_only_drug_hints persisted (audit D3)
                              → insert soap_notes row
                          → /functions/v1/shadow-diagnosis  (Stage 3)
                              → SEPARATE AI clinical opinion, AFTER SOAP and
                                BEFORE RMP review. Claude tool-forced
                                emit_shadow_opinion: differential_diagnoses +
                                recommended_tests + recommended_medications
                                (MO-only) + referral + urgency + missing_info.
                              → deterministic safety override: red flags raise
                                urgency (RED→Emergency, AMBER→≥Urgent).
                              → insert shadow_diagnoses row. NEVER overrides
                                the doctor — only advises.

  Cockpit poll (/functions/v1/cockpit-feed every 3s) shows the new card
  to the on-call RMP. RMP clicks card → SoapReviewDialog → MO-only
  amber drug panel + AI Clinical Opinion card (Ignore / Accept / Edit →
  /functions/v1/shadow-diagnosis-review stores the doctor's final decision
  alongside the AI recommendation) → Approve & Sign → /functions/v1/soap-sign sets
  mo_signed_at + atomically fires /functions/v1/vaani-signoff →
  Sarvam Bulbul renders patient callback ("डॉक्टर साहब ने देख लिया है …")
  with drug-scrub applied. Audio b64 returns to the cockpit and plays
  in-browser; in production, dispatched to Exotel for PSTN callback.
```

### Stack

```
Telephony ─── VAPI web SDK (browser) + Exotel toll-free (PSTN; India DLT)
Orchestrator ─ VAPI with custom-LLM, custom-transcriber, custom-voice providers
STT ─────── Sarvam Saarika v2 (ap-south-1; bridge: sarvam-stt-bridge)
TTS ─────── Sarvam Bulbul v3 (ap-south-1; bridge: sarvam-tts-bridge)
Clinical LLM ─ Claude Sonnet 4.6 via Anthropic /v1/messages with cache_control
                (path-to-Bedrock-ap-south-1 in production-roadmap §3.1)
Indic LLM ─── Sarvam-M (used by red-flag-check as the LLM-tier classifier
                fallback for ambiguous transcripts)
RAG ────────── pgvector + multilingual-e5-large (deferred until
                clinical-pathways catalogue grows)
Messaging ──── Gupshup WhatsApp + Msg91 SMS (DLT-registered templates)
Backend ──── Supabase Postgres ap-south-1 + Edge Functions Deno
Frontend ─── React 18 + Vite 5 + Tailwind + Radix Dialog/Tooltip/Popover
                + framer-motion + @tanstack/react-query + sonner + Sentry
ABDM ──────── Sandbox today; M2/M3 in docs/production-roadmap.md §1.3
```

### Performance Targets
- p95 voice latency: **<1.4s**
- Cost per 3-min consult: **₹4.30 (missed-call) – ₹8.16 (toll-free)** marginal
- Triage exact match: **≥92%** on 50-case eval
- Red-flag recall: **≥98%** (FN catastrophic)
- Red-flag precision: **≥75%** (FP acceptable)

---

## Coding Conventions

### TypeScript
- `strict: false` (matches ClinicPro for speed)
- Imports via `@/` alias for `src/`
- Functional React components only

### Edge Functions (Deno)
- Import from `https://esm.sh/` and `https://deno.land/std@0.208.0/`
- Always include CORS headers (`_shared/cors.ts`)
- Service-role client: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`
- Webhooks bypass JWT — validate `WEBHOOK_MASTER_KEY` or signature instead
- Use **constant-time bearer compare** (`_shared/constant-time-compare.ts`) for every auth gate

### Database
- All schema changes go through migrations in `supabase/migrations/` — NEVER the SQL Editor
- Migration naming: `YYYYMMDDHHMMSS_descriptive_name.sql`
- Never modify applied migrations — create new ones
- All PRs to `main` must pass eval harness (Aman §5)
- **`call_dispatch_queue` retains harassment guards** (5/24h, 14/7d) — DO NOT remove

### Clinical / Patient-facing
- **NEVER write the word "diagnosis"** in any patient-facing string. Use:
  - "presumptive screening + recommended action" (clinical record)
  - "Vaani Didi will pass your concern to the doctor" (patient-facing)
  - "AI-assisted screening" (marketing)
- **NEVER auto-send drug names to patients.** Drug suggestions go to MO cockpit only.
- **PCPNDT/MHCA/POCSO refusal scripts are HARDCODED** — never run them through the LLM.
- Every patient-facing message includes RMP name + MCI Reg # (Anand §6).

### PII Handling (Anand-mandated)
- **ALL** payloads to Claude (US) must be **PII-redacted first**.
- Use `pii_token_map` to map name/phone/ABHA → session tokens.
- Sarvam-M (Indian-hosted) MAY see raw text — it's domiciled in India.
- Never log raw PII to PostHog/Sentry — only session tokens.

---

## Supabase Rules

### ⛔ Non-Negotiable
1. ALL DB changes via migrations. No Dashboard SQL Editor for schema.
2. ALL changes via PR. Never push directly to `main`.
3. Never modify applied migrations.
4. Migration naming: `YYYYMMDDHHMMSS_descriptive_name.sql`

### Production Project
- **Project ID:** `kjhpmoqybqnjpqfqitqr`
- **Region:** `ap-south-1` (Mumbai) — **required for ABDM HDM ¶7.6 compliance**
- **Edge Function URL:** `https://kjhpmoqybqnjpqfqitqr.supabase.co/functions/v1/<name>`

### Functions Requiring `--no-verify-jwt` on Deploy
All entries in `supabase/config.toml` with `verify_jwt = false`:
`vapi-webhook · sarvam-stt-bridge · sarvam-tts-bridge · gupshup-inbound-webhook · gupshup-delivery-webhook · msg91-dlr-webhook · exotel-passthru-webhook · abdm-callback-webhook · call-dispatcher · dots-adherence-scanner · anc-schedule-scanner · medication-reminder-scanner · cohort-scanner · cohort-dispatcher · score-triage · process-call-records · shadow-diagnosis · shadow-diagnosis-review · audit-compliance-coverage`

---

## Key Reference Documents

| Document | Path |
|---|---|
| Master Plan v2 (the single source of truth) | `scratchpad/MASTER-PLAN-v2-LOCKED.md` |
| Aanya — Clinical | `scratchpad/board-review-aanya.md` |
| Aman — Architecture | `scratchpad/board-review-aman.md` |
| Aman — ClinicPro mining | `scratchpad/board-review-aman-clinicpro-mining.md` |
| Vikram — Business | `scratchpad/board-review-vikram.md` |
| Priya — Design | `scratchpad/board-review-priya.md` |
| Anand — Legal | `scratchpad/board-review-anand.md` |

---

## When You Find a Bug or Need to Change Something

1. **Identify which advisor(s) own this domain** (see board table above).
2. **Spawn them via the Agent tool** with a self-contained brief that includes the change you're proposing.
3. **Wait for their review** before writing code.
4. **Write code matching their guidance.**
5. **For schema changes, generate types** with `supabase gen types typescript` and update `src/integrations/supabase/types.ts`.
6. **Commit with clear messages.** Reference the advisor: `feat(triage): add stroke BE-FAST rule (per Aanya §2.11)`.

---

## The Hackathon Demo

5-minute live demo at India AI Hackathon (Jul 11-12, 2026, Bengaluru). Frame-by-frame script in `MASTER-PLAN-v2-LOCKED.md` §8.

**The unforgettable detail (THE SOUL):** after every MO-approved SOAP, Vaani Didi voice-calls the patient back and says, in their language:
> "डॉक्टर साहब ने देख लिया है" / "The doctor has seen you"

This is the patent we have on telemedicine's biggest failure: patient never knows if the doctor saw them. Build for that moment first.
