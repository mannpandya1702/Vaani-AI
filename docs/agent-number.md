# Vaani-AI's own number — "the agent number"

The single E.164 phone number that Vaani-AI **owns** and uses for:

1. **Inbound voice** — patients dial this to start a screening
2. **Outbound voice** — the soul-callback dial after RMP signs
3. **SMS sender ID** — for consent confirmation, follow-up reminders, callback notifications
4. **WhatsApp Business** — same channel, richer messaging
5. **Caller-ID on Vaani's outbound dial** — what shows up on the patient's incoming-call screen

The same E.164 number serves all five, but you wire it through different vendor products. This doc is the map.

---

## TL;DR — what to do for the hackathon vs production

**Important:** the VAPI test number is a **US area code**, which contradicts the "for Bharat" pitch on Landing. Use it only if you can't get an Indian number in time — and even then, prefer skipping the number on slide 8 with an honest "1800 reserved" caption instead of putting `+1-415-...` on a service for rural India.

| Need | Submission video (Jun 28) | Live demo Jul 11-12 | Aug pilot |
|------|----------------------------|----------------------|-----------|
| Inbound voice | **Skip — slide 8 shows "1800 reserved · live with Aug Exotel pilot"** *(or Plivo India ₹50/mo if KYC clears in time)* | Web `/asha` only — no PSTN | Exotel toll-free `1800-XXX-XXXX` (~₹500/mo + ₹4/min) |
| Outbound callback | In-cockpit audio playback (already wired) | Same | Exotel API SIP dispatch + DLT voice template |
| SMS | Skip — email magic link already shipped | Same | Msg91 with DLT-registered template (~2w TRAI approval) |
| WhatsApp | Skip | Skip | Gupshup partner + Meta verification (~2w) |
| Caller-ID on outbound | N/A | N/A | Same Exotel toll-free as inbound |

**My recommendation right now:**

1. **Submission video (Jun 28, 36h out):** skip the number entirely. Slide 8 caption: *"Toll-free 1800 reserved · live with the August Exotel pilot."* Honest hackathon scope reads as competence. The Landing banner already shows `1800 ___ ____` as a placeholder until you fill the env var.

2. **Start Exotel KYC TODAY** (Jun 26). 2 days for the virtual number + 1-2 weeks DLT — toll-free should land before Jul 11 if you start now. That gives the live demo a real Indian number to dial in on (still optional — the on-stage demo is web `/asha`).

3. **DO NOT buy a VAPI US test number for the public video.** A US area code on a service marketed "for Bharat" is a credibility hit judges will notice. If you absolutely need a working PSTN number for an internal demo and Exotel hasn't cleared, Plivo India (₹50/mo, ~24h KYC) is the faster Indian alternative.

---

## 1. Inbound voice

### Why NOT the VAPI test number
VAPI's "Buy a number" UI ships US area codes ($1/mo). For an internal team test it's fine — for the public submission video / slide deck / Landing hero on a service marketed *"The voice of health for Bharat"*, it's a credibility hit. Rural Indian patients won't dial a US number, and judges will spot the mismatch.

### Recommended — skip the number for Jun 28
Slide 8 caption: *"Toll-free 1800 reserved · live with the August Exotel pilot."* Landing banner shows `1800 ___ ____` placeholder. The live patent claim is the web → cockpit → callback loop, which has no PSTN dependency.

### Fastest Indian number — Plivo (~24h, ₹50/mo)
If you genuinely need a working dial-in for an internal team demo before Exotel clears:
1. Sign up at https://www.plivo.com/in/ — pick India entity
2. Upload KYC: GST + entity proof + ID → KYC clears in 24-48h
3. Buy a `+91 8X-XXXXXXXX` virtual number — ₹50/mo
4. Configure VAPI as BYO SIP trunk with Plivo SIP credentials
5. Update `.env.local`:
   ```
   AGENT_PHONE_E164=+918XXXXXXXXX
   VITE_AGENT_PHONE_DISPLAY=+91 8X-XXXX-XXXX
   ```

Plivo is cheaper + faster than Exotel for the "just need a number to dial" use case. It does NOT get you SMS or WhatsApp — those still need DLT registration (1-2 weeks). For the hackathon video where you only need to *show* a number being dialled, this is the fastest legit Indian option.

### Production — Exotel India toll-free
Real Indian patients can't comfortably dial a US number for medical screening. Real production needs a `1800-XXX-XXXX` toll-free or a `+91-9XXXX-XXXXX` 10-digit virtual.

Steps:
1. Sign up at https://my.exotel.com/ (Indian KYC + GST + entity proof — 2 days)
2. Buy a toll-free number (~₹500/mo setup + ~₹4/min usage)
3. **DLT registration** at https://www.smartping.live/ for SMS-coupled voice templates (1–2 weeks for TRAI approval — start this NOW if you want production by Aug)
4. Configure SIP trunk in VAPI Dashboard → Phone Numbers → BYO SIP → Exotel credentials
5. Update `.env.local`:
   ```
   EXOTEL_VIRTUAL_NUMBER=+91XXXXXXXXXX
   EXOTEL_DLT_ENTITY_ID=<your-entity-id-from-DLT-portal>
   AGENT_PHONE_E164=<same as EXOTEL_VIRTUAL_NUMBER>
   VITE_AGENT_PHONE_DISPLAY=1800 XXX XXXX
   ```

The Exotel virtual number IS the agent number. Same E.164 used for inbound + outbound + caller-ID.

---

## 2. Outbound voice — the soul callback

### Today
`vaani-signoff` returns the soul-callback audio inline as `audio_b64`. The cockpit plays it in-browser. **No PSTN dial happens.**

For the hackathon demo this is correct — the patent claim is the verbatim "the doctor has seen you" + the warm SOUL voice, NOT the dispatch channel.

### Production
A future `call-dispatcher` edge function will read the `call_dispatch_queue` (which `vaani-signoff` already populates) and dial patients via Exotel:

```
RMP signs → vaani-signoff writes call_dispatch_queue row + scheduled_at=now
  → call-dispatcher cron picks up row
    → Exotel /v1/Accounts/<sid>/Calls/connect.json
      → caller-ID = AGENT_PHONE_E164
      → playback URL = pre-rendered Bulbul WAV from event_metadata.audio_b64
        → patient receives call from Vaani's number
          → on hang-up, Exotel posts to exotel-passthru-webhook
```

DLT-registered voice templates required per TRAI 2018. The verbatim soul-callback message is the one to register.

---

## 3. SMS sender ID

### Hackathon
**Skip.** Replace SMS with the **email magic link** that's already shipped in the Auth page. Email works everywhere, no DLT.

### Production
- **Vendor**: Msg91 (Indian, cheapest), Gupshup (also supports WhatsApp), or AWS SNS India.
- **DLT registration**:
  1. Register your business entity at https://www.smartping.live/
  2. Get an entity ID (~₹5,000 one-time)
  3. Register every SMS template you'll send — OTP, consent, callback notification, reminder. Each template needs explicit variable mapping (e.g. `{otp}`, `{rmp_name}`, `{callback_time}`). Approval: 5–10 days.
  4. Register a **header / sender ID** like `VAANIH` (6 chars).
- Wire into Supabase Phone Auth → Authentication → Phone Provider → Msg91.

Estimated cost: ₹0.18/SMS delivered.

---

## 4. WhatsApp Business

### Hackathon
**Skip.** The cockpit + soul callback play in-browser audio for the demo.

### Production — for follow-up + reminders
- **Vendor**: Gupshup (we already have `gupshup-inbound-webhook` + `gupshup-delivery-webhook`).
- Steps:
  1. Sign up at https://www.gupshup.io/ as a partner.
  2. Provide GST, entity proof, Facebook Business ID → 2-week verification.
  3. Buy a WABA (WhatsApp Business Account) number — same E.164 as Exotel toll-free works, OR a separate number.
  4. **Meta template approval** for every message type (OTP, callback confirmation, reminder, follow-up). ~3 days each, can fail and need rephrasing.
  5. Update `.env.local`:
     ```
     GUPSHUP_API_KEY=...
     GUPSHUP_WABA_NUMBER=+91XXXXXXXXXX  (often same as AGENT_PHONE_E164)
     ```

---

## 5. Caller-ID on outbound

When Vaani dials a patient back via Exotel, the patient sees the caller-ID. Per TRAI, this MUST match the registered entity:

- ✅ Allowed: the Exotel virtual number you bought (= AGENT_PHONE_E164)
- ❌ Not allowed: spoofing a generic 1800 or another business's number

For the hackathon demo: in-cockpit audio playback (current path) has no caller-ID question. Production needs Exotel + DLT.

---

## Specific env vars to add

After today's commits, add to `.env.example` (gitignored, copy to `.env.local`):

```bash
# ─── Vaani's own E.164 phone number ("the agent number") ──
# Used as caller-ID for outbound dial, the SMS sender, the
# patient-facing "your screening number" on every reminder, and
# the dial-in number printed on the deck. Same E.164 works for
# Exotel virtual + Gupshup WABA + Msg91 sender — they all sit on
# the one DLT-registered entity.
AGENT_PHONE_E164=                        # +91XXXXXXXXXX (Exotel virtual)
VITE_AGENT_PHONE_DISPLAY=                # "1800 XXX XXXX" patient-readable

# Hackathon dev fallback — a VAPI test number for the demo VIDEO
# only. Patients in production won't see this.
VAPI_TEST_PHONE_NUMBER=                  # +1XXXXXXXXXX
```

`AGENT_PHONE_E164` is wired into:
- `vaani-signoff` event_metadata for the callback dispatch
- `slack-message-template` / SMS sender ID
- The cockpit "RMP profile" tab footer
- The landing page (display version)

---

## Code that's ready to use the agent number once set

| File / function | Reads | What it does |
|------------------|-------|--------------|
| `supabase/functions/vaani-signoff/index.ts` | `AGENT_PHONE_E164` ✓ | Stamps `event_metadata.caller_id` so future call-dispatcher picks the right caller-ID |
| `src/pages/Landing.tsx` | `VITE_AGENT_PHONE_DISPLAY` ✓ | "Call us" hero banner shows the number (falls back to `1800 ___ ____` placeholder) |
| `src/pages/Cockpit.tsx` (Me tab) | `VITE_AGENT_PHONE_DISPLAY` ✓ | Shows the agent number on the RMP's profile so they know which line patients see |
| `supabase/functions/call-dispatcher` | `AGENT_PHONE_E164` (future) | Sets caller-ID on Exotel outbound dial |
| `supabase/functions/exotel-passthru-webhook` | `EXOTEL_VIRTUAL_NUMBER` (future) | Validates incoming call payload matches our number |
| `docs/submission-video-script.md` | hard-coded number | Slide 8 needs the actual number for the recording |

---

## Hackathon decision — what I'd do RIGHT NOW

1. **DO NOT buy the VAPI US test number** for anything that goes on the public submission video or slide deck. A `+1-XXX` on a "for Bharat" service contradicts the pitch and judges will catch it.
2. **Slide 8 caption:** *"Toll-free 1800 reserved · live with August Exotel pilot."* The Landing hero banner already shows `1800 ___ ____` as a placeholder via `VITE_AGENT_PHONE_DISPLAY`. The live patent claim is the web → cockpit → callback loop — no PSTN dependency for the demo.
3. **Start Exotel KYC TODAY** (2 days for virtual number, 1-2 weeks for DLT). If you start Jun 26, toll-free `1800-XXX-XXXX` should land before the Jul 11-12 in-person demo.
4. **Plivo India is the escape hatch** (₹50/mo, ~24h KYC) ONLY if you need a working dial-in for an internal team test and Exotel hasn't cleared yet. Don't put a Plivo `+91-8X` on the submission video — it still looks ad-hoc; better to skip the number with the honest "1800 reserved" caption.
5. **Wired and ready:** `VITE_AGENT_PHONE_DISPLAY` already feeds Landing hero + Cockpit Me tab. `AGENT_PHONE_E164` already stamps `event_metadata.caller_id` in `vaani-signoff`. Fill the envs the moment your Indian number is live and every surface updates.
