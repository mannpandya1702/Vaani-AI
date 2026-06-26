# Architecture change — 2026-06-26 — real RMP, no AI MO Agent

## The change in one line

The "Manorama (AI MO Agent)" layer is **removed** from Vaani-AI. The handoff target — for both the demo and the production architecture — is now always a **real, named, SMC-verified, HPR-linked Registered Medical Practitioner**.

## Why

1. **Simpler legal stance.** No need for Anand's CONDITIONAL GO + 7 conditions on the AI MO Agent. The DPDP / TPG ¶3.5 / NMC Act 2019 risk surface shrinks substantially when no AI is making clinical decisions.
2. **Cleaner demo narrative.** Judges no longer have to track "Vaani (AI) → Manorama (AI) → human RMP (production)". It is now "Vaani (AI screening) → human RMP". One AI, one human, one handoff.
3. **Matches what we'd build anyway.** Production was always going to be an actual human RMP at the other end; we are just collapsing the demo's middle layer.

## What flows now

| Path | What happens |
|------|--------------|
| Web demo (ASHA app, on stage) | Vaani screens the caller. On a red-flag, she calls `escalate_to_doctor(category=…)` and speaks a 14-word hold-line. The cockpit shows a pulsing RED card to the real RMP on-call. The RMP reviews + signs. The patient gets the soul callback. **No mid-call AI-to-AI transfer.** |
| Production (Exotel PSTN) | Same Vaani screening. `escalate_to_doctor` ALSO dials `RMP_PHONE_E164` via SIP transfer, so the RMP joins the live call within seconds. Slide 8 captures this for production-shippable claims. |

## What was removed

- **Vaani's `transfer_to_duty_mo` tool** (id `ac2981a9-…`) is no longer in either Hindi or Tamil assistant's `model.toolIds`. The tool record itself is retained (untouched) so it can be re-attached if we ever resurrect the AI MO Agent for a different use case.
- **Section 6 (EMERGENCY ESCALATION)** of both Vaani Hindi and Tamil system prompts now describes the cockpit handoff and a `डॉक्टर साहब` placeholder name. Manorama / मनोरमा / `transfer_to_duty_mo` tokens are gone from the live prompts.
- **Section 7 (MHCA)** rewritten so the Tele-MANAS 14416 line ends with *"डॉक्टर साहब आपकी रिपोर्ट तुरंत देख रहे हैं"* instead of *"Manorama को भी जोड़ रहे हैं"*.
- **CLAUDE.md** — the entire "Anand-mandated constraints (CONDITIONAL GO; 7 conditions)" block and the "Production-mode caveat" paragraph are deleted. The "Runtime Personas" section now describes only Vaani + the real-RMP handoff. The founder Q&A is rewritten.

## What stayed

- **AI · DEMO MODE** chip stays on the ASHA app and Cockpit. Vaani is still an AI screener; the chip is honest about that.
- **No-drug rule, no-diagnosis rule, PCPNDT / MHCA / POCSO hardcoded refusals** all still apply to Vaani.
- **Cockpit's "AI Draft Timestamp" column header** (mo_signed_at rename) is kept — it correctly describes the timestamp on the AI-pre-drafted SOAP that the RMP signs.
- **PII redaction before Claude (US)** unchanged — Anand's §3.9 still binding.
- **Manorama VAPI assistant** (`ef431343-…`) is left in the workspace but no traffic routes to it. Can be deleted after demo if not needed.

## TODO before demo day

| Item | What | Where |
|------|------|-------|
| Real RMP details | Name + MCI/HPR Reg # + phone (E.164) | `.env.local` as `RMP_NAME` / `RMP_MCI_REG` / `RMP_PHONE_E164` |
| Slide 8 production diagram | Update to show SIP transfer to RMP phone (not Manorama) | Submission video script |
| Volunteer consent form | Replace "Manorama is a software agent…" line with the new RMP language | `scratchpad/anand-volunteer-consent-v3.md` if it exists |

## Rollback

If we need to put Manorama back in:

```bash
# Re-attach the transfer tool on the Hindi assistant
curl -X PATCH "https://api.vapi.ai/assistant/$VITE_VAPI_ASSISTANT_ID_HI" \
  -H "Authorization: Bearer $VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":{"toolIds":["d812f7da-25c9-401f-848a-d016f07f3b58","6d3358e4-bcb4-4c90-ab57-fde11e16b422","ac2981a9-e5d3-4f44-aedb-e01b764dfcb5"]}}'

# Restore section 6 + 7 of the system prompt from git history of CLAUDE.md
git log --oneline -- CLAUDE.md   # find pre-2026-06-26 commit
git show <sha>:CLAUDE.md         # extract Anand 7-conditions block
```

The board reviews under `scratchpad/board-review-anand.md` and `scratchpad/board-review-manorama.md` are unchanged — they remain accurate records of the prior architecture for audit.
