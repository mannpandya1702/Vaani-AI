# Vaani-AI

> **The voice of health for Bharat.**
> An AI Health Worker that gives every ASHA a doctor in her pocket — built for Bharat, in Bharat's voice, on Bharat's rails (ABDM).

[![Hackathon](https://img.shields.io/badge/India_AI_Hackathon-July_11--12_2026-FF9F1C)]() [![Stack](https://img.shields.io/badge/stack-Supabase_%2B_VAPI_%2B_Sarvam_%2B_Claude-0F1B3D)]()

---

## What this is

Vaani-AI is an AI-assisted health screening, triage, and follow-up system for India's primary care. Built for the **India AI Hackathon by NextBharat Ventures + AIENGG** (July 11–12, 2026, Bengaluru).

- **Primary operator:** ASHA worker on a smartphone
- **Secondary operator:** Medical Officer (RMP) reviewing triage queue
- **Languages V1:** Hindi + Tamil live, 8 more mocked
- **Integrations:** ABDM (sandbox) · eSanjeevani · Nikshay (TB) · RCH portal (ANC)
- **Channels:** Voice (Exotel) · WhatsApp (Gupshup) · SMS (Msg91)

### What Vaani-AI is NOT

- ❌ A medical practitioner — every clinical decision is made by a Registered Medical Practitioner (RMP)
- ❌ A diagnosis tool — output is **presumptive screening + recommended action**, never "diagnosis"
- ❌ A drug-prescription system — drug names only go to the MO cockpit, never to patients

> *Vaani-AI provides AI-assisted clinical decision support. Final medical decisions are made by the named Registered Medical Practitioner.*

---

## Architecture

```
Telephony ─── Exotel (DLT toll-free) [Twilio India backup]
Orchestrator ─ VAPI (custom STT/TTS providers wired to Sarvam)
STT ─────── Sarvam Saarika v2 (multilingual Indic)
TTS ─────── Sarvam Bulbul v2 (Anushka voice = "Vaani Didi")
PII Redactor — strips name/phone/ABHA/village before any LLM call
Clinical LLM ─ Claude Sonnet 4.6 (via AWS Bedrock ap-south-1 for prod)
Indic LLM ─── Sarvam-M (intent, small-talk, in-language summary)
RAG ────────── pgvector + multilingual-e5-large over ICMR/WHO/IMCI/PEN
Guardrails ── Hardcoded refusals (PCPNDT/MHCA/POCSO) → red-flag rules → LLM classifier → schema validate → 0.85 confidence gate
Messaging ── Gupshup WhatsApp (DLT templates) + Msg91 SMS (DLT)
Backend ──── Supabase (Postgres ap-south-1 ONLY) + Edge Functions Deno
Frontend ─── React + Vite + Shadcn + Tailwind (mobile-first)
Observability PostHog + Metabase + ops_incidents table
ABDM ──────── Sandbox; M2/M3 production roadmap
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 · Vite (SWC) · TypeScript · Shadcn UI · Tailwind CSS 3 |
| Backend | Supabase (Postgres 15 ap-south-1, Auth, Edge Functions Deno, Realtime) |
| Voice | VAPI + Sarvam Saarika (STT) + Sarvam Bulbul (TTS) |
| Clinical LLM | Claude Sonnet 4.6 (via AWS Bedrock ap-south-1) |
| Indic LLM | Sarvam-M (intent + vernacular) |
| Telephony | Exotel (India) |
| WhatsApp | Gupshup |
| SMS | Msg91 (DLT-registered) |
| Hosting | Vercel (frontend) + Supabase (backend, ap-south-1) |

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Supabase CLI: `npm install -g supabase`
- A Supabase project (already provisioned: `kjhpmoqybqnjpqfqitqr` · ap-south-1 Mumbai)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env.local
# Fill in actual values in .env.local — NEVER commit this file.

# 3. Link to Supabase project
supabase link --project-ref kjhpmoqybqnjpqfqitqr

# 4. Push migrations to live Supabase
supabase db push

# 5. Generate TypeScript types from live schema
supabase gen types typescript --project-id kjhpmoqybqnjpqfqitqr \
  > src/integrations/supabase/types.ts

# 6. Start dev server
npm run dev          # → http://localhost:8080
```

### Edge Functions

```bash
# Serve locally
supabase functions serve

# Deploy a single function (always include --no-verify-jwt for webhooks)
supabase functions deploy vapi-webhook --no-verify-jwt
supabase functions deploy triage-score --no-verify-jwt
```

---

## Project Structure

```
/
├── .env.example                # template — copy to .env.local
├── index.html
├── package.json
├── tailwind.config.ts          # Vaani brand tokens (navy + saffron + green + red)
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx                 # routes: /, /auth, /cockpit/*, /asha/*
│   ├── index.css               # brand HSL + animations + language-aware fonts
│   ├── lib/utils.ts            # cn(), formatPhone, maskPhone, triage labels
│   ├── pages/
│   │   ├── Landing.tsx         # public landing page
│   │   ├── Auth.tsx            # sign-in/sign-up
│   │   ├── Cockpit.tsx         # MO doctor cockpit (Tinder-swipe queue)
│   │   ├── AshaApp.tsx         # ASHA single-screen mic UI
│   │   └── NotFound.tsx
│   └── integrations/supabase/
│       ├── client.ts           # supabase-js client
│       └── types.ts            # auto-generated DB types
└── supabase/
    ├── config.toml             # Edge Function JWT settings
    ├── migrations/
    │   └── 20260623000001_baseline_schema.sql   # 23 tables + enums + RLS helpers
    └── functions/
        ├── deno.json
        └── _shared/
            ├── normalize-phone.ts                # +91 normalization
            ├── time.ts                           # IST + business hours
            ├── concurrency.ts                    # withConcurrency() pool
            ├── ops-logger.ts                     # ops_incidents writer
            ├── constant-time-compare.ts          # webhook auth
            ├── cors.ts                           # CORS headers
            └── idempotency.ts                    # SHA256(tenant:phone:date)
```

---

## The Database Schema

23 tables. Highlights:

- **`tenants`** — Hierarchical multi-tenancy (`ASHA ⊂ PHC ⊂ District ⊂ State` via `ltree`)
- **`patients`** — PHI; name + phone + ABHA stay in DB, never sent to Claude (US)
- **`consents`** — DPDP s.6 voice-recorded consent + ABDM CM artefact
- **`pii_token_map`** — Encrypted PII tokens; reverse-map server-side only
- **`calls`** + **`turns`** — Per-turn observability (latency, tokens, cost, guardrail trips)
- **`triage_decisions`** — R/A/G band + 0.85 confidence gate; `<0.85 → MO review`
- **`soap_notes`** — eSanjeevani-compatible; `presumptive_screening_label` NEVER "diagnosis"
- **`red_flag_events`** + **`red_flag_phrases`** — Aanya's 16 red-flag rules + vernacular phrase library
- **`refusal_log`** — PCPNDT + MHCA + POCSO + drug-Rx refusals; 7-yr retention (evidence)
- **`dots_regimens`** + **`dots_dose_logs`** — NTEP TB adherence
- **`pregnancies`** + **`anc_contacts`** — MoHFW 8-contact ANC schedule
- **`call_dispatch_queue`** — Multi-channel outbound (voice/whatsapp/sms)
- **`rag_chunks`** — pgvector HNSW over ICMR/WHO clinical guidelines

See migration `20260623000001_baseline_schema.sql` for full DDL with comments.

---

## The Seven-Member Board

Every major decision is reviewed by the relevant advisor before merge:

| Advisor | Mandate | Veto domain |
|---|---|---|
| 🩺 **Dr. Aanya Sharma** (CCO) | Clinical protocols, red flags, SOAP, pilot safety, vernacular | Anything touching a patient |
| 🧠 **Aman Khurana** (VP AI Eng) | Stack, latency, prompts, eval, cost, ClinicPro reuse | Tech decisions, prompts, vendors |
| 💰 **Vikram Mehta** (VC) | Pitch, revenue model, defensibility, ask | Business model, GTM, deck |
| 🎨 **Priya Iyer** (Head of Design) | Brand, cockpit UX, Vaani Didi voice, demo polish | UI, IVR, brand assets |
| ⚖️ **Adv. Anand Subramanian** (Counsel) | DPDP, Telemedicine Guidelines 2020, ABDM HDM, NMC, MHCA, PCPNDT, contracts | **Any data flow, consent, public claim, contract** |
| ✍️ **Kavya Rao** (Prompt Master) | System prompts, persona design, conversational naturalness, fillers/backchannels, instruction-following | Any agent-facing prompt or first-message script |
| 🎙️ **Arjun Iyengar** (Voice Engineer) | TTS provider tuning, prosody (pace/pitch/SSML pauses), endpointing/VAD, latency budget, accent calibration | Voice persona, TTS params, endpointing config |

Detailed reviews in `scratchpad/board-review-*.md`. Master plan in `scratchpad/MASTER-PLAN-v2-LOCKED.md`.

---

## The 10 RED LINES (any one ends the company — Anand §16)

1. **Auto-dispatch drug names to patient** without MO co-sign
2. **Communicating foetal sex** (PCPNDT s.22/23 = criminal)
3. **Cross-state Rx** by non-state-MO when state pharmacy invoked
4. **"AI doctor" / "AI diagnoses" / "cures" in marketing/deck** (IMC Reg 6.1.1)
5. **Storing PHR outside India** OR **unredacted PII to Claude** (DPDP s.16 + ABDM HDM ¶7.6)
6. **Missing CERT-In 6-hour breach reporting** (IT Act s.70B = criminal for directors)
7. **SMS/WhatsApp without DLT template + opt-out**
8. **Onboarding MO without live SMC + NMC HPR verification**
9. **Suicidal ideation handled by AI alone** — no MO connect, no Tele-MANAS 14416
10. **Pilot without** (i) signed written consent (ii) ethics committee approval (iii) PI + Cyber insurance bound

---

## Allowed marketing wording (Anand-cleared)

- ✅ "AI-assisted health screening"
- ✅ "Voice-based triage for ASHA workers"
- ✅ "ABDM Sandbox certified; production rollout post-pilot"

**Banned:** "AI doctor" · "AI diagnoses" · "cures" · "validated" · "ABDM integrated" (pre-M3)

---

## License

Proprietary. © 2026 Vaani-AI Pvt Ltd.

Vaani-AI is a Data Processor under DPDP Act 2023, a Health Information User-and-Provider hybrid under ABDM HDM Policy, a Software-as-a-Medical-Device candidate under MDR 2017, and a registered intermediary delivering messaging under TRAI TCCCPR. **Never a clinician.**
