# VAPI wiring fix — 2026-06-26

After 72 hours of "cockpit empty after every real call", we drove the
ASHA app with a headless Chromium and captured the actual failure
modes. Four independent breakages, all fixed today.

## Symptoms

- Mic button on `/asha` hangs on **"Connecting…"** for ~13 s, then bails
  with `[vapi] start-method-error`.
- Cockpit at `/cockpit` stays empty after every real call attempt.
- Browser console: `POST https://api.vapi.ai/call/web :: ERR_CONNECTION_CLOSED`.

## Root causes

| # | Issue | What was wrong | Fix |
|---|-------|----------------|-----|
| 1 | Insecure origin | Browsers refuse `getUserMedia()` on `http://10.5.0.2:8080`. The VAPI web SDK can't acquire the mic. | `@vitejs/plugin-basic-ssl` + `server.https=true` in `vite.config.ts`. |
| 2 | `host: '::'` fails on IPv4-only LANs | Vite couldn't bind in restricted networks. | Switched to `host: true`. |
| 3 | No tenant mapped to VAPI `orgId` | `vapi-webhook` falls through to `ops_incidents` and bails — patient/call/triage rows never get written. | `eval/wire-live-tenant.ts` upserts `Vaani-AI Demo PHC` with the org's id. |
| 4 | `server.secret` missing on VAPI assistants | Webhook deliveries had no `x-vapi-secret` → `verifyVapiWebhook` returned 401. | PATCH'd both assistants via management API. |
| 5 | `VITE_VAPI_PUBLIC_KEY` was actually the **private** key | `/call/web` requires the public key. Private has full management permissions which is why management calls worked — masking the issue. | Replaced with the real public key. `eval/vapi-key-check.ts` now catches the swap. |
| 6 | Hindi assistant's `model` was silently flipped to `openai/gpt-5.4` (an invalid model id) | Likely a stale fetch round-trip overwrote the field. Tamil + Manorama assistants stayed on Claude. | Restored to `anthropic / claude-sonnet-4-6`. |
| 7 | `transfer_to_duty_mo` tool's destination = `assistantName: "Manorama (AI MO Agent)"` blocks web-call setup | VAPI's public-key context can't resolve the destination by name for web calls. The whole `/call/web` request fails before the call even starts. | Removed `transfer_to_duty_mo` from the Hindi web assistant's `model.toolIds`. The MO handoff for the web demo is now via the cockpit (which is more accurate to the Stage 5 narrative anyway). |

## Verification

```
$ deno run --allow-env --allow-net eval/vapi-key-check.ts
Probe 1: PRIVATE key → list assistant
  ✓ 200 — assistant name: Vaani (Hindi)
Probe 2: PUBLIC key  → POST /call/web
  ✓ 201 — webCallUrl: https://vapi.daily.co/…

🎉 Both keys are correctly wired. Frontend mic button will work.
```

End-to-end test of the webhook → tenant lookup → patient upsert → call
row creation also passes (smoke-test in commit log).

## Demo flow (after this fix)

1. User opens `https://localhost:8080/asha` (accept self-signed cert once).
2. Click mic → browser prompts for mic permission → Allow.
3. Vaani speaks her firstMessage (Claude Sonnet 4.6 + ElevenLabs Turbo v2.5).
4. Patient/MO talks; VAPI sends `transcript` events to our webhook.
5. End the call. VAPI fires `end-of-call-report`.
6. `vapi-webhook` → `process-call-records` → `triage-score` → `soap-generate`.
7. `/cockpit` (polling every 3s) shows the live triage card within ~10 s.
8. RMP clicks **Approve & Sign** → `vaani-signoff` fires → soul callback plays in-browser.

## How to re-attach the transfer tool (future)

If we whitelist the Hindi assistant's public key for cross-assistant
transfers OR move web demo to phone-call mode, re-add:

```bash
curl -X PATCH "https://api.vapi.ai/assistant/$VITE_VAPI_ASSISTANT_ID_HI" \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":{"toolIds":["d812f7da-25c9-401f-848a-d016f07f3b58","6d3358e4-bcb4-4c90-ab57-fde11e16b422","ac2981a9-e5d3-4f44-aedb-e01b764dfcb5"]}}'
```

The tool itself (`ac2981a9-…`) is untouched.
