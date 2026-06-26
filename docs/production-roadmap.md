# Vaani-AI · Production-Grade Roadmap

**From "research-prototype demo" → "live clinical service shipping advice to real patients."**

This is not a feature list. The shift is regulatory, clinical, organizational. Every layer of the stack needs to change AND a non-technical layer (legal / clinical advisory / IEC / partnerships / insurance) needs to come up from zero. Honest timeline: **6–12 months** from today to a defensible v1; **18 months** to scale-ready.

Author: Vaani-AI engineering, 2026-06-26. Reviewed against the 9-dim audit at `docs/audits/2026-06-26-9dim-board-audit.md`.

---

## TL;DR — what changes vs. today

| Layer | Demo (today) | Production v1 |
|-------|--------------|---------------|
| **Legal frame** | Research prototype with Anand-CONDITIONAL-GO + 7 conditions | Licensed digital health entity, DPDP-compliant, registered ABDM HIE-CM participant |
| **Clinical authority** | "Demo RMP" placeholder | A panel of 8–15 SMC-verified RMPs on rotation, with a Medical Director |
| **Patient ↔ AI relationship** | Volunteer-consented, no doctor-patient relationship | Full DPDP s.6 consent, HPR-linked RMP signs each encounter, doctor-patient relationship CREATED |
| **STT/LLM/TTS routing** | VAPI managed providers + Anthropic US | Sarvam STT/TTS (India-resident) + Claude via Bedrock ap-south-1, custom-LLM proxy |
| **Schema** | `tenants` for one demo PHC, anon-key cockpit-feed | Multi-tenant, JWT-authenticated, per-RMP RLS, tenant-isolated PII |
| **Eval** | 12 cases passing 10/12, recall 100% | 500+ cases, monthly auto-eval CI gate, real-call regression, paper-published methodology |
| **Ops** | Single dev pushes to main | On-call rotation, runbooks, incident response, 24×7 escalation |
| **Compliance** | DEMO MODE chip, slide-1 disclosure | DPIA, DPO appointed, ABDM HFR + HPR, CDSCO if drug-related, IEC sign-off |
| **Insurance** | None | Cyber liability + medical malpractice (E&O) |

The audit closed every demo-grade item it could. None of those line up to ship a clinical service. Below is what does.

---

## 1. Legal & Regulatory (the gate everything else passes through)

### 1.1 Entity + appointments

| Item | Why | How |
|------|-----|-----|
| Incorporate the legal entity (Pvt Ltd or Section 8) | Limited liability + tax + GST + DPA signing capacity | Vakilsearch / Cleartax / a counsel — 2 weeks |
| Appoint a **Data Protection Officer** (DPO) | DPDP Act 2023 s.10 mandatory for Significant Data Fiduciaries; health data triggers it | Hire a privacy lawyer / fractional DPO; ~₹40–80k/month |
| Appoint a **Medical Director** | NMC / SMC requirement; clinical authority + signed-off SOPs | Senior RMP, ≥10y experience; full-time or part-time consulting |
| Appoint a **Compliance Officer** | DPDP + ABDM + PCPNDT + MHCA + POCSO mandatory reporting | Can double with the DPO at small scale |
| Register the **Grievance Redressal Officer** | DPDP s.10 + ABDM HDM ¶17 | Email + phone + 7-day SLA published |

### 1.2 DPDP Act 2023 — full data-fiduciary obligations

The audit's D1 finding (live PII to Anthropic US) was just one slice. Full readiness:

- [ ] **Data Protection Impact Assessment (DPIA)** — written + signed before the first paying customer. Sections 11.2 + 12.2 cover what to include.
- [ ] **Privacy Policy** in 22 official languages (s.5(2)(b)) — not English-only.
- [ ] **Consent Manager registration** with the Data Protection Board once the framework rules are notified.
- [ ] **Data Processing Agreements (DPAs)** with every processor:
  - VAPI (telephony orchestration) — they need to be willing to be your processor under DPDP. Verify.
  - Anthropic — need a DPA explicitly listing Bedrock ap-south-1 as the processing region.
  - Deepgram — STT; verify if they support an India-region. Likely move to Sarvam STT.
  - ElevenLabs — TTS; verify region; likely move to Sarvam Bulbul TTS.
  - Supabase — DPA + region attestation (already ap-south-1, good).
  - Gupshup / Msg91 — WhatsApp + SMS; DPDP-compliant DPAs.
  - Exotel — telephony; DLT-registered template archive.
- [ ] **Cross-border transfer register** — the schema column `cross_border_transfers` exists; needs to fire on every transfer with a session token + lawful-basis flag.
- [ ] **Records of Processing Activities (RoPA)** — what data, what purpose, what retention, what recipients.
- [ ] **Breach notification runbook** — 72 hours under DPDP s.8(6).
- [ ] **Right-to-erasure workflow** (s.13) — patient says "delete me" → all PII deleted within 30 days, audit trail kept under `legal_hold`.
- [ ] **Right-to-access workflow** (s.11(1)(b)) — patient asks "what do you have on me" → exportable JSON within 30 days.
- [ ] **Verified consent withdrawal** (s.6(4)) — "रोको" / "बंद कीजिए" cue exists in the prompt; needs a tested wire to recording-delete + processing-stop.
- [ ] **Significant Data Fiduciary registration** — at scale (>100k users), DPDP s.10. Brings additional audit + DPIA + Indian-resident DPO requirements.

### 1.3 ABDM (Ayushman Bharat Digital Mission)

You're currently *Sandbox* only. Real production needs:

- [ ] **HFR (Health Facility Registry) registration** — every RMP-staffed virtual clinic = a digital health facility.
- [ ] **HPR (Healthcare Professionals Registry) linkage** — every RMP must be HPR-linked. The `RMP_NAME` / `RMP_MCI_REG` env vars become tables backed by ABDM's API.
- [ ] **HIE-CM (Health Information Exchange — Consent Manager) integration** — for fetching ABHA-linked patient health records with consent.
- [ ] **Milestone M2 → M3** — production rollout requires sign-off, not Sandbox. Allocate 2–3 months of integration work.
- [ ] **ABHA / ABHA Address** integration — patient registration via ABHA-mobile-OTP or ABHA QR scan.
- [ ] **FHIR R4 conformance** — every SOAP note shipped via ABDM must be a FHIR R4 Composition resource. Today we ship `esanjeevani_payload` as JSON. Replace with FHIR R4.
- [ ] **SNOMED-CT / ICD-11 MMS** terminology mapping — the audit found `presumptive_label` enum needs an authoritative crosswalk.
- [ ] **Audit log retention** — ABDM HDM ¶12 mandates 10-year retention of consent + access logs.

### 1.4 Clinical-practice law

- [ ] **NMC Act 2019** + **TPG 2020 ¶3.5** — every patient-facing decision is signed by a real RMP. The cockpit-handoff architecture (done) supports this. Production: enforce sign-off as a row-level constraint, not a UI affordance.
- [ ] **IMC Reg 6.1.1** — already banned "diagnosis" in marketing copy. Bigger gate: nothing the AI says should resemble a clinical opinion at the patient. The "presumptive_screening_label" + "the doctor will see your report" framing is correct; needs a counsel re-read.
- [ ] **PCPNDT Act 1994 s.22** — the live refusal interception (audit D2, custom-LLM proxy) is the right structural fix. Production needs a PCPNDT-compliant audit register (`pcpndt_refusal_log` exists; constraint `chk_pcpndt_complete` was relaxed today — needs the audio-segment-fill job).
- [ ] **MHCA 2017 s.18** — same. Live interception of suicidal-intent flags. Done in proxy.
- [ ] **POCSO Act 2012 s.19** — mandatory reporting. Today the under-18 gate triggers `escalate_to_doctor(category='peds_safeguarding')` and a refusal script. Production needs an actual filing workflow to SJPU + a `pocso_reports` row with case officer, file number, status.
- [ ] **CDSCO** — if you ever recommend a drug brand or dosage in a patient-facing channel, you become a "prescription" under Drugs & Cosmetics Act and need a CDSCO licence. The `mo_only_drug_hints` + drug-scrub architecture keeps drugs MO-only; verify counsel agrees this stays out of scope.
- [ ] **Clinical Establishments Act 2010** (in states that adopted it) — virtual clinics may need registration.

### 1.5 Telecom / DLT

- [ ] **DLT registration** on Jio/Airtel/Vi platforms for every SMS template. The harassment guards (5/24h, 14/7d) are already mandated; the per-template approvals are not.
- [ ] **Voice DLT scrubbing** for outbound dial. Exotel needs the entity-id and template-id baked in.
- [ ] **TCCCPR-2018 consent register** — every "voice-call consent" needs a timestamped record. The `consents` table is the substrate; needs a TRAI-format export.

### 1.6 Insurance

- [ ] **Cyber liability** — DPDP s.8 + s.13 violations can be ₹250 cr per breach. Get a ₹10–25 cr cyber-liability policy. ICICI Lombard / HDFC Ergo / Tata AIG quote in days.
- [ ] **Medical Errors & Omissions (E&O)** — if a screening gets it wrong and a patient is harmed, the RMP's individual indemnity isn't enough. Vaani-AI the entity needs its own E&O policy.
- [ ] **Director & Officer (D&O)** liability — once you have a board.

### 1.7 Contracts

- [ ] **Master Service Agreement (MSA)** template — for each clinic / hospital / state-government customer.
- [ ] **Business Associate Agreement (BAA)** — for processors handling PHI.
- [ ] **Data Sharing Agreement** — between Vaani-AI and the customer's existing IT vendor (Practo, eSanjeevani, etc.).
- [ ] **End User License Agreement** — patient-facing app.

**Effort:** 6–8 weeks elapsed, dominated by counsel back-and-forth. Cost: ₹15–30 L in legal fees + ₹2–5 L/year insurance premium. This is the **mandatory prerequisite to every other section below.**

---

## 2. Clinical & Medical Operations

### 2.1 Clinical Advisory Board

Today: 0. Production needs:

| Role | What they do | Time commitment |
|------|--------------|-----------------|
| **Medical Director** | Sign every clinical SOP. Final clinical authority. Member of the company's leadership. | 0.5 – 1.0 FTE |
| **Specialty Advisors** (5–6 people) | Internal Medicine, Paediatrics (IMCI), Obstetrics, Mental Health, Emergency Medicine, Family Medicine. Review the eval set, the red-flag rules, the refusal scripts. | 4–8 hrs/month each |
| **Ethics Committee Liaison** | Run any prospective validation study through an Institutional Ethics Committee (IEC) — required for any research with patient interaction. | 1 IEC submission per study |

### 2.2 RMP Panel

A real, recruitable, SMC-verified, HPR-linked panel of practitioners who actually sit at the cockpit.

| | Demo | Production |
|---|------|------------|
| Headcount | 1 placeholder (`RMP_NAME` env var) | 8–15 across day/night shifts |
| Verification | Trust the env var | SMC certificate upload + HPR API verify + photo + medical-council reg # + speciality + state |
| Onboarding | none | 1-week training: TPG 2020, our prompt safety rules, the cockpit UX, red-flag protocols, escalation to 108/112 |
| Compensation | none | Per-encounter fee (₹50–150) OR fixed retainer + per-encounter bonus |
| Availability | "the demo RMP" | Roster + on-call schedule; 24×7 coverage in production |
| Quality assurance | none | Random 5% audit of every RMP's signed notes by the Medical Director |

### 2.3 SOPs (Standard Operating Procedures)

Each of these is a 5–15 page document that the Medical Director signs:

- Clinical safety SOP (red-flag escalation, 108 dispatch, when to break the AI loop)
- Refusal-script SOP (PCPNDT / MHCA / POCSO)
- Drug-mention handling SOP (audit §2: drug-scrub layer is the substrate)
- AI-output review SOP (RMP's responsibility when signing a SOAP)
- Adverse event reporting SOP
- Patient complaints SOP
- Data breach SOP
- Mortality / serious harm review SOP

### 2.4 Validation studies

Production-grade clinical AI needs prospective validation, not just retrospective eval:

- [ ] **IEC-approved prospective study** comparing Vaani screening vs. RMP consultation on 1,000–3,000 cases. Endpoints: sensitivity/specificity per red-flag category, time-to-RMP, patient satisfaction, adverse events.
- [ ] **Peer-reviewed publication** of the methodology and results. Targets: BMJ Open / Lancet Digital Health / npj Digital Medicine.
- [ ] **Periodic re-validation** — at least quarterly, on a fresh case set.
- [ ] **Bias audits** — across age, gender, language, region, literacy level. Document and publish results.
- [ ] **Adverse event registry** — every "Vaani missed a red flag" or "doctor disagreed strongly" gets a row with root-cause analysis.

---

## 3. Technical Architecture

### 3.1 Voice pipeline — the proxy becomes the production path

| Component | Demo | Production |
|-----------|------|------------|
| STT | Deepgram nova-2 (US) | **Sarvam Saarika** (India-resident) for Hindi + Tamil, with Deepgram as a fallback only for English code-switching |
| LLM | VAPI managed Anthropic provider (US) | **`vapi-custom-llm` proxy** (audit D1) → **Claude via Bedrock ap-south-1**. Prompt-cache active. PII redacted every turn. cross_border_transfers logged. |
| TTS | ElevenLabs Turbo v2.5 (US) | **Sarvam Bulbul v3** (India) for HI + TA, ElevenLabs fallback for English. |
| Refusal interception | Post-call only | Live, in the proxy, pre-LLM (audit D2 already done) |
| Telephony | VAPI web SDK + Exotel | Same, but Exotel DLT-registered + ABDM linked |

**To flip:** `eval/enable-custom-llm.ts hi both` once Sarvam STT/TTS bridges are wired (they already exist at `_shared/sarvam-client.ts`, `sarvam-stt-bridge`, `sarvam-tts-bridge`).

### 3.2 Authentication

Today: anon key for cockpit, `WEBHOOK_MASTER_KEY` Bearer for internal, `?demo=` token gate, public VAPI key in browser.

Production:

- [ ] **Patient auth**: ABHA mobile OTP (preferred) OR phone OTP via DLT-registered template. Issue a Supabase JWT scoped to `patient_self`.
- [ ] **RMP auth**: ABDM HPR OAuth flow → Supabase JWT scoped to `rmp` + the assigned tenants.
- [ ] **ASHA worker auth**: same as RMP but scoped to `asha` (read-only on cockpit).
- [ ] **Admin auth**: Workspace SSO (Google / Microsoft).
- [ ] **VAPI public key**: replace browser-side raw key with an edge function that mints a short-lived JWT per call (audit D7, deferred today).
- [ ] **Service-to-service**: replace `WEBHOOK_MASTER_KEY` with mTLS or signed JWTs. Rotate the secret on a 90-day schedule.

### 3.3 RLS — the real one

Today: many tables have RLS off or have permissive policies, edge functions use service-role to bypass. Production:

- [ ] Every `tenant_id` column gets an RLS policy: `tenant_id IN (SELECT tenant_id FROM rmp_tenants WHERE rmp_id = auth.uid())`.
- [ ] Every `patient_id` column gets a stricter policy: only the patient themselves + RMPs in their tenant.
- [ ] Audit tables (`consents`, `refusal_log`, `pocso_reports`, `cross_border_transfers`) are read-only to RMPs and write-only to the system role.
- [ ] Penetration test the RLS: 10+ assumed-breach scenarios run quarterly.

### 3.4 Multi-tenancy

Today: one demo `Vaani-AI Demo PHC` tenant + the `__demo_cockpit__` tenant.

Production:

- [ ] Tenants table grows to hold real clinics, hospitals, state-government deployments.
- [ ] Tenant settings UI (clinic name, branding, RMP roster, language defaults, working hours).
- [ ] Per-tenant rate limits + quotas.
- [ ] Per-tenant billing rows.
- [ ] Per-tenant data residency (some customers will demand on-prem; defer until ARR justifies it).

### 3.5 Reliability + observability

- [ ] **Error tracking** — Sentry, every edge function + the React app.
- [ ] **Tracing** — OpenTelemetry, every request gets a trace_id flowing across edge functions, VAPI webhook, custom-LLM proxy, Anthropic call.
- [ ] **Metrics** — Prometheus (or Grafana Cloud); SLOs per pipeline stage with error budgets.
- [ ] **Logging** — structured JSON; no raw PII (today's audit-§3 fix is the floor, not the ceiling).
- [ ] **Synthetic monitoring** — run a fake call through the whole pipeline every 5 minutes from 3 regions.
- [ ] **On-call rotation** — PagerDuty / Opsgenie. SEV-1 (patient harm) = 5min response.
- [ ] **Incident runbooks** — for the top 10 expected incidents (VAPI down, Anthropic down, DB failover, mass-call spike, etc.).
- [ ] **Status page** — status.vaani.ai for customers.

### 3.6 Resilience

- [ ] **Read-replicas** on Supabase Postgres (Pro plan) for the cockpit-feed query.
- [ ] **Backup** — Supabase PITR is on Pro; verify retention is ≥30 days. Encrypted off-site snapshot to a different region for DR.
- [ ] **Disaster recovery plan** — RPO ≤ 1h, RTO ≤ 4h. Tabletop exercise every quarter.
- [ ] **Multi-region failover** for the LLM — Bedrock has us-east-1 + ap-south-1; primary ap-south-1, fallback ap-southeast-1 (Singapore) with cross-border transfer logging if hit.
- [ ] **VAPI fallback** — if the entire VAPI org goes down, we can't take calls. Either dual-vendor (Daily.co direct) or graceful degradation to a "callback later" flow.

### 3.7 Performance + cost

- [ ] **Custom-LLM proxy cache hit rate** — measure + publish; target ≥75% in steady state.
- [ ] **Per-call cost budget** with hard cap — kill the call gracefully if a single call exceeds ₹15 marginal.
- [ ] **Latency SLOs** — p95 < 1.4s end-to-end is in CLAUDE.md; needs continuous load testing to confirm under real traffic.
- [ ] **Load testing** — 100 concurrent calls, 1000 concurrent calls. Identify bottlenecks (Sarvam quotas? Supabase Postgres connection pool? Anthropic concurrency?).

### 3.8 Security

- [ ] **Secret management** — move from `.env.local` to AWS Secrets Manager / Vault. Rotate every 90 days, audit access.
- [ ] **Penetration test** — independent firm, before public launch. ₹4–10 L.
- [ ] **SOC 2 Type II** — if going B2B enterprise. ₹15–30 L + 6-month observation window.
- [ ] **ISO 27001** — if pursuing government tenders.
- [ ] **CCPA / HIPAA** — only if expanding outside India.
- [ ] **DDoS protection** — Cloudflare in front of every public surface.
- [ ] **WAF** — Cloudflare or AWS WAF with rules for OWASP Top 10.
- [ ] **Vulnerability scanning** — Snyk / Dependabot, weekly.
- [ ] **Code review gates** — every PR needs review + CI gate including the eval harness.

---

## 4. Data & AI Hardening

### 4.1 Eval at scale

Today: 12 cases, 10/12 passing, recall 100% on red-flag subset.

Production:

- [ ] **500+ case eval set** spanning every red-flag category × every language × every age group × every comorbidity. Built with the clinical advisors. Versioned.
- [ ] **Continuous eval CI gate** — every commit runs the full 500-case eval before merge. Gates merge if recall drops below 98%.
- [ ] **Real-call regression** — sample 1% of real production calls, anonymized, replay against the new prompt, ensure no regressions.
- [ ] **Inter-rater reliability** — measure Cohen's κ between Vaani's screening and a panel of 3 RMPs on the same cases. Publish.
- [ ] **Out-of-distribution detection** — when the LLM is confident on a transcript far from training distribution, flag it as `needs_mo_review=true` even on GREEN band.
- [ ] **Drift detection** — weekly compare current label distribution to baseline; alert on >10% shift.

### 4.2 PII redactor + audit chain

The `pii-redactor` is already used pre-Anthropic in the post-call paths. Audit-§4 nits remaining:

- [ ] Replace `'anand'` in the LOCATION denylist (legitimate city-name leak prevention; today it would over-redact "Anand district").
- [ ] Aadhaar / ABHA: add Verhoeff checksum before tokenizing.
- [ ] Session token: `crypto.getRandomValues` (today time-based + default seed).
- [ ] Fail-loud on missing `PII_REDACTION_SEED`; today defaults silently.
- [ ] PII redactor unit-tested with 200 adversarial inputs.
- [ ] PII redactor is part of CI (every PR runs the redactor against the test corpus).

### 4.3 Clinical record fidelity

- [ ] **FHIR R4** conformance on every SOAP. Replace `esanjeevani_payload` with `Composition` + `Observation` + `MedicationRequest` resources.
- [ ] **Authoritative terminology** — every diagnosis label, every ICD code, every drug name, every investigation. Today we hardcode in Hindi prompts; production needs SNOMED-CT crosswalk.
- [ ] **Versioned care pathways** — `imci_pneumonia` today is a string. Production: a `care_pathway` row with version, source (WHO/IAP/IMCI), authoring date, deprecation date.

### 4.4 Prompt management

- [ ] Move the Hindi/Tamil system prompts out of `docs/prompts/` (current source of truth) AND out of the VAPI assistant config (current live runtime) into a single versioned `prompt_versions` table.
- [ ] Every prompt change goes through:
  1. PR + clinical advisor review
  2. Eval re-run + recall regression check
  3. A/B test on 5% of production traffic for 1 week
  4. Full rollout
- [ ] Tag every clinical decision with the prompt version that produced it (for retrospective audit).

### 4.5 Adverse event registry

- [ ] New `adverse_events` table: every "Vaani missed a red flag, patient deteriorated" gets logged.
- [ ] Triggered by: RMP flag, patient complaint, follow-up call follow-up, hospital admission within 48h.
- [ ] Reviewed weekly by the Medical Director + the Chair of Engineering.
- [ ] Quarterly published metric: AE/1000 consults.

---

## 5. Frontend & UX

### 5.1 Remove demo scaffolding

- Drop the `<DisclosureModal>` if you want — replace with a normal terms-of-service flow.
- Drop the AI · DEMO MODE chip everywhere. Replace with an "AI-Assisted Screening" badge that's still visible but not "DEMO."
- Drop the placeholder bottom-nav tabs in the cockpit; ship real Patients / Notes / Me views.
- Drop the `DemoGate` (audit D4 component). Replace with real auth (s. 3.2 above).

### 5.2 Patient app (separate from ASHA app)

ASHA app is today a stand-in for the patient. Production needs:

- [ ] **Patient PWA / native app** with ABHA-linked login.
- [ ] Patient sees their own past consultations, their SOAP notes (in their language), their follow-up reminders.
- [ ] Patient can mute Vaani mid-call (already in AshaApp), trigger an emergency 108 dial.
- [ ] Patient can withdraw consent (DPDP s.6(4)) in-app, see audit of who saw their data.

### 5.3 RMP cockpit production polish

- [ ] **Multi-tenant switch** in the header.
- [ ] **Shift handoff** UI — RMP coming off shift hands open SOAPs to the next RMP with a one-line note.
- [ ] **Search + filters** — by band, by patient, by category, by date range.
- [ ] **Bulk-sign** for low-acuity GREEN cases (with separate audit trail).
- [ ] **Performance dashboard** for the RMP — number signed this week, avg time to sign, AE flag count.
- [ ] **Patient timeline** — past visits across the patient's entire ABDM record.

### 5.4 Admin console

A real admin UI for tenant onboarding, RMP roster management, eval review, audit log access. New surface, ~3 months to build.

### 5.5 Accessibility

- [ ] WCAG 2.2 AA across both surfaces.
- [ ] Voice-only mode for visually impaired patients.
- [ ] Tested with screen readers, keyboard-only, high-contrast modes.

---

## 6. Infrastructure & DevOps

### 6.1 CI/CD

- [ ] GitHub Actions / GitLab CI: lint + typecheck + eval + integration tests on every PR. **CI must fail if eval recall drops below 98%.**
- [ ] Staging environment that mirrors production (separate Supabase project, separate VAPI org).
- [ ] Blue/green deploy for edge functions.
- [ ] Database migrations gated on staging + reviewed before push to production.
- [ ] Feature flags (LaunchDarkly / Statsig / OpenFeature) — no more "flip the assistant config" via a one-off script.

### 6.2 Environments

- Today: `kjhpmoqybqnjpqfqitqr` is the only Supabase project, dev + prod overlapping.
- Production: 3 environments — `dev` / `staging` / `production`, each its own Supabase project, VAPI org, ANTHROPIC quota.

### 6.3 Database

- [ ] Move to Supabase Pro at minimum; Team plan for compliance features.
- [ ] PgBouncer / connection pooling explicitly configured for serverless edge load.
- [ ] Materialized views for the cockpit-feed query (today it's 3 round-trips for the join).
- [ ] Partitioning on `calls`, `turns`, `triage_decisions` by month at scale.
- [ ] Async-replicate audit tables to an immutable WORM bucket (S3 Object Lock) for litigation hold.

### 6.4 Logging + retention

- Today: `dispatch_webhook_logs` retains 14 days (audit fix), `ops_incidents` 180 days resolved-only.
- Production:
  - DPDP-compliant retention: PHI for 36 months post-consult or per consent, audit logs for 10 years (ABDM HDM ¶12), redacted operational logs for 90 days.
  - Per-table retention metadata + `purge_expired_rows()` extended to honor it (today it's a single function; refactor to a per-table policy + `legal_hold` exclusion that already exists).

### 6.5 Cost governance

- [ ] Per-edge-function budget alert in Supabase.
- [ ] Anthropic spend cap with auto-throttle.
- [ ] Sarvam quota monitoring with alert at 80% consumption.
- [ ] Monthly finance report — per-clinic, per-RMP, per-encounter unit economics. The audit's D6 honest restatement of cost-analysis is the baseline; this becomes a dashboard.

---

## 7. Operations

### 7.1 Customer support

- [ ] 12×6 multi-language support team (Hindi + English + 1–3 regional) for clinic admins.
- [ ] Patient-side: WhatsApp + IVR for help. Tier-1 + escalation to medical staff.
- [ ] Ticketing system (Freshdesk / Zendesk) integrated with the `ops_incidents` table.
- [ ] Knowledge base + training videos in 4+ languages.

### 7.2 Training

- [ ] **RMP onboarding** — 1 week, certificate of completion required to start.
- [ ] **ASHA training** — 2-day in-person + 1-day refresher quarterly.
- [ ] **Clinic admin training** — 4-hour video course.
- [ ] **Patient education** — pamphlets + WhatsApp explainer videos in regional languages.

### 7.3 On-call

- [ ] Engineering on-call: 1-week rotation, 4 engineers minimum. SEV-1 = patient-harm-imminent.
- [ ] Clinical on-call: 1 RMP available for "Vaani is stuck on a real emergency" escalation.
- [ ] Legal on-call: counsel reachable within 24h for breach / inquiry / subpoena.

### 7.4 Contracts & vendors

- [ ] Quarterly vendor review: VAPI, Anthropic, Sarvam, Deepgram, ElevenLabs, Exotel, Gupshup, Supabase. Renew DPAs, audit SLAs.
- [ ] Dual-source critical components: STT (Sarvam + Deepgram), TTS (Sarvam + ElevenLabs), LLM (Bedrock + direct Anthropic), telephony (Exotel + Twilio).

---

## 8. Business / Commercial

Out of engineering scope but listed because it gates the rest:

- Pricing model (per-call / per-RMP-month / per-clinic-month / per-patient).
- B2B sales motion (PHCs, hospital chains, state governments, insurance providers).
- B2B2C (sell into clinics, clinics use it on patients).
- D2C (sell to patients directly — significantly higher regulatory burden).
- Pilot customers: 3 PHCs + 1 state government tender in Phase 1.
- Revenue targets: ₹50 L MRR by month 12 to justify the production investment.

---

## Phasing (honest)

### Phase 1 — Months 1–3 · "Legal-ready"

- Entity setup
- DPO + Medical Director appointed
- DPIA written
- DPAs with every vendor signed
- ABDM Sandbox → M2 milestone work
- Custom-LLM proxy flipped to live, Sarvam STT/TTS swapped in
- Auth replaced with real ABHA-OTP + ABDM HPR OAuth
- RLS hardened, pentest scheduled

### Phase 2 — Months 3–6 · "Clinically-validated"

- Clinical advisory board operational
- 500-case eval set built + CI gate live
- IEC-approved validation study running
- RMP panel recruited + trained
- Real cockpit polish: search, filters, multi-tenant switch, shift handoff
- Patient PWA in beta
- Sentry + tracing + on-call rotation live

### Phase 3 — Months 6–9 · "Beta"

- 3 pilot PHCs running real traffic
- 1,000-call corpus collected with consent
- Validation study results submitted to peer review
- ABDM M3 milestone in progress
- Adverse event registry running, weekly MD review
- SOC 2 Type II observation period started (if pursuing B2B)

### Phase 4 — Months 9–12 · "GA"

- 10+ tenants, 1,000+ calls/day
- Validation study published or in revision
- Insurance bound
- 24×7 ops + on-call
- Status page live
- DPDP s.10 SDF registration filed if patient count crosses 100k

### Phase 5 — Months 12+ · "Scale"

- Regional language expansion (Bengali, Marathi, Telugu, Kannada, etc.)
- Stage 2 (in-visit transcription) productized for OPD use
- Stage 3 (presumptive screening benchmark) becomes a recurring published study
- Specialty-specific products (Vaani-Peds, Vaani-Mental Health, Vaani-ANC)

---

## What to do RIGHT NOW (this week)

Given today's state — demo-grade with the 9-dim audit closed:

1. **Get the entity + DPO appointment moving in parallel** with engineering. Without these, every clinical conversation past month 3 is legally exposed.
2. **Recruit the Medical Director.** Without one, you cannot write the clinical SOPs needed for production.
3. **Flip the custom-LLM proxy on at least the Hindi assistant** (`deno run eval/enable-custom-llm.ts hi`) and run a 50-call regression on the existing demo content. The audit D1 + D2 work is paid for; using it is free.
4. **Begin Sarvam Saarika + Bulbul integration tests** to replace Deepgram + ElevenLabs on the live voice path. Bridges already exist at `supabase/functions/sarvam-stt-bridge` and `sarvam-tts-bridge`.
5. **Replace the anon-key cockpit-feed pattern with a JWT-authenticated read.** RLS audit immediately follows.
6. **Author the 500-case eval set** with clinical advisors. The 12 we have are insufficient to gate a production CI.
7. **File for ABDM M2 sandbox graduation.** The application alone takes weeks.

---

## What I do NOT recommend right now

- Building real-EMR integrations (eSanjeevani / Practo) before you have a Medical Director — you'll integrate the wrong fields.
- Pursuing SOC 2 Type II before you have paying B2B customers asking for it.
- Building the admin console before you have multiple tenants live.
- Adding regional languages beyond Hindi + Tamil before the validation study reads out.
- Aggressive marketing — IMC Reg 6.1.1 plus a still-incomplete DPIA is a recipe for a regulatory letter.

---

## The audit's open items, mapped here

Every demo-grade audit finding from `docs/audits/2026-06-26-9dim-board-audit.md` is closed or in-flight. The production-grade gap is the next floor up — these aren't audit items, they're foundational. The audit's 4 highest-leverage outstanding items (B1 record, B2 fallback MP4, D5 Tamil, D7 ephemeral JWT) are still open and become part of Phase 1.

---

**Bottom line**: production-grade clinical AI in India is a regulated multi-million-rupee, multi-quarter programme. The engineering work alone is ~50% of the effort; legal + clinical + operations are the other 50% and they have to start *now* to be ready when the engineering is done. Do not ship a single clinical interaction to a non-consented patient until Phase 1 is complete.
