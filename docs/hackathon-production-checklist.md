# Vaani-AI · Hackathon Production-Ready Checklist

**Goal:** the hackathon submission system actually works as a real product on demo day — not a "demo with mocks." Judges who poke under the hood find production-grade choices, real Indic providers, real PII compliance, honest disclosures, and a working closed-loop.

This is NOT the full enterprise production roadmap (`docs/production-roadmap.md` for that). This is "demo-day production-ready" — 2 days of focused work.

## Tier 0 — Already in place (audit-closed)

- [x] Custom-LLM proxy deployed + tested (`vapi-custom-llm`)
- [x] Drug-scrub + `mo_only_drug_hints` (audit D3)
- [x] Slide-1 disclosure modal (audit B3)
- [x] Volunteer consent v3 form (audit B4)
- [x] PII-redacted webhook logs (audit §3)
- [x] EOC ordering + status-update race fixed
- [x] Eval recall 100%, band-match 100%, 10/12 passing
- [x] Webcall pipeline end-to-end (`86fc1a6`)

## Tier 1 — Critical (do today)

### Voice path → Indic, PII-compliant
- [ ] **Flip Hindi assistant to custom-LLM proxy** — `deno run eval/enable-custom-llm.ts hi`. Brings live PII redaction (DPDP §16) + live PCPNDT/MHCA/POCSO refusal interception + prompt cache.
- [ ] **Swap Deepgram STT → Sarvam Saarika** on both assistants. India-resident audio processing.
- [ ] **Swap ElevenLabs TTS → Sarvam Bulbul v3** on both assistants. Native Indian TTS.
- [ ] **Verify 50-call regression** — make sure refusal-triggering phrases hit the verbatim script.

### Remove demo chrome
- [ ] Drop "AI · DEMO MODE" amber chip everywhere. Replace with "AI-Assisted Screening · Pilot" black chip.
- [ ] Replace `DemoGate` token gate with a proper Supabase Auth login (phone OTP).
- [ ] Drop the "Demo mode · Not a Registered Medical Practitioner" caption in the cockpit. Keep the RMP credential line.
- [ ] Drop placeholder copy ("post-demo", "coming soon") on the bottom nav tabs — render real data or remove the tabs.

### Real RMP details
- [ ] Fill `RMP_NAME`, `RMP_MCI_REG`, `RMP_PHONE_E164` in `.env.local` (and deploy as Supabase secrets).
- [ ] Surface these on every signed SOAP + on the patient callback message.

## Tier 2 — Production-grade UX (1 day)

### Cockpit polish
- [ ] **Search + filter** by band / patient / category / date range.
- [ ] **Patient timeline tab** — past consultations across visits.
- [ ] **RMP performance dashboard** — signed today, avg time-to-sign, queue depth.
- [ ] **Bulk-sign** for GREEN cases (with separate audit trail).
- [ ] **Shift handoff** — RMP coming off shift hands open SOAPs to the next RMP.

### ASHA app polish
- [ ] **Patient timeline** — past sessions for this patient.
- [ ] **Mid-call mute level meter** (the in-call mic indicator).
- [ ] **Better ended states** — silence-timeout shows the mic-check widget again.
- [ ] **Network quality indicator** in-call (using VAPI network-quality events).

### Landing rewrite
- [ ] Reframe from "demo" to "Vaani-AI Pilot — Voice AI Health Screener for Bharat." Pilot in 3 PHCs, etc.
- [ ] Honest stats (10 calls/day baseline → forecast).
- [ ] CTA hierarchy (1 primary, 2 secondaries).

## Tier 3 — Engineering rigor (half day)

- [ ] **GitHub Actions CI** — every PR runs typecheck + lint + eval harness. Fails merge if recall < 98%.
- [ ] **Sentry** — error tracking on AshaApp, Cockpit, every edge function.
- [ ] **Health endpoint** for every edge function (`GET /functions/v1/<fn>/health` returns `{ ok: true, version }`).
- [ ] **Synthetic monitor** — a cron that triggers a fake call once an hour and verifies the full pipeline runs.
- [ ] **Cost tracking dashboard** — `/cockpit/admin/costs` reading from `call_costs` joined with `tenant`. Per-call, per-day, per-month.

## Tier 4 — Docs + submission

- [ ] **CLAUDE.md** rewritten — strip the demo references, update voice diagram from obsolete Sarvam/Exotel to actual VAPI-web path, replace Manorama-era language.
- [ ] **README.md** — quickstart for a new dev, real setup steps, production deployment notes.
- [ ] **Architecture diagram** — current actual flow (VAPI web → Sarvam STT/TTS → custom-LLM proxy → Bedrock → ...).
- [ ] **Eval report (latest)** — `eval/reports/2026-06-26.md` referenced from README.
- [ ] **Cost analysis** updated with the post-Sarvam-swap numbers.
- [ ] **Production-roadmap.md** linked from README as the path forward.
- [ ] **Architecture-change docs** (Manorama removal, etc.) linked from CLAUDE.md.

## Tier 5 — Your work (recordings + sign-offs)

- [ ] Re-record the eval VO with `2026-06-26.md` numbers (10/12, recall 100%, p95 28.9s).
- [ ] Record `demos/vaani-fallback-hi.mp4` (4:30 clean happy-path).
- [ ] Get one real RMP to give consent for their name + MCI Reg # on every callback message.
- [ ] Sign + scan the volunteer consent form for each demo-day actor.
