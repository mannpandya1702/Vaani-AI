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

### मनोरमा (Manorama) — AI Medical-Officer Agent (demo mode)

- **VAPI assistant ID:** `ef431343-4d6e-4bc6-94ab-0b50ec6f71df` (env: `VAPI_ASSISTANT_ID_MANORAMA`)
- **Voice:** ElevenLabs Turbo v2.5 / `Matilda` (distinct from Vaani's voice clone — listener perceives the warm-transfer as a real action)
- **Model:** Claude Sonnet 4.6, temperature 0.3, maxTokens 150
- **Trigger:** Vaani's `transfer_to_duty_mo` tool transfers the live call to Manorama when a red-flag fires
- **Role:** reassures the patient, captures 1–2 clarifying clinical details, mentions 108 (or Tele-MANAS 14416 for mental-health crisis), invokes `escalate_to_doctor` for audit, ends call in ≤90s

### Anand-mandated constraints (CONDITIONAL GO; 7 conditions, T-7 deadline)

1. **No "Dr." prefix anywhere** — voice, deck, cockpit, code. Agent is `मनोरमा`, not `Dr. Manorama`.
2. **firstMessage hardcodes 4 claims** (AI / not-doctor / no-treatment / notes-for-doctor): `"नमस्ते। मैं मनोरमा हूँ — एक AI सहायक। मैं डॉक्टर नहीं हूँ और कोई इलाज या दवा नहीं दे सकती। मैं केवल आपकी बात सुनकर डॉक्टर साहब के लिए नोट तैयार करूँगी। क्या आप आगे बात करना चाहेंगे?"` — Kavya may not soften these four bolded claims.
3. **Slide-1 disclosure verbatim** (must be visible AND voiced once before the demo call): *"Vaani-AI is a research prototype demonstrating AI-assisted clinical decision support. No medical consultation, diagnosis, prescription, or treatment is being rendered in this demonstration. All callers are consented volunteers; no doctor–patient relationship is created. 'मनोरमा' is a software agent, not a registered medical practitioner."*
4. **Cockpit UI badge**: amber chip `"AI · DEMO MODE"` next to every Manorama action — never collapsible, never hidden. Tooltip: *"AI Clinical Decision-Support Agent · Demonstration only · Not a Registered Medical Practitioner under NMC Act 2019."*
5. **Column rename in UI**: `mo_signed_at` is displayed as **"AI Draft Timestamp"** (DB column name stays for code compat; the rendered header is what matters legally).
6. **Five hardcoded red lines**: no drug names, no diagnosis words, no PCPNDT/MHCA/POCSO probing, no Aadhaar/ABHA spoken, no "approved by" claims.
7. **Volunteer caller consent form** (Anand v3, bilingual): signed by every actor for every run.

### Production-mode caveat (Anand-mandated paragraph for slide 8 or wherever production differs from demo is shown)

> *"In production, every SOAP note enters a review queue accessible only to RMPs who have completed (i) State Medical Council registration verification, (ii) NMC HPR (Healthcare Professionals Registry) ID linkage under ABDM, and (iii) Vaani-AI's internal training on the Telemedicine Practice Guidelines 2020. Manorama is a clinical decision-support agent that pre-scores triage and pre-drafts SOAP notes; the human RMP independently reviews, may modify, and electronically signs before any patient-facing communication is dispatched. The patient callback is dispatched only after the RMP's HPR-linked digital signature is captured."*

### Founder Q&A (judges ask "where's the doctor?") — memorize verbatim

> *"There's no human doctor on stage today because today's demo is a research prototype, not a clinical service. In production, every SOAP note Manorama drafts is gated behind a Registered Medical Practitioner — SMC-verified, HPR-linked — who must independently sign before the patient ever hears from us. What you're seeing on stage is the AI's draft, not a doctor's decision. The patent we're showing is the closed-loop callback that tells the patient the doctor has seen them — and in production, only a real doctor's signature unlocks that callback."*

---

## Architecture (locked v2)

### Voice Pipeline (`<1.4s p95`)
```
Caller dials Exotel toll-free
  → Exotel SIP → VAPI media (Mumbai region)
    → VAPI VAD (endpointing 300ms for Hindi long vowels)
      → Sarvam Saarika STT (streaming WS via sarvam-stt-bridge)
        → [PII redactor strips name/phone/ABHA] ← MANDATORY per Anand §3.9
          → guardrail chain (PII scrub → off-topic → red-flag rules → Sarvam-M classifier → LLM)
            → Claude Sonnet 4.6 via AWS Bedrock ap-south-1
              → output schema validator (zod) → refusal check → confidence gate (0.85)
                → Sarvam Bulbul TTS (streaming via sarvam-tts-bridge)
                  → VAPI → speaker
```

### Stack

```
Telephony ─── Exotel (India DLT)
Orchestrator ─ VAPI (custom STT/TTS providers)
STT ─────── Sarvam Saarika v2 [Deepgram backup]
TTS ─────── Sarvam Bulbul v2 [ElevenLabs backup]
Clinical LLM ─ Claude Sonnet 4.6 via Bedrock ap-south-1
Indic LLM ─── Sarvam-M
RAG ────────── pgvector + multilingual-e5-large
Messaging ──── Gupshup WhatsApp + Msg91 SMS
Backend ──── Supabase Postgres ap-south-1 + Edge Functions Deno
Frontend ─── React + Vite + Shadcn + Tailwind
ABDM ──────── Sandbox; M2/M3 roadmap
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
`vapi-webhook · sarvam-stt-bridge · sarvam-tts-bridge · gupshup-inbound-webhook · gupshup-delivery-webhook · msg91-dlr-webhook · exotel-passthru-webhook · abdm-callback-webhook · call-dispatcher · dots-adherence-scanner · anc-schedule-scanner · medication-reminder-scanner · cohort-scanner · cohort-dispatcher · score-triage · process-call-records · audit-compliance-coverage`

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
