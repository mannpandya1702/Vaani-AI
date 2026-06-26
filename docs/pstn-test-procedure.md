# PSTN test procedure — dial Vaani right now

Use this to test the full inbound PSTN loop with your VAPI number TODAY,
so Jul 11 in-person is just a re-run of something that already worked.

## 1. One-time setup (10 minutes)

### a. VAPI dashboard — bind the number to the Hindi assistant
1. https://dashboard.vapi.ai/phone-numbers → click your new number
2. **Inbound Settings**:
   - Assistant: **Vaani (Hindi)** — id `466283fd-a6ed-4652-a960-e486009a85a8`
   - Server URL: `https://kjhpmoqybqnjpqfqitqr.supabase.co/functions/v1/vapi-webhook`
   - Server Secret: paste the value of `VAPI_WEBHOOK_SECRET` from `.env.local`
3. Save

### b. Local env (`.env.local`)
```bash
VAPI_TEST_PHONE_NUMBER=+15138227440
AGENT_PHONE_E164=+15138227440
VITE_AGENT_PHONE_DISPLAY=+1 513-822-7440
```
Restart `npm run dev` (env requires restart, not just hot-reload).

### c. Supabase secrets (for `vaani-signoff` running in prod)
```bash
supabase secrets set AGENT_PHONE_E164=+1XXXXXXXXXX \
  --project-ref kjhpmoqybqnjpqfqitqr
```

### d. Vercel env (if frontend is deployed)
Add `VITE_AGENT_PHONE_DISPLAY` in Vercel Dashboard → Settings → Environment Variables → Production. Redeploy.

## 2. Pre-flight check

```bash
npm run preflight
```

This runs `eval/pstn-ready.ts` which verifies:
- Hindi assistant has custom-llm / custom-transcriber / custom-voice configured
- `clientMessages` includes `transcript` (else frontend goes silent)
- VAPI phone number is bound to the Hindi assistant
- Server URL points at `vapi-webhook`
- All 9 edge functions reachable
- Env vars set on the box you're running this from

Green = ready to dial. Any red = fix it first.

## 3. The actual test (5 minutes)

### Tab A — open the cockpit
Sign in as the RMP (run `eval/promote-rmp.ts you@example.com rmp` once if you haven't). Open `/cockpit` in a browser. Leave it visible.

### Tab B — VAPI dashboard logs
https://dashboard.vapi.ai/calls — leave open. You'll see your call appear here in real time.

### Step 1 — dial
Call the VAPI number from your phone.

**Expected:**
- Ring picks up in ~2s
- Vaani greets in Hindi: *"नमस्ते, मैं वाणी हूँ — आज मैं आपकी कैसे मदद कर सकती हूँ?"*

### Step 2 — converse
Speak a complaint: *"सीने में दर्द है, साँस लेने में दिक्कत है"* (chest pain + breathing difficulty — should trigger RED).

**Expected:**
- Vaani asks follow-up: onset, severity, associated symptoms
- On red-flag detection, she fires `escalate_to_doctor` and says the hold-line: *"डॉक्टर साहब को सूचना दे दी है, कृपया प्रतीक्षा करें"*
- Hang up

### Step 3 — watch the cockpit
Within ~10s of hangup:

**Expected:**
- New card appears in Tab A's cockpit
- Patient identifier = your phone number (E.164, redacted in display)
- Triage band = **RED**
- Chief complaint pre-populated

### Step 4 — sign the SOAP
Click the card → SoapReviewDialog opens.

**Expected:**
- Subjective / Objective / Assessment / Plan fields auto-populated by Claude Sonnet 4.6
- Drug suggestions (if any) live in the amber **MO-only** panel, NOT in Plan
- Edit Plan if needed → **Approve & Sign**

### Step 5 — soul callback
After signing, the toast bottom-right says *"डॉक्टर साहब ने देख लिया है — playing now"*. Audio plays in-cockpit (Sarvam Bulbul v3, ~6s).

**Expected:**
- Audio is Vaani's voice reading the Plan field verbatim, opened with *"नमस्ते। डॉक्टर साहब ने आपकी रिपोर्ट देख ली है। उनकी सलाह सुनिए — "* and closed with *"आराम कीजिए, हम आपके साथ हैं।"*

If any of those expectations fail: open the VAPI Calls log in Tab B + the
Supabase function logs at https://supabase.com/dashboard/project/kjhpmoqybqnjpqfqitqr/functions/vapi-webhook/logs
and find the row corresponding to your call.

## 4. Known gaps (don't fix tonight)

- **Outbound PSTN dial-out for the soul callback isn't wired.** The
  audio plays in-cockpit only. Production needs `call-dispatcher` edge
  function → Exotel SIP. Doesn't matter for Jul 11 — voice-over the
  demo as "in production, this dials the patient's phone via Exotel."
- **VAPI US area code on the inbound number.** Slide 8 should say
  Exotel `+91 95138-86363` (your real provisioned number) as the
  production line; VAPI US is "sandbox dev environment."
- **`vapi-webhook` resolves PSTN dialler by `customer.number`** — if
  you dial from an Indian phone, the patient row's `phone_e164` will
  be your real number. For the recorded demo, dial from a phone you
  control or use a +1 throwaway.

## 5. After the test passes

Tag this commit so you can revert if anything breaks:
```bash
git tag pstn-ready-2026-06-26 && git push --tags
```

Jul 11 stage run: same procedure, ideally with Exotel `+91 95138-86363`
swapped in via SIP trunk if Exotel KYC + provisioning cleared in time.
If not, fall back to the VAPI number — works identically.
