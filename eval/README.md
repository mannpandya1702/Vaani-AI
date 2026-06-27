# Vaani-AI Eval Harness

Judging-dimension #4 of the India AI Hackathon (NextBharat Ventures + AIENGG): **evals**.

## What this measures

**The metric that matters — emergency sensitivity.** In emergency triage the
only unforgivable error is a *missed* emergency. So the headline (and the hard
CI gate) is **case-level RED recall**: of the gold-RED cases, the fraction the
system also calls RED. We drive it to **100%** and accept lower RED precision —
a false alarm costs one MO glance; a miss can cost a life.

| Metric | Target (Aanya §3 + Aman §5) |
|---|---|
| **Emergency sensitivity** (case-level RED recall — THE metric, hard gate) | **= 100%** |
| RED precision (of cases flagged RED, fraction truly RED) | reported, **not** gated |
| Triage exact-match (band agreement on RED/AMBER/GREEN) | ≥ 92% |
| Red-flag category recall (% of true categories caught) | ≥ 98% |
| Red-flag category precision | ≥ 75% |
| Presumptive-label exact-match | ≥ 70% |
| Recommended-action keyword recall (e.g., "108", "Tele-MANAS") | ≥ 95% |
| Latency p95 (end-to-end triage-score) | ≤ 4s |

## Vaani vs junior-GP baseline

`gp-benchmark/benchmark-table.ts` frames the same emergency-sensitivity metric
as **Vaani vs a junior-GP baseline** (`synthetic-junior-gp.yaml`) against the
senior-MO gold labels, and writes `gp-benchmark/benchmark-report.md`. The
junior-GP baseline catches the textbook emergencies but under-triages the
atypical ones (silent MI, afebrile postpartum sepsis, atypical elderly fever) —
the exact gap Vaani's prompt is built to close.

```bash
deno run --allow-read --allow-write eval/gp-benchmark/benchmark-table.ts
```

## Unit-economics model

`eval/cost-model.ts` derives the ₹/min and per-consult cost from one rate table
and (re)writes `docs/unit-economics-slide.md` — the numbers behind the
"STT under ₹1/min" claim.

## Layout

```
eval/
├── README.md             # this file
├── cases/                # 24 YAML cases (red-flag categories + green/amber)
│   ├── 001-cardiac-classical.yaml
│   ├── …
│   └── 024-green-fungal-skin.yaml
├── run.ts                # Deno runner — seeds DB, invokes edge fns, scores
├── types.ts              # shared types + schema for cases
├── scorer.ts             # metric calculations (incl. emergency sensitivity)
├── cost-model.ts         # unit-economics model → docs/unit-economics-slide.md
├── gp-benchmark/         # Vaani vs junior-GP comparison
│   ├── synthetic-junior-gp.yaml
│   ├── benchmark-table.ts
│   └── benchmark-report.md
└── reports/              # generated reports (gitignored)
    └── 2026-06-24.md
```

## Case schema

```yaml
id: case_001
title: Classical ACS in 65 year-old male
clinical_stage: pre_visit_capture
patient:
  age_years: 65
  sex: M
  preferred_language: hi
  pregnancy_status: not_applicable
transcript:
  - role: assistant
    text: "नमस्ते जी. वाणी बात कर रहे हैं..."
  - role: user
    text: "मुझे सीने में बहुत ज़ोरदार दर्द है, साँस नहीं आ रही"
  - role: assistant
    text: "ओह… कब से हो रहा है?"
  - role: user
    text: "एक घंटे से, बायें हाथ में भी दर्द आ रहा है"
expected:
  band: RED
  red_flag_categories: [cardiac, respiratory]
  presumptive_label: acs_suspect          # or list of acceptable labels
  confidence_min: 0.85
  recommended_action_must_contain: ["108"]
  recommended_action_must_not_contain: ["दवाई", "diagnosis"]
```

## Run

```bash
# From repo root, with .env.local sourced
export $(grep -v '^#' .env.local | xargs)
deno run --allow-env --allow-net --allow-read --allow-write eval/run.ts
```

Outputs:
- `eval/reports/<date>.md` — human-readable report
- `eval/reports/<date>.json` — machine-readable metrics

## CI gate (Aman §5)

`npm run eval` should fail the build if any metric falls below the target above.
