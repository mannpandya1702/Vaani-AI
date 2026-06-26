# Vaani-AI 9-Dimension Board Audit

**Chair: Ishaan | Date: 2026-06-26 | Submission T-2 (Jun 28 06:25 IST) | In-person demo T-15 (Jul 11)**

## 1. The conversation bug — what is killing live calls

**Symptom:** Vaani speaks her firstMessage. The user replies. No `role=user` transcript event ever fires in the browser. The call dies on `silenceTimeoutSeconds=45`.

**Verified root causes, ranked by likelihood. Apply 1.A first, then 1.B, then 1.C — in that order — and re-test after each.**

### 1.A `clientMessages: null` on both Vaani assistants (PRIMARY)
- **Cite:** *aman · clientMessages unset on all 3 assistants*; *arjun · Browser audio routing — Assistant clientMessages is null*; *aman · User transcripts never reach the browser*.
- **Evidence:** Live `GET /assistant/466283fd` and `/assistant/70d9fe0c` both return `clientMessages: null`. `serverMessages` includes `transcript` (so STT runs server-side), but the Web SDK only forwards message types listed in `clientMessages` to `vapi.on('message')`. AshaApp.tsx:62-86 listens for `type:'transcript'` — never arrives. The Tamil assistant has the same null.
- **Fix (do this first, 5 min):**
  ```
  PATCH /assistant/466283fd-a6ed-4652-a960-e486009a85a8
  PATCH /assistant/70d9fe0c-24c8-4597-ab7c-7254e77671be
  body: {"clientMessages":["transcript","conversation-update","status-update","speech-update","tool-calls","tool-calls-result","user-interrupted","model-output","hang"]}
  ```
- Verify by tailing browser console for `[vapi message] transcript role=user`.

### 1.B Deepgram nova-3 `multi` cannot transcribe Tamil; weak on monolingual Hindi
- **Cite:** *aman · Tamil assistant uses Deepgram nova-3 multi, which does not support Tamil*; *arjun · Deepgram nova-3 multi does not support Tamil*.
- **Evidence:** Tamil is NOT in nova-3 multi's supported language set. Tamil user audio yields no `is_final` transcripts → silenceTimeout. Hindi is borderline (recently added); short polite Devanagari utterances (हाँ जी, ठीक है) often never get marked final.
- **Fix:** Hindi → `{model:'nova-2', language:'hi', endpointing:300}`. Tamil → `{model:'nova-2', language:'ta', endpointing:400}` (or route via the existing `sarvam-stt-bridge`). Add `confidenceThreshold:0.25`.

### 1.C MicCheck holds `getUserMedia` open during `vapi.start()`
- **Cite:** *arjun · MicCheck holds a live getUserMedia track*; *devansh · MicCheck holds mic stream open*.
- **Evidence:** `AshaApp.tsx:247-322` — MicCheck retains a live MediaStream + AudioContext + rAF loop in refs, released only on unmount or manual stop. AshaApp.start() at :110-126 invokes `vapi.start()` without stopping MicCheck. On Chrome/Windows + USB headsets and mobile Safari, two concurrent `getUserMedia` consumers on the same default device frequently yields a silent track to the second caller (Daily.co).
- **Fix:** Lift MicCheck's stop into a ref; call it synchronously BEFORE `vapiRef.current.start(...)`. Also remove the no-op `{ startAudioOff: false }` 4th constructor arg — the SDK only reads `audioSource` from that position.

### Secondary contributors (apply if 1.A–1.C don't fully resolve)
- **`smartEndpointingEnabled: true` (boolean)** should be the string `"vapi"` for Indic — *arjun*.
- **Vite self-signed cert regenerates on every cold start** — re-prompts mic permission, sticky-Block risk on demo day — *arjun*.
- **handleCallStarted race** — `call.started` runs via `waitUntil`, transcripts arriving in the first 200-500ms hit `handleTranscript` which silently drops them (`vapi-webhook/index.ts:79-92, 232-234`) — *devansh*. Even with 1.A–1.C fixed, the FIRST user turn can still vanish.

---

## 2. Critical issues (would break demo day)

### Tamil assistant ships the Hindi system prompt verbatim
- **Cite:** *ishaan · Tamil assistant has the Hindi system prompt verbatim*; *kavya · Vaani Tamil system prompt is 100% Hindi*.
- Live VAPI `GET /assistant/70d9fe0c` returns Tamil `firstMessage`, but `model.messages[0]` mandates "Reply in DEVANAGARI script only," uses आप/जी, ships Hindi PCPNDT/MHCA scripts. Tamil demo speaks Hindi after consent.
- **Fix:** Author Tamil system prompt (Kavya+Aanya), drop Hindi PATTERN A/B/C gender-neutral rules (irrelevant in Tamil), translate refusal scripts, PATCH assistant, add a CI drift-check.

### Live caller speech routes to Anthropic US with no PII redaction
- **Cite:** *anand · Live VAPI assistant routes raw caller speech to Anthropic US*; *aman · anthropic-client.ts uses api.anthropic.com (US-east) not Bedrock ap-south-1*.
- VAPI assistants `model.provider='anthropic'`; `redactPII` is only called from triage-score / soap-generate / visit-transcribe — NEVER on the live voice path. Every turn ships to US with no `pii_token_map` token and no `cross_border_transfers` row. Violates DPDP s.16, Anand §3.9, ABDM HDM ¶7.6 on every call.
- **Fix:** Either (a) route VAPI through a custom-LLM Supabase edge function that redacts → calls Bedrock ap-south-1, or (b) before demo, at minimum log every turn to `cross_border_transfers` and document the gap in the Anand memo. Honest relabel of the slide is the day-2 fallback.

### `capture_consent` tool is doubly broken
- **Cite:** *anand · capture_consent will 401 on every invocation* + *capture_consent body schema mismatch*.
- VAPI tool `6d3358e4` has no `server.secret` → 401 on every call. Even if auth were fixed, the handler reads `body.call_id` flat (line 50) but VAPI sends `{message:{toolCallList:[...], call:{id}}}` → 400 `missing_call_id`. DPDP s.6 consent never persists.
- **Fix:** Set `server.secret=$VAPI_WEBHOOK_SECRET` on the tool. Rewrite handler to parse VAPI envelope and respond with `{results:[{toolCallId, result}]}`.

### Slide-1 verbatim disclosure exists nowhere
- **Cite:** *anand · Slide-1 verbatim disclosure text exists NOWHERE in the repo*; *aanya · Slide-1 disclosure missing from ASHA app*.
- Repo grep for "research prototype demonstrating AI-assisted" and "consented volunteers" returns ZERO matches. No slide deck, no `<DisclosureCard>`, Landing.tsx footer is a soft 2-line claim. Anand condition #3 requires it visible AND voiced before the demo call.
- **Fix:** Create `docs/legal-verbatim.md` with the verbatim paragraph; render as a non-dismissible modal on AshaApp pre-call; pre-recorded TTS plays before `vapi.start()`. Block the mic button until acknowledged.

### Volunteer consent form `anand-volunteer-consent-v3.md` does not exist
- **Cite:** *anand · Volunteer caller consent form (Anand v3, bilingual) does not exist*.
- `architecture-change-2026-06-26-real-rmp.md:41` literally TODOs "`scratchpad/anand-volunteer-consent-v3.md` if it exists." It doesn't. No actor can legally consent on demo day.
- **Fix:** Author bilingual form NOW; Anand sign before T-7; make signed copies a hard demo-day gate.

### PCPNDT/MHCA/POCSO refusals never fire live
- **Cite:** *anand · PCPNDT/MHCA/POCSO refusals NEVER run live — only post-call*.
- `checkRefusal()` is invoked only from triage-score (post-call). No call site in vapi-webhook or per-turn handler. CLAUDE.md mandates these are HARDCODED, never LLM. Live a caller saying "मेरे पेट में लड़का है या लड़की?" gets Claude's improv, not the statutory script. PCPNDT s.22 / MHCA s.18 exposure.
- **Fix:** Wire `checkRefusal` into a per-turn VAPI server hook (or custom-LLM proxy) that intercepts pre-LLM and returns verbatim script. Gate live demo behind a `refusal_enforcement=live` flag.

### `mo_only_drug_hints` column does not exist; drug-name leak path is open
- **Cite:** *aanya · mo_only_drug_hints column does not exist*; *aanya · No drug-name scrub on the patient-facing Plan before Bulbul TTS*.
- The soap-generate insert never persists `mo_only_drug_hints` (column missing in schema). cockpit-feed aliases `mo_only_drug_hints:original_text` (full JSON blob). `vaani-signoff/index.ts:146-149` reads `soap.plan` straight to TTS with no drug regex. One Claude hallucination of "Paracetamol" or one MO edit → spoken to the caller. Anand red-line #1 broken.
- **Fix:** Add migration `alter table soap_notes add column mo_only_drug_hints text[]`; persist; render in MO panel; add a drug-denylist scrubber in `_shared/drug-scrub.ts` invoked in vaani-signoff and as a DB trigger.

### VAPI cost claim assumes prompt caching that doesn't exist on managed provider
- **Cite:** *aman · System prompt is ~6,000 tokens with no prompt-cache marker*; *vikram · gross-margin story rests on an unmeasured ≥85% cache hit-rate*.
- VAPI's anthropic provider does not pass `cache_control`. `cost-analysis.md` ₹6.20/consult assumes ≥85% cache reads. Unreachable as configured.
- **Fix:** Either move to custom-LLM proxy with cache_control, or restate unit economics honestly. Persist `cache_read_input_tokens` in `call_costs` for measurement.

---

## 3. High-severity issues

- **Submission video VO quotes 6.7s p95 and "75% band match"; eval/reports/2026-06-25.md actually shows p95=31.7s and band=100%.** Attached report is stale (06-24). Judges re-running the harness shown on screen will catch the contradiction in 30s. (*vikram · VO cites eval numbers that contradict the latest report*) — **Re-record VO with verbatim 06-25 numbers; attach 06-25 report.**
- **Script says "AI shadow diagnosis with differential"; Anand red-line bans "diagnosis" in public material (NMC Act 2019 / IMC Reg 6.1.1).** (*vikram · Stage 3 banner*) — Rename to "AI-assisted presumptive screening." Anand sign-off before recording.
- **Eval red-flag recall 93.8% < 98% target. Case_004 (active SI) emits no Tele-MANAS 14416. Case_009 emits forbidden `108` on AMBER fever. Case_006 misses respiratory co-flag.** (*aanya · forceRedBand recommended_action hardcoded English, omits 14416*; *aanya · forceRedBand presumptive_label = raw category breaks enum*) — Hardcode deterministic post-processors: prepend `Tele-MANAS 14416` when `mental_health` in categories; gate `108` to band=RED only; add category→label map; co-flag respiratory on peds fast-breathing phrases.
- **`forceRedBand` writes English action in every language and uses raw category as `presumptive_label`.** (`triage-score/index.ts:432, 438`) — branch on category + patient.preferred_language; map category→ICD-shaped label.
- **Hindi `firstMessage` omits AI / not-doctor / no-treatment / notes-for-doctor.** (*aanya, aman, anand, kavya all flag this*) — Hardcode into firstMessage; remove dependence on Turn-1 LLM disclosure.
- **MHCA refusal script uses feminine `रही हूँ` ("जोड़ रही हूँ") and frames 14416 as conditional ("ज़रूरत हो तो").** Violates gender-neutral rule AND MHCA s.18 immediacy. Also two divergent verbatim scripts exist (refusal-scripts.ts vs system prompt). (*anand, aanya, kavya*) — Rewrite to plural-formal हम, lead with `14416 अभी डायल कीजिए`, lock to single source.
- **vaani-signoff plays `डॉक्टर साहब ने देख लिया है` in demo with no human RMP review.** Anand condition #6 ("no 'approved by' claims"). (*aanya · soulMessage played to patient in demo*) — Add `DEMO_MODE` branch.
- **Footer: "Decisions reviewed by the named RMP" in demo.** False. (*aanya · src/pages/AshaApp.tsx:234*) — Replace under DEMO_MODE flag.
- **No RMP name + MCI Reg # in callback (`vaani-signoff/index.ts:35-50,146-149`).** TPG 2020 ¶3.5 violation. `RMP_NAME`, `RMP_MCI_REG`, `RMP_PHONE_E164` are absent from `.env.local` and `.env.example`. (*anand · TPG 3.5 RMP gap*) — Block submission until vars set.
- **`Landing.tsx:64` claims "ABDM Sandbox certified"** — CLAUDE.md says Sandbox-only, M2/M3 roadmap. (*priya, anand*) — Change to "Sandbox integration in progress."
- **Toast `'Patient called back: डॉक्टर साहब ने देख लिया है'` is hardcoded Hindi for Tamil patients too** (`Cockpit.tsx:369`). (*priya*) — Branch on lang or use `body.signoff.message`.
- **`call_dispatch_queue` ships ZERO 5/24h and 14/7d enforcement.** CLAUDE.md mandates retention of these guards. TCCCPR exposure. (*devansh*) — Add BEFORE INSERT trigger.
- **`consents.patient_id ON DELETE CASCADE`** — one patient hard-delete wipes DPDP s.6 consent chain. (*devansh*) — Change to `ON DELETE RESTRICT`; use logical `purged_at`.
- **`purge_expired_rows()` will DELETE from `pocso_reports`, `refusal_log`, `consents`, `cross_border_transfers`** because the SECURITY DEFINER bypasses RLS. POCSO s.19 + DPDP s.8(7) evidence chain destructible by a default cron. (*devansh*) — Exclude anti-tamper set; add `legal_hold` column.
- **`vapi-webhook` logs raw transcript PII to `dispatch_webhook_logs`.** (*devansh*) — Run through pii-redactor before insert; add 14-day retention.
- **EOC idempotency row written BEFORE the claim** — failures permanently poison retries. (*aman · vapi-webhook/index.ts:167-209*) — Insert idempotency key only after successful claim.
- **status-update events re-run handleCallStarted → clobber EOC's `outcome='completed'` back to `in_progress`.** (*aman*) — Route only `call.started` to handleCallStarted.
- **`/cockpit` and `/asha` ungated public routes** (App.tsx:29-30). (*priya*) — Wrap in ProtectedRoute or relabel as demo entry.
- **Browser ships `VITE_VAPI_PUBLIC_KEY` with no ephemeral session-token swap.** Anyone can dial Vaani on our org. (*vikram*) — Mint scoped JWT via edge function before any unit-economics deck.
- **PCPNDT refusal_log insert violates `chk_pcpndt_complete`** — every PCPNDT row fails 23514. (*anand · supabase/functions/triage-score/index.ts:346-353*) — Populate audio_segment_url/hash, or defer constraint.
- **`escalate_to_doctor` enum is missing `peds_safeguarding`, `audio_unclear`, `peds`, `trauma_major`, `sepsis`, `anaphylaxis`** — system prompt instructs all of them. POCSO escalation silently no-ops. (*kavya*) — Extend enum, redeploy tool.
- **`capture_consent` description tells the model to fire on first affirmative — skips the not-a-doctor disclosure.** (*kavya*) — Rewrite description to require SECOND affirmative after Turn-1 disclosure.
- **`escalate_to_doctor` filler says "डॉक्टर साहब को जोड़ रही हूँ"** — false promise (no transfer wired) AND gendered. (*kavya*) — Replace with hold-line.
- **`data_processing` consent silently bundled with `screening_call` consent from one `haan`** (consent-capture/index.ts:129-143). DPDP s.6 specificity violation. (*anand*) — Enumerate purposes in notice or call twice.
- **POCSO check skipped when `age_years` is null** — minor-disclosure risk. (*anand*) — Invert gate: fire on null OR <18.
- **MASTER-PLAN-v2-LOCKED.md and 5 board-review charters (aanya, aman, vikram, priya, anand) are missing.** Anand 7 conditions and the demo frame-by-frame live only in CLAUDE.md. (*ishaan*) — Recreate before T-5.
- **`.env.example` is missing every variable touched in today's fight** (VITE_VAPI_*, RMP_*, VAPI_WEBHOOK_SECRET). New dev cannot run `npm run dev` to a working demo. (*ishaan*) — Update file.
- **No fallback MP4 anywhere in repo.** Ishaan DoD #10 RED. (*ishaan*) — Record clean 4:30 Hindi happy-path TODAY after STT fix; commit to `demos/`.
- **`@vitejs/plugin-basic-ssl@2.0.0` peer-requires vite ^6; repo pins ^5.4.19.** `npm ci` will error on CI/Vercel. (*devansh*) — Downgrade to `^1.2.0`.
- **`.env.local` plaintext on disk holds `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `PII_REDACTION_SEED`, `WEBHOOK_MASTER_KEY`.** (*devansh*) — Rotate post-demo; move to sealed store.
- **`qualifierPresent()` runs over the ENTIRE multi-turn transcript** — earlier-turn qualifier mention triggers later-turn RED. (*devansh · red-flag-check/index.ts:241-251*) — Window-bound the qualifier search to same turn.
- **No React `ErrorBoundary` anywhere.** Any render throw → blank white stage. (*priya*) — Wrap top-level routes.
- **Mobile viewport disables pinch-zoom** (`maximum-scale=1.0, user-scalable=no`) — WCAG 1.4.4 violation. (*priya*) — Remove restrictions.
- **CLAUDE.md voice pipeline diagram is the obsolete Sarvam/Exotel stack** (lines 77-104) — contradicts the actual VAPI-web + Deepgram + ElevenLabs path. (*ishaan*) — Rewrite §Architecture.
- **CockpitRow type omits `mo_only_drug_hints`; MO signs blind to drug reasoning.** (*priya*) — Add field, render amber MO-only panel.
- **Stale "Drafted by Manorama" string survives in Cockpit (`Cockpit.tsx:441`)** after architecture pivot. (*ishaan*) — Replace and grep-purge "Manorama".

---

## 4. Medium-severity issues

| Area | Issue | Fix |
|---|---|---|
| Refusal scripts | feminine `रही हूँ` in MHCA + drug-Rx scripts | Plural-formal हम / passive |
| eval coverage | Zero Tamil cases; 12/12 are Hindi | Add 4 Tamil cases mirroring 001/004/006/012 |
| eval | Latency p95 31.7s (vs 4s harness target) | Cap maxTokens; add per-stage logging; gate >6s per case |
| eval | 0 cases for TB/DOTS/ANC/POCSO/neonatal | Expand to 30 cases tagged by program |
| Tamil mental_health | Only 1 SI phrase seeded | Add migration with 6-8 Tamil SI idioms |
| `forceRedBand` | mhca peds (child SI) → missing Childline 1098 | Branch on age<18 |
| Tamil neuro | `மயக்கம்` double-mapped as neuro RED + dizziness | Replace with `சுயநினைவின்றி` or add qualifier |
| AshaApp | No mute/local-mic level during in-call | Add VU + mute toggle |
| AshaApp | Language toggle hidden on 'ended' screen | Render above New-call CTA |
| AshaApp | Assistant UUID printed in header | Replace with human label |
| AshaApp | 'Call ended' screen identical for silenceTimeout and success | Read endedReason, branch UI |
| AshaApp | Missing aria-labels / aria-live | Add WCAG attrs |
| Cockpit | RED card pulse keeps pulsing after sign (opacity-70 only) | Emerald glow on signed |
| Cockpit | DemoDisclosureChip uses `title=` only (no touch tooltip) | Radix Tooltip |
| Cockpit | SOAP renders raw markdown chars | react-markdown + rehype-sanitize |
| Cockpit | Polling uses anon key with no tenant scoping | Switch to user JWT; enforce in cockpit-feed |
| Cockpit | SOAP modal `pending…` has no timeout/retry | Elapsed timer + retry button |
| Cockpit | Bottom nav tabs are "coming post-demo" placeholders | Render minimal real data |
| Cockpit | DEMO chip not adjacent to Approve & Sign | Add in footer |
| Landing | CTA hierarchy flat (3 equal buttons) | Promote single primary |
| Landing | Hindi hero text-xl, no leading override (matra clipping) | leading-relaxed |
| Landing | Brand mark text-only `vaani`, no Devanagari | Pair with वाणी |
| process-call-records | Fire-and-forget fetch, no retry/DLQ | waitUntil + queue table + cron retry |
| process-call-records | No precondition on triage_decisions before soap-generate | select-check; return partial:true on soap fail |
| anthropic phone regex | Misses Indian landlines (011-xxxx) | Broaden regex |
| pii-redactor | `'anand'` in LOCATION denylist; cities tokenized | Labeled-token scheme `[CITY:Mumbai]` |
| pii-redactor | Session token time-based + default seed | crypto.getRandomValues; fail-loud on missing seed |
| pii-redactor | Aadhaar/ABHA regex no Verhoeff check | Validate checksum before tokenizing |
| pii-redactor | Throw on persist failure but no ops_incidents row | Wrap with `.catch` insert |
| vaani-signoff | `dispatched_at` set even when status='failed' | Gate on ttsError |
| vaani-signoff | Failed-prior retry collides with unique idempotency_key | UPDATE failed row in place |
| vaani-signoff | `trimPlan` mid-word + ellipsis on Tamil/long plans | Break on whitespace, drop ellipsis |
| vaani-signoff | TOCTOU race on idempotency check → 500 on double-click | Handle 23505 as already_dispatched |
| visit-transcribe | unbounded audio_b64 → OOM | Cap 10MB, force audio_url |
| visit-transcribe | speaker 0 hardcoded DOCTOR | LLM-classify speakers |
| soap-generate | `patient_callback_eta_min` requested from Claude, never persisted | Add column; render in Cockpit; inject into SOUL |
| soap-generate | `vitals_source` hardcoded NOT_AVAILABLE | Add vitals object to schema |
| soap-generate | No `safety_net` / return-precautions field | Add column; append to callback |
| soap-generate | toolUses[0]?.input default to AMBER row on empty | Return 502 like soap-generate does |
| qualifier-gate view | clinical_synonyms forces `requires_qualifier='{}'` | Inherit from red_flag_phrases |
| qualifier-gate backfill | "wheezing" row never seeded — UPDATE no-op | row_count assertion |
| call_costs | No cache_read/create columns | Extend schema |
| triage-score | No unique index on triage_decisions.call_id | Add unique index + select short-circuit |
| Sarvam-M failure path | Silent swallow, no `red_flag_events` | Insert `llm_error` audit row |
| Cockpit | URL.createObjectURL never revoked | Track & revoke |
| Cockpit | RED animate-pulse no prefers-reduced-motion | motion-safe: prefix |
| AshaApp | `'ending'` state never times out if call-end never fires | 5s safety timer |
| AshaApp | Vapi listener leak on Strict-Mode double-mount | removeAllListeners on cleanup |
| Cockpit | SoapReviewDialog hooks before early return; soulMessage doesn't reset | useEffect reset on open |
| Vaani Hindi prompt | `रोको` (तू) in withdrawal cue while prompt forbids तू | Change to `रुकिए / बंद कीजिए` |
| Manorama | nova-2 hi while Vaani is nova-3 multi (or per fix 1.B nova-2 hi/ta) | Align after STT decision |
| Manorama | English-trained `Matilda` voice on Devanagari | Switch to Hindi-native voice |
| Eval | only 12 cases vs Ishaan ≥20 floor | Add 8 cases |
| firstMessage Tamil | Anand disclosure missing (same as Hindi) | Hardcode 4 claims |
| Watchdog | No 12s "no user transcript yet" detector | Watchdog + fallback assistant swap |
| WebSocket | No reconnection UX on Daily WSS drop | Reconnecting chip + auto-retry |
| Manorama assistant | Still wired (assistant alive, env var set) post-removal | Disable or document |
| Disclosure | "ABDM Sandbox certified" on Landing | "Integration in progress" |
| Cockpit cost | call_costs no cache token columns | Persist raw |

---

## 5. What is solid

Subsystems the audit confirms are working:
- **vapi-webhook signature verification** (`_shared/vapi-auth.ts` with constant-time compare) and idempotency-key conditional claim primitive are well-designed (even if the row-ordering is wrong).
- **anthropic-client.ts cache_control discipline** on triage-score / soap-generate / visit-transcribe — they DO mark `ephemeral` cache; the gap is VAPI's managed provider, not these direct paths.
- **`soap-generate`'s tool-forced JSON** (`emit_soap`) and 502 guard on missing tool_use is the correct pattern (triage-score should copy it).
- **Red-flag phrase library** (Devanagari migration 007) is a real proprietary clinical-vernacular asset Vikram should brand as a moat.
- **PII redactor token-map persistence + cross-border audit log skeleton** exist and work for the post-call paths (the failure is non-coverage of the live voice path).
- **Cockpit RED-card pulse, queue, SOAP review modal, swipe-sign UX** — the visual loop works end-to-end on seed data.
- **vaani-signoff in-band audio playback** is reliable for demo; just needs a drug-scrub layer and demo-mode language.
- **TanStack Query + 3s polling on cockpit-feed** is solid for the queue refresh pattern.
- **Eval harness** runs, parses, scores 12 cases — the infrastructure to fix the failures is in place.
- **Devansh & Arjun board-review charters** are the only ones present and well-structured; their tooling discipline (assistant config snapshots in `scripts/`) is the right pattern to adopt for the missing 5.

---

## 6. Demo-day risk register (Top 5)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Live call still silent** despite 1.A-C fix (untested combination on stage Wi-Fi + venue mic) | High | Show-stopper | Pre-recorded 4:30 happy-path MP4 in `demos/`, F-hotkey overlay, USB + phone copies. Dress rehearsal T-1. |
| 2 | **Tamil demo speaks Hindi** because system prompt isn't translated | Certain if Tamil shown | Embarrassing | Run only Hindi on stage; defer Tamil to deck slide showing roadmap. |
| 3 | **Anand veto on PII-to-US live path** if anyone runs `grep api.anthropic.com` during judging | Medium | Disqualification risk | Either route through Bedrock ap-south-1 proxy by T-2, or pre-disclose openly in deck + take the regulatory question head-on. |
| 4 | **Judge spots eval contradiction** between video VO ("p95 6.7s, band 75%") and attached 06-25 report (p95 31.7s, band 100%) | High | Credibility hit | Re-record evals VO with verbatim 06-25 numbers; attach 06-25 report. |
| 5 | **`/cockpit` and `/asha` open to anyone** — scraper or judge clicks straight to WIP UI | Medium | Reveals raw infra IDs, anon-key fetch, "Coming post-demo" placeholders | ProtectedRoute wrap; replace placeholder tabs with minimal real data; hide assistant UUIDs. |

---

## 7. What was claimed fixed this session but might still be broken

- **"Force mic-on" fix (commit 1d016bb).** `{ startAudioOff: false }` is passed as the 4th constructor arg but `@vapi-ai/web` SDK only destructures `audioSource` from that position — `startAudioOff` is never read. The "force-mic-on" is dead code. (*devansh · src/pages/AshaApp.tsx:31-36*) Still relying on this for the IMMEDIATE FIRE is unsafe.
- **"STT switched to nova-3 multi" (commit ee38a0a).** This commit is the LIKELY ROOT CAUSE of Tamil's silent failure and may also explain Hindi short-utterance drops. Eval report 06-25 predates the patch; no re-run exists. The "improvement" claim is unvalidated and demonstrably regressive on Tamil. Revert per §1.B before celebrating.
- **"Manorama dropped" (commit 35bde6e).** Assistant `ef431343` still alive in VAPI; `VAPI_ASSISTANT_ID_MANORAMA` still in `.env.local`; `Cockpit.tsx:441` still renders "Drafted by Manorama (AI Decision-Support Agent)." Half-removed = worse than not started. Either fully delete OR document as intentional fallback.
- **"transfer_to_duty_mo stripped from toolIds."** Believable for Vaani assistants, but the `escalate_to_doctor` request-start filler still says "डॉक्टर साहब को जोड़ रही हूँ" — patient is told a transfer is happening that doesn't. The downstream-MHCA script makes the same false promise. Strip-the-tool was correct; strip-the-language is incomplete.
- **"vapi-wiring-fix-2026-06-26.md" claim that "Patient/MO talks; VAPI sends `transcript` events to our webhook" is solved.** It's solved for `serverMessages` (webhook) but NOT for `clientMessages` (browser SDK) — exactly the bug currently on fire.
- **Slide-1 disclosure** is referenced as a 30s-of-video deliverable, but no slide deck or component exists in the repo. "Will be added in the video edit" is fragile when there's no source-of-truth text checked in for the editor to copy.

---

**Lead action items for the next 24h:**
1. PATCH both Vaani assistants: `clientMessages` list + `nova-2 hi/ta` STT + `server.secret` + `escalate_to_doctor` enum + `capture_consent` tool secret. (1-2 hrs)
2. Add MicCheck imperative-stop before `vapi.start()`. (30 min)
3. Author `docs/legal-verbatim.md` (Slide-1 + Q&A + volunteer consent v3) + render disclosure modal on AshaApp. (2 hrs)
4. Re-record evals VO with 06-25 numbers; attach 06-25 report. (1 hr)
5. Record `demos/vaani-fallback-hi.mp4`; commit + USB + phone. (1 hr)
6. Hardcode `Tele-MANAS 14416` post-processor in triage-score for `mental_health` category. (30 min)
7. Add migration: `mo_only_drug_hints text[]`, drug-scrub guard in vaani-signoff. (2 hrs)
8. Rename "AI shadow diagnosis" → "AI-assisted presumptive screening" across deck, script, README. (15 min)

If 1–8 land by T-1, the live demo is recoverable. If not, declare pre-recorded by EOD Jun 27 per Ishaan's two-reds rule.