# Phone numbers in Vaani-AI — a complete map

There are **six** places a phone number flows through the system. Each needs different production-readiness work.

## 1. Patient phone — captured from Vaani's perspective

### Today (post-webcall-fix `86fc1a6`)
- **Web call** (browser → VAPI): no phone available. `handleCallStarted` in `vapi-webhook` generates a random anonymous placeholder `+91900XXXXXXXX` and an anonymous patient row labelled `"Web demo caller · <call-id-prefix>"`.
- **PSTN call** (Exotel → VAPI): real phone read from `vapiCall.customer.number`. Patient row keyed by that number — existing patients are reused across visits.

### What you need for production
- **Web app**: if the user signed in via Phone OTP, use that phone for the patient record (committed in this batch — `9e11513` Auth.tsx + Cockpit Patients tab improvements pending).
- **Web app fallback**: if signed in via email-link instead, prompt for phone before the call starts.
- **PSTN**: nothing — Exotel already gives us the right phone.

### Where it's used
- Patient identity (`patients.phone_e164`, the primary lookup key)
- Outbound callback dispatch (`call_dispatch_queue.patient_phone_e164`)
- The cockpit's Patients tab (today shows age/sex/lang only — phone is masked by design)

---

## 2. RMP phone — the on-call doctor

### Today
- Placeholder env var `RMP_PHONE_E164` (currently unset — the prompt + cockpit fall back to `डॉक्टर साहब`).

### Where it's used
- **Slide-8 production diagram**: on a PSTN red-flag, Vaani SIP-transfers to this number so the RMP joins the live call. (Web calls cannot SIP-transfer — that's why our web architecture is cockpit-handoff, not live transfer.)
- **Cockpit "Me" tab**: surfaces the signed-in RMP's name + Reg # (committed today).
- **Audit log**: every signed SOAP includes the RMP's identity for TPG ¶3.5 attestation.

### What you need for production
- Fill `RMP_NAME`, `RMP_MCI_REG`, `RMP_PHONE_E164` for the demo-day doctor in `.env.local` + push as Supabase secrets:
  ```bash
  supabase secrets set RMP_NAME="Dr Aanya Sharma" \
    RMP_MCI_REG="MMC/2018/12345 · HPR-ABDM 7654321890" \
    RMP_PHONE_E164="+919XXXXXXXXX"
  ```
- The `VITE_RMP_NAME` + `VITE_RMP_MCI_REG` browser-side mirrors (Cockpit `Me` tab) need to be added to `.env.local`:
  ```
  VITE_RMP_NAME=Dr Aanya Sharma
  VITE_RMP_MCI_REG=MMC/2018/12345 · HPR-ABDM 7654321890
  ```

### Production-mode SIP transfer (post-pilot)
- Requires Exotel SIP egress + a DLT-scrubbed "transfer reason" voice template (~₹4 per minute).
- For the hackathon demo, the cockpit-handoff path is already complete and the user-facing copy reads "डॉक्टर साहब को तुरंत जानकारी दे रहे हैं" — accurate as the cockpit shows the RED card to the on-call RMP within ~3 seconds.

---

## 3. Auth OTP — phone-based sign-in

### Today
- `supabase.auth.signInWithOtp({ phone })` is wired in the new Auth.tsx (`9e11513`).
- Falls back to Supabase's default SMS provider (Twilio test mode) — works for development on free-tier numbers but **will NOT send SMS to Indian numbers in production**.

### What you need for production
- **Option A (recommended for hackathon)**: leave Phone OTP wired but route users to **Email magic link** as the primary method. Email links work everywhere, no DLT required, free.
- **Option B (production grade)**: wire **Msg91** as the Supabase Auth SMS provider. Requires:
  1. **DLT registration** of the OTP template via your Msg91 dashboard (~₹5,000 one-time + 1–2 weeks for TRAI approval).
  2. **Template variables** for `{otp}` per TRAI rules.
  3. Supabase Dashboard → Authentication → Phone Provider → set to "Msg91" with your auth key + sender ID.
  4. Estimated ₹0.18 per OTP delivered.

### What I'd recommend NOW
- For the hackathon: leave Phone OTP visible in the UI but use Email magic link for actual sign-ins. The auth UI we shipped has the toggle — judges can pick either.
- Note in slide-8 architecture: "Phone-OTP path goes through DLT-registered Msg91 in production."

---

## 4. Caller-ID Vaani uses on PSTN outbound

### Today
- **Web calls**: no PSTN, no caller-ID needed.
- **PSTN inbound through Exotel**: caller-ID is the toll-free number (e.g. `1800-XXX-XXXX`). **Not purchased yet.**

### What you need for production
- **Exotel toll-free purchase**: ~₹500 setup + ₹4/min usage. Configure with VAPI SIP trunk.
- **DLT entity ID** registered for your business: Vaani-AI Pvt Ltd → entity ID → tied to every outbound voice template.
- **Caller-ID compliance**: TRAI requires the caller-ID match the entity. No spoofing.
- **For the hackathon demo**: web-only is fine; the deck slide-8 mentions toll-free as the production path.

---

## 5. Outbound dispatch — Vaani's callback to the patient

### Today
- `vaani-signoff` returns the soul-callback audio inline as `audio_b64`. The cockpit plays it in-browser. **No outbound dial happens.**

### What you need for production
- **PSTN dispatch via Exotel**:
  1. After RMP signs → `vaani-signoff` writes a `call_dispatch_queue` row.
  2. A `call-dispatcher` worker (already exists at `supabase/functions/call-dispatcher`) reads the queue and dials the patient's phone through Exotel.
  3. Exotel plays the pre-generated WAV (`audio_b64` we already have).
  4. On hang-up, Exotel posts the call status back to `exotel-passthru-webhook`.
- **DLT scrubbing**: every outbound voice template must be pre-registered. The soul-callback message ("डॉक्टर साहब ने आपकी रिपोर्ट देख ली है …") needs a registered template.
- **Harassment guard**: `call_dispatch_queue` already enforces 5 calls in 24h + 14 in 7 days (CLAUDE.md mandates this) — verify the trigger fires on production.
- **Patient must have opted in to receiving callbacks** — currently captured via `consents.scope='screening_call'` (Anand v3 form).

### What I'd recommend NOW
- Hackathon: keep the in-cockpit audio playback. It's the same audio that would be dispatched in production; the patent claim is the verbatim "the doctor has seen you" message + the SOUL voice, not the dispatch channel.
- Production: enable when ABDM M3 + DLT registration are in place. Today's `call-dispatcher` function is wired but inert.

---

## 6. Statutory emergency numbers — hardcoded

These are immutable per Indian regulation:

| Number | When | Where it's hardcoded |
|--------|------|----------------------|
| **108** | Any life-threat (ACS, stroke, anaphylaxis, severe trauma, snake bite, eclampsia, severe respiratory) | `triage-score/index.ts` `RED_OPENER` + Vaani Hindi prompt + soul-callback for RED band |
| **14416** | Active suicidal ideation (MHCA s.18) | `_shared/refusal-scripts.ts` MHCA script (v2) + Vaani Hindi prompt |
| **1098** | Under-18 + suicidal ideation (Childline; required to be offered in addition to 14416 for paediatric cases) | `triage-score/index.ts` `CHILDLINE` |
| **112** | Generic emergency (police/fire/ambulance, post-Nirbhaya consolidation) | Not used today; if you mention it in slides, update accordingly |

Numbers are **spoken in words** in the Hindi prompt ("चौदह चार सौ सोलह — 14416") so the TTS reads them as a phone number, not separate digits. Confirmed live on the Sarvam Bulbul path.

---

## 7. Seed / demo phones (codebase-only)

- `eval/seed-demo.ts` generates `+91900xxxxxxxx` random fakes when seeding the four cockpit demo cards.
- `eval/run.ts` does the same per eval case.
- `eval/wire-live-tenant.ts` does not touch phones.

These are intentional placeholders for synthetic test data. Production calls will never use these — they're behind the `__demo_cockpit__` / `__eval_tenant__` tenants.

---

## Summary table

| Layer | Current state | Action you need to take |
|-------|---------------|-------------------------|
| Patient phone (web) | Random placeholder | Add `VITE_RMP_*` to `.env.local`; collect from Auth.session.user.phone when patient signs in via phone OTP |
| Patient phone (PSTN) | Real from Exotel | No action |
| RMP_PHONE_E164 | Empty env var | Fill in your demo doctor's E.164 phone |
| Auth OTP recipient | Supabase default (Twilio test) | Hackathon: use Email magic link. Production: wire Msg91 with DLT-registered template (~2 weeks). |
| Vaani's caller-ID | None (web) / TBD (PSTN) | Hackathon: web-only OK. Production: purchase Exotel toll-free + DLT entity ID. |
| Outbound dispatch | In-cockpit audio playback | Hackathon: leave as-is. Production: enable `call-dispatcher` + DLT-registered voice template. |
| 108 / 14416 / 1098 | Hardcoded, spoken in words | No action — these are immutable |
| Seed / demo phones | Random `+91900*` placeholders | No action — intentional for synthetic data |
