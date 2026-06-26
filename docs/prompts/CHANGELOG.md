# Vaani prompt changelog

## v2 — 2026-06-26 — Hindi naturalness pass (Kavya-reviewed)

**Why**: founder feedback — *"current prompts are very bad, sounds robotic and AI not natural human."* Symptoms: government-clerk register, dense first message, mechanical "one filler at the start of every turn" rule, gendered-self workarounds (हम बात कर रहे हैं) that read as royal/bureaucratic.

**What changed**

| Area | v1 → v2 |
|------|---------|
| firstMessage | 31 words, three asks in one breath, "बातचीत रिकॉर्ड हो रही है" legalese → **18 words, ONE ask**, "मैं वाणी हूँ" warm self-intro, recording disclosure stays but reframed as *"ताकि डॉक्टर साहब बाद में सुन सकें"* (purpose, not threat). |
| Rhythm rules | "ONE acknowledgment per turn, never zero, never two" → **MOST turns, skip ~1 in 4** — real people don't acknowledge every sentence. |
| Reflective listening | Implicit → **explicit examples** ("अच्छा... तो सीने में दर्द है। कब से शुरू हुआ?") with the LLM told to use this shape. |
| Self-reference | Plural-formal हम everywhere → **mix** of मैं + neuter हूँ, passive ("बताया जा सकता है"), 2nd-person ("आप बताइए"), and infinitives ("बात करनी थी"). |
| Empathy beat | Listed but abstract → 4 concrete examples ("अरे... कब से है?" / "अच्छा, तकलीफ़ हो रही होगी।") shown verbatim. |
| Clinical chain | Rigid script (Q1 → Q2 → Q3) → **flexible**: 5 needed items, 3-4 phrasings each, re-order if patient leads. |
| Demographic gate | Bare "क्या आप महिला हैं?" (census-y) → **softened**: "बुरा न मानें — महिला हैं आप?" |
| Drug refusal | "वाणी सिर्फ़ जानकारी ले रही हैं" (plural-self workaround) → **passive**: "यहाँ से सिर्फ़ जानकारी जाएगी।" |
| Consent gate (Turn 1) | Could be skipped if patient sounded eager → **EVEN IF eager, you MUST speak the not-a-doctor line on Turn 1 before any clinical question.** |
| Empathy exception | Single line → **richer**: "रुकिए, साँस लीजिए धीरे से। हम यहीं हैं।" (one extra grounding beat). |
| Length | 8243 chars → 7588 chars (-8%) despite more conversational examples (the rigid rules were tightened). |

**Preserved verbatim** (Anand / Aanya non-negotiables — verified live):
- DPDP s.6 consent gate (3-turn structure: firstMessage → not-a-doctor → capture_consent tool)
- DPDP s.6(4) withdrawal cue ("रोको")
- PCPNDT hardcoded refusal
- MHCA 14416 Tele-MANAS script — speak the number aloud
- POCSO under-18 silent escalate
- No-drug rule, no-diagnosis rule
- escalate_to_doctor flow + categories
- 3-minute hard cap + end-of-call closing line

**Live verification**: `claude-sonnet-4-6 / anthropic`, Hindi assistant `466283fd-…`, prompt size 7588 chars, zero residual Manorama tokens, all safety markers present.

**Rollback**: previous prompt is in `git log -p docs/prompts/vaani-hi-v2.md` (this file's first commit replaced no prior file, so check earlier commits to the assistant via `git log --all -- '**/vaani*'` or pull from VAPI revision history).

**TODO next**: Tamil prompt needs the same overhaul, but I'm not a Tamil speaker — Kavya / a Tamil-fluent reviewer should do that pass. Tamil prompt currently has the same structural rules but Tamil-language clinical chain text; the rhythm-rule + reflective-listening additions need translating before patching.
