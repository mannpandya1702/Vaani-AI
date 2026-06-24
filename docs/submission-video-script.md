# Vaani-AI — 5-minute submission video script
**India AI Hackathon (NBV + AIENGG) · Application deadline: 2026-06-28**

This script maps to the hackathon's exact four judging dimensions:

> *(1) Problem definition · (2) Data processing · (3) System design · (4) Evals*

Plus the four explanation prompts: clinical stage targeted · vernacular voice data collection · data processing + system design · evaluation methodology.

Total runtime target: **4 minutes 50 seconds**, leaving 10s safety margin.

---

## 0:00 – 0:30 · Cold open (visual: live ASHA call)

**Visual:** ASHA worker on a phone in a village clinic; Vaani's Hindi voice plays.

**VO (founder, English, calm, 75 words):**
> India has one doctor for every eleven thousand people. Most of the doctor's day is screening, triage, summarising notes, and following up. Vaani-AI is the AI layer that gives those hours back. A voice agent that screens patients in Hindi or Tamil **before** the appointment, hands the doctor a structured eSanjeevani SOAP, and **calls the patient back** to confirm the doctor saw them. This is a clip from a real call.

(Let 8 seconds of the Hindi screening play, including Vaani's gender-neutral disclosure.)

---

## 0:30 – 1:15 · Problem definition (judging dim 1)

**Visual:** stat panel.

**VO (60 words):**
> Five clinical stages waste doctor hours: pre-visit capture, in-visit transcription, shadow diagnosis, low-cost vernacular STT, and post-visit communication. Most solutions pick one. The hackathon brief explicitly rewards threading multiple stages into one coherent agent. **Vaani threads three** — pre-visit screening, AI shadow diagnosis with differential, and a post-visit voice callback. **And** it ships a fourth — in-visit ambient transcription — under the same architecture.

**On-screen:**
- Stage 1: Pre-Visit Capture ✅
- Stage 2: In-Visit Transcription + EMR ✅
- Stage 3: AI Shadow Diagnosis ✅
- Stage 4: Low-Cost STT (₹0.36/min) ✅
- Stage 5: Post-Visit Voice Callback ✅

---

## 1:15 – 2:15 · Vernacular voice data collection (the *how*)

**Visual:** architecture diagram of the voice pipeline. Highlight: ap-south-1, gender-neutral prompt v2.1, Devanagari-only output rule.

**VO (90 words):**
> Vernacular STT is Sarvam Saarika v2 at ₹0.83/min for streaming, Deepgram nova-3 at ₹0.36/min for diarized in-visit recording. Both well under the one-rupee-per-minute cap. Vaani's voice runs on ElevenLabs Turbo v2.5 with a gender-neutral Hindi prompt — the model uses Hindi infinitive object-agreement, plural-formal "हम," and impersonal voice to emit zero gendered verb forms. We learned this matters: prompt v1 leaked the speaker's gender within four seconds and broke trust with women patients.

**On-screen excerpt:**
```
# Hindi gender-neutral prompt v2.1 — 3 prescriptive patterns
A. Object-agreeing infinitive: "बात करनी है"
B. Plural-formal हम: "हम सुन रहे हैं"
C. Impersonal/passive: "समझ आ गया"
```

---

## 2:15 – 3:30 · Data processing + system design (judging dim 2 + 3)

**Visual:** sequence diagram of the full call lifecycle.

**VO (90 words):**
> The call enters Supabase Mumbai. Every payload to Claude is PII-redacted via an eight-regex sweep plus a twenty-eight-state denylist; a cross-border-transfer audit row is written *before* the API request fires. Triage runs a rules-first red-flag check on a deterministic phrase library — we caught a real production bug here, the seed phrases were Romanized but our agent emits Devanagari, so we shipped a migration that added sixty Devanagari phrases. Then Claude Sonnet 4.6 emits a tool-forced JSON SOAP. The SOAP enters the MO cockpit. On approve, Vaani calls the patient back: *"डॉक्टर साहब ने देख लिया है"* — the doctor has seen you.

**On-screen final SOAP example** (1 second hold).

---

## 3:30 – 4:30 · Evals — judging dim 4 (the make-or-break)

**Visual:** terminal recording of `deno run eval/run.ts` finishing.

**VO (75 words):**
> Evals run on twelve YAML cases covering sixteen red-flag categories. Each case seeds an ephemeral call, fires triage-score on the live edge function, scores against expected band, categories, label, action keyword, and confidence, then cleans up. Current numbers: red-flag recall 93.8%, precision 89.6%, band exact-match 75%, p95 latency 6.7 seconds. We honestly disclose: Claude over-flags routine GREEN cases. Prompt tuning in progress; the eval surfaced it.

**On-screen metrics table** (the report .md preview).

> **The Stage 3 ask** — AI shadow diagnosis benchmarked against junior GPs — requires real GPs we don't yet have. So we shipped the methodology and a reproducible comparator. Post-pilot we replace synthetic GP responses with real ones.

---

## 4:30 – 4:50 · The team + the ask (close)

**Visual:** team slide (founder + 9-member advisor board).

**VO (35 words):**
> Vaani-AI is built by a single founder with a nine-member advisor board — clinical, legal, AI engineering, voice, design, business, prompt master, voice engineer, PM, and full-stack. Two days to submission. Eighteen days to the in-person demo. Thank you.

(Wordmark + URL on screen.)

---

## Recording checklist

- [ ] Record final cut at 1080p, 30fps, single take if possible
- [ ] Voice-over: ambient room mic, no music under speech (judges parse clinical claims)
- [ ] Subtitle Hindi audio in English (translation overlay)
- [ ] Hard-burn the AI · DEMO MODE label across every cockpit screen-cap (Anand mandate)
- [ ] Stage-1 disclosure ("Vaani-AI is a research prototype…") appears for ≥3 seconds within the first 30s
- [ ] Final 5-second hold shows the soul callback URL of the recorded patient phrase, not just text
- [ ] Upload to the Google Form linked in the brief by Jun 27 EOD IST (T-1 buffer day)

## Files to attach with submission

- `docs/cost-analysis.md` (Stage 4 evidence)
- `eval/reports/2026-06-24.md` (eval baseline)
- `eval/gp-benchmark/methodology.md` (Stage 3 methodology)
- `README.md` (architecture + 3-stage thread claim)
- This script (judges sometimes ask)
