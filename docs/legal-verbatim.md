# Vaani-AI · Legal Verbatim Text

This file is the **single source of truth** for every regulated string the project renders to a third party — on stage at the hackathon, in the submission video, in the cockpit, on the ASHA app, and on any printed handout.

Anand has reviewed every paragraph below. Do NOT paraphrase. If a render surface needs different copy, edit this file first, get Anand to sign, then update the surface.

Identifiers:
- Project: `Vaani-AI`
- Phase: research prototype demonstration
- Statutory frame: NMC Act 2019, IMC Reg 6.1.1, TPG 2020, DPDP Act 2023 (s.6, s.6(4), s.16), PCPNDT Act 1994 (s.22), MHCA 2017 (s.18), POCSO 2012 (s.19)

---

## 1. Slide-1 disclosure — voiced + visible before any live call

**English (must be voiced once and visible on the screen for the duration of the demo):**

> *"Vaani-AI is a research prototype demonstrating AI-assisted clinical decision support. No medical consultation, diagnosis, prescription, or treatment is being rendered in this demonstration. All callers are consented adult volunteers; no doctor–patient relationship is created. 'Vaani' is an AI voice screener — not a registered medical practitioner. The doctor at the cockpit is a real, named, SMC-verified, HPR-linked Registered Medical Practitioner who independently reviews and signs every clinical note."*

**Hindi (parallel reading on the same slide):**

> *"वाणी-AI एक रिसर्च प्रोटोटाइप है — सिर्फ़ AI सहायता का प्रदर्शन है। आज इस मंच पर कोई इलाज, निदान, पर्चा या दवा नहीं दी जा रही। सभी कॉलर सहमति देने वाले वयस्क स्वयंसेवक हैं; किसी डॉक्टर-मरीज़ रिश्ते की कोई बात नहीं। 'वाणी' एक AI सहायक है, डॉक्टर नहीं। कॉकपिट पर बैठे डॉक्टर साहब वास्तविक हैं — SMC-प्रमाणित, HPR-ABDM से जुड़े — हर रिपोर्ट वो ख़ुद देखकर सिग्नेचर करते हैं।"*

**Where it must appear:**
- Slide 1 of the submission deck — visible for the full first 30 seconds before any live call is shown
- The ASHA app `<DisclosureModal>` (this commit) — must be acknowledged BEFORE the mic button activates
- Spoken aloud by the founder once before the first stage call
- Printed verbatim on the volunteer consent form (§3 below)

---

## 2. Founder Q&A — "where's the doctor?" (memorize verbatim)

> *"The doctor is right there — at the cockpit. Vaani is the front door: she screens, captures the patient's history in their language, and the moment she spots a red flag she pushes the report to the real RMP on call. That RMP is SMC-verified, HPR-linked under ABDM, and they personally review and sign every clinical note before the patient ever hears back. The patent we're showing is the closed-loop callback — the patient learns the doctor has actually seen them. No AI signs a note. No AI dispenses care. The AI is the listener, the doctor is the decider."*

(Architecturally accurate as of the 2026-06-26 Manorama-removal pivot. See `docs/architecture-change-2026-06-26-real-rmp.md`.)

---

## 3. Volunteer consent form v3 — bilingual

See `docs/legal/volunteer-consent-v3.md`.

---

## 4. Hardcoded refusal scripts (PCPNDT / MHCA / POCSO)

These are **NOT** rendered by the LLM — they are deterministic constants in `supabase/functions/_shared/refusal-scripts.ts` and fire from `triage-score/index.ts → checkRefusal()`. Audit §2 found they currently only run post-call; D2 in `docs/audits/2026-06-26-9dim-board-audit.md` tracks routing them through a live custom-LLM proxy so they fire mid-turn.

### 4.1 PCPNDT — sex-determination ask

**Hindi (exact):**
> "यह जानकारी कानूनन नहीं दी जा सकती। PCPNDT कानून के तहत गर्भ का लिंग बताना अपराध है। नमस्ते।"

**Tamil:**
> "சட்டப்படி இந்த தகவலை வழங்க முடியாது. PCPNDT சட்டத்தின் கீழ் கருவின் பாலினத்தை வெளியிடுவது குற்றமாகும்."

**English:**
> "Under the PCPNDT Act, we cannot disclose or assist in determining the sex of a foetus. It is a criminal offence."

Statutory ref: PCPNDT Act 1994, s.22. Required followup: insert into `refusal_log` + `ops_incidents`.

### 4.2 MHCA — active suicidal ideation

**Hindi (v2, 2026-06-26 — fixes the audit-flagged feminine verb and the conditional 14416):**
> "यह बात बहुत ज़रूरी है जी। Tele-MANAS पर मदद मिलेगी — चौदह चार सौ सोलह — 14416 — अभी फ़ोन कीजिए। डॉक्टर साहब आपकी रिपोर्ट तुरंत देख रहे हैं।"

**Tamil (v2):**
> "இது மிக முக்கியம். டெலி-மானஸ் 14416-க்கு உடனே அழைக்கவும். டாக்டர் உங்கள் அறிக்கையை இப்போதே பார்க்கிறார்."

**English (v2):**
> "This matters a lot. Call Tele-MANAS 14416 now — that is one-four-four-one-six. The doctor is reviewing your report right now."

Statutory ref: MHCA 2017, s.18 (mandates immediate referral, not optional). Number MUST be spoken in words as well as digits — TTS reads digit strings as separate numbers and patients miss the helpline. Required followup: `tele_manas_14416`.

### 4.3 POCSO — under-18 disclosure marker

**Hindi:**
> "आपने जो बताया है वो बहुत ज़रूरी है। हम बच्चे की सुरक्षा के लिए तुरंत मदद भेज रहे हैं। चाइल्डलाइन 1098 भी 24 घंटे उपलब्ध है।"

**Tamil:**
> "நீங்கள் சொன்னது மிக முக்கியம். குழந்தையின் பாதுகாப்பிற்காக உடனடியாக உதவியை அனுப்புகிறோம். சைல்ட்லைன் 1098 24 மணி நேரமும் கிடைக்கும்."

**English:**
> "What you shared is important. We are arranging immediate help for the child's safety. Childline 1098 is available 24/7."

Statutory ref: POCSO Act 2012, s.19 (mandatory reporting). Required followup: `childline_1098_sjpu` + SJPU report.

---

## 5. Cockpit AI-DEMO MODE tooltip (Anand condition #4)

Amber chip text and tooltip on every Vaani / cockpit action surface:

- Chip text: `AI · DEMO MODE`
- Tooltip (English, hover/long-press): *"AI Clinical Decision-Support Agent · Demonstration only · Not a Registered Medical Practitioner under NMC Act 2019 · Output is not a substitute for licensed clinical review."*

Must NOT be collapsible, dismissible, or hidden behind a settings toggle.

---

## 6. Marketing / public-claim banlist (Anand red-line)

Never use in deck, video, README, social, slides, or printed copy:

- "AI doctor"
- "AI diagnoses" / "diagnosis from an AI"
- "cures", "treats", "prescribes"
- "validated" (no FDA / CE / DCGI approval)
- "ABDM integrated" — until M3 milestone shipped (Sandbox-only allowed)
- "approved by", "endorsed by" — unless a written endorsement exists in this repo

Always use:
- "AI-assisted presumptive screening" (NOT "AI shadow diagnosis" — keep the hackathon brief's verbiage only inside `eval/gp-benchmark/` with the framing note)
- "AI-assisted clinical decision support"
- "research prototype"
- "the named RMP reviews and signs"

---

## 7. Change history

- v1 (pre-2026-06-26) — included Manorama (AI MO Agent) references in §1 and §2
- v2 (2026-06-26) — Manorama removed; §1 and §2 rewritten; MHCA script v2 (`refusal_mhca_v2`) with verbatim 14416 + neuter verb + unconditional referral
