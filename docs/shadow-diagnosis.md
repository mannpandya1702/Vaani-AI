# AI Shadow Diagnosis (Stage 3)

> The hackathon brief calls this **"AI Shadow Diagnosis."** It is a *separate*
> AI clinical opinion that runs after SOAP generation and **before** the RMP
> reviews. The AI advises; the doctor decides. The AI **never** overrides the
> doctor — we store both decisions so we can prove it and measure agreement.

## Where it sits in the pipeline

```
call ends
  → process-call-records
      1. triage-score        → triage_decisions   (band + red flags)
      2. soap-generate       → soap_notes          (eSanjeevani SOAP)
      2.5 shadow-diagnosis   → shadow_diagnoses    (AI clinical opinion)   ← Stage 3
      3. (RMP review at the cockpit; signoff via DB trigger)
```

`shadow-diagnosis` runs as an independent step. It does not touch the SOAP note,
the triage decision, or any patient-facing surface. If it fails, the cockpit
still shows triage + SOAP — the opinion is purely additive.

## Inputs

Gathered from the DB by `shadow-diagnosis` for the call:

- SOAP JSON (subjective / objective / assessment + the note's differential + ICD)
- Patient demographics (age / sex / pregnancy status / language)
- Structured symptoms (the full turn-by-turn transcript)
- Vitals (`soap_notes.vitals_json` + source)
- Triage score (band, confidence, reasoning)
- Red flags (`triage_decisions.red_flag_categories`)
- Prior patient history (up to 5 earlier triage decisions for the same patient)

All context is **PII-redacted** (`pii_token_map`) before it reaches Claude (US).

## Output (`emit_shadow_opinion`, forced JSON)

```json
{
  "differential_diagnoses": [
    { "condition": "...", "confidence": 0.83, "reasoning": "...", "supporting_findings": ["..."] }
  ],
  "recommended_tests": ["RBS", "malaria RDT", "..."],
  "recommended_medications": ["..."],
  "referral_recommended": true,
  "referral_reason": "...",
  "urgency": "Routine | Urgent | Emergency",
  "missing_information": ["..."]
}
```

## Rules / guardrails

| Rule | How it is enforced |
|---|---|
| Never a final diagnosis — only *differential diagnoses* | System prompt + field naming; cockpit labels it "AI Clinical Opinion · advisory" |
| Calibrated confidence + explain WHY | Per-item `confidence` + `reasoning` + `supporting_findings` required |
| Mention missing information | `missing_information[]` populated when uncertainty exists |
| Follow Indian primary-care workflow | Prompt anchors on ASHA→PHC→CHC→district ladder, IMNCI/STG/NLEM |
| **Red flags must increase urgency** | Deterministic post-LLM override: RED→Emergency + referral, AMBER/any-red-flag→≥Urgent (`red_flag_urgency_override` flag set) |
| Medications never reach the patient | `recommended_medications` is MO-only; rendered in the cockpit only, drug-scrubbed from any callback |

## Doctor decision capture

The cockpit "AI Clinical Opinion" card lets the RMP **Ignore / Accept / Edit**.
`shadow-diagnosis-review` writes the doctor's decision into the `doctor_*`
columns **without ever mutating the AI fields**. We therefore retain both:

- `differential_diagnoses`, `referral_recommended`, `urgency` … (AI)
- `doctor_action`, `doctor_referral_decision`, `doctor_urgency`, `doctor_notes` (doctor)

## Evaluation metrics

`eval/shadow-eval.ts` reads the reviewed rows and reports:

- **Agreement** between AI and doctor (accepted-as-is rate + urgency agreement)
- **Agreement by disease category** (grouped by red-flag category)
- **Referral accuracy** (AI referral vs doctor referral, doctor = ground truth)
- **False-positive referrals** (AI referred, doctor did not)
- **False-negative referrals** (AI missed a referral the doctor made) — the
  dangerous class, watched hardest

```bash
deno run --allow-env --allow-net --allow-read --allow-write eval/shadow-eval.ts
# → eval/reports/shadow-<date>.md
```

## Why this never overrides the doctor

- It runs in its own row (`shadow_diagnoses`), not in `triage_decisions` or
  `soap_notes`.
- It has no path to any patient-facing surface (`vaani-signoff`, SOAP plan).
- The doctor's `doctor_*` decision is the system of record; the AI fields are
  immutable advice.
- The signoff that calls the patient back ("डॉक्टर साहब ने देख लिया है") is still
  gated on the RMP signing the SOAP — the shadow opinion cannot trigger it.
