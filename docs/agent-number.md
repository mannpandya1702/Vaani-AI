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

| Need | Hackathon (NOW) | Production (post-pilot) |
|------|-----------------|-------------------------|
| Inbound voice | **VAPI test number** ($1/month US number) for the demo video — OR skip entirely (the live demo is web `/asha`, no PSTN) | Exotel toll-free `1800-XXX-XXXX` (~₹500/mo setup + ₹4/min usage) |
| Outbound voice / callback | **Skip** — keep the in-cockpit audio playback we already have | Exotel API SIP dispatch + DLT-registered voice template |
| SMS | **Skip for hackathon** — replace with email magic link (already shipped) | Msg91 with DLT-registered template (~2w TRAI approval) |
| WhatsApp | **Skip** | Gupshup partner account + Meta verification (~2w) |
| Caller-ID on outbound | N/A (web only) | Same as Exotel toll-free above |

**My recommendation right now:** purchase a VAPI test number ($1/month) for the demo VIDEO so slide 8 shows "Vaani's number: +1-415-XXX-XXXX" rather than a placeholder. The LIVE demo on stage is the `/asha` web call which doesn't need a number. After the hackathon, buy Exotel toll-free + Msg91 + Gupshup.

---

## 1. Inbound voice

### Hackathon — VAPI test number
VAPI gives you a free test number on a US area code through their dashboard. ~5 min to set up:

1. Open https://dashboard.vapi.ai/ → **Phone Numbers** → **Buy a number**
2. Pick a US area code (cheapest at $1/month)
3. Assign assistant → pick `Vaani (Hindi)`
4. Save

That's it. Calling that number from anywhere in the world reaches Vaani. **Good for the recorded video showing "patient dials +1-XXX, hears Vaani in Hindi."**

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

1. **Buy a VAPI test number** ($1/month, 5 minutes): https://dashboard.vapi.ai/ → Phone Numbers. Use this in the submission video as "patients dial X". Live demo on stage uses `/asha` web.
2. **Skip everything else** until post-hackathon. The submission video shows the number once; the live demo doesn't need it.
3. **In parallel**, start the Exotel toll-free + DLT entity registration NOW so it's ready for the August pilot. Both are slow (1–2 weeks each); you can do them while waiting for hackathon results.

If you want, I can wire `VITE_AGENT_PHONE_DISPLAY` into the Landing hero + footer + Cockpit Me tab right now so the demo video has a clean "1800-XXX-XXXX" surface — even if it's still a placeholder until you buy the number.
