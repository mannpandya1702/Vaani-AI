# PSTN test procedure — dial Vaani right now

Use this to test the full inbound PSTN loop with your VAPI number TODAY,
so Jul 11 in-person is just a re-run of something that already worked.

## Status (2026-06-26 — wired by Claude this session)

| Layer | State |
|-------|-------|
| VAPI number `+15138227440` | ✅ Bought (US area code 513 / Cincinnati) |
| Bound to Hindi assistant `466283fd-a6ed-4652-a960-e486009a85a8` | ✅ Done via VAPI API |
| Webhook server URL | ✅ `https://kjhpmoqybqnjpqfqitqr.supabase.co/functions/v1/vapi-webhook` |
| Webhook server secret | ✅ Synced with `VAPI_WEBHOOK_SECRET` from `.env.local` |
| Assistant model | ✅ custom-llm → `vapi-custom-llm` proxy (PII redaction + Claude prompt cache) |
| Assistant transcriber | Deepgram `flux-general-multi` (your config, not changed) |
| Assistant voice | ElevenLabs `DpnM70iDHNHZ0Mguv6GJ` (your config, not changed) |
| `clientMessages` | ✅ Includes `transcript`, `tool-calls`, `status-update` |
| `serverMessages` | ✅ Includes `end-of-call-report`, `transcript`, `status-update` |
| Supabase secret `AGENT_PHONE_E164` | ✅ Set on `kjhpmoqybqnjpqfqitqr` |
| Edge functions (9 of them) | ✅ All reachable from preflight |
| Container `.env.local` | ✅ Agent number vars appended |

Re-run anytime: `npm run preflight`

## Action items on YOUR machine

### 1. Mirror the agent-number vars to your Windows `.env.local`

Open `.env.local` in your local repo, append at the bottom:

```bash
VAPI_TEST_PHONE_NUMBER=+15138227440
AGENT_PHONE_E164=+15138227440
VITE_AGENT_PHONE_DISPLAY="+1 513-822-7440"
```

Quotes around `VITE_AGENT_PHONE_DISPLAY` matter — the space inside the
value breaks bash/PowerShell sourcing without them.

Restart `npm run dev` (env requires restart, not just hot-reload).

### 2. (Only if frontend is deployed to Vercel)

Vercel Dashboard → Project Settings → Environment Variables → Production:
- `VITE_AGENT_PHONE_DISPLAY` = `+1 513-822-7440`

Redeploy.

## The actual test (5 minutes)

### Tab A — open the cockpit
Sign in as the RMP (if you haven't been promoted yet, run
`deno run --allow-env --allow-net eval/promote-rmp.ts you@example.com rmp`
once). Open `/cockpit`. Leave visible.

### Tab B — VAPI dashboard logs
https://dashboard.vapi.ai/calls — leave open. You'll see your call appear here in real time.

### Step 1 — dial
Call `+1 513-822-7440` from your phone.

**Expected:**
- Ring picks up in ~2s
- Vaani greets in Hindi: *"नमस्ते जी, मैं वाणी हूँ, डॉक्टर साहब की क्लिनिक से…"* (full first-message)

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
- Subjective / Objective / Assessment / Plan auto-populated by Claude Sonnet 4.6
- Drug suggestions (if any) live in the amber **MO-only** panel, NOT in Plan
- Edit Plan if needed → **Approve & Sign**

### Step 5 — soul callback
After signing, toast says *"डॉक्टर साहब ने देख लिया है — playing now"*. Audio plays in-cockpit (Sarvam Bulbul v3, ~6s).

**Expected:**
- Audio is Vaani's voice reading the Plan field verbatim, opened with *"नमस्ते। डॉक्टर साहब ने आपकी रिपोर्ट देख ली है। उनकी सलाह सुनिए — "* and closed with *"आराम कीजिए, हम आपके साथ हैं।"*

If any expectation fails: open VAPI Calls log in Tab B + Supabase
function logs at
https://supabase.com/dashboard/project/kjhpmoqybqnjpqfqitqr/functions/vapi-webhook/logs
and find the row corresponding to your call.

## Known gaps (don't fix tonight)

- **Outbound PSTN dial-out for the soul callback isn't wired.** Audio plays in-cockpit only. Production needs `call-dispatcher` edge function → Exotel SIP. Doesn't matter for Jul 11 — voice-over the demo as *"in production, this dials the patient's phone via Exotel."*
- **VAPI US area code on the inbound number.** Slide 8 should say Exotel `+91 95138-86363` (your real provisioned Indian number) as the production line; VAPI US is "sandbox dev environment."
- **`vapi-webhook` resolves PSTN dialler by `customer.number`** — if you dial from an Indian phone, the patient row's `phone_e164` will be your real number. For the recorded demo, dial from a phone you control or use a +1 throwaway.

## After the test passes

Tag this commit so you can revert if anything breaks:
```bash
git tag pstn-ready-2026-06-26 && git push --tags
```

Jul 11 stage run: same procedure, ideally with Exotel `+91 95138-86363`
swapped in via SIP trunk if Exotel KYC + provisioning cleared in time.
If not, fall back to the VAPI number — works identically.
