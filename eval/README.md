# Vaani-AI Eval Harness

Judging-dimension #4 of the India AI Hackathon (NextBharat Ventures + AIENGG): **evals**.

## What this measures

| Metric | Target (Aanya §3 + Aman §5) |
|---|---|
| **Triage exact-match** (band agreement on RED/AMBER/GREEN) | ≥ 92% |
| **Red-flag recall** (% of true red-flags the system catches) | ≥ 98% |
| **Red-flag precision** | ≥ 75% |
| **Presumptive-label exact-match** | ≥ 70% |
| **Recommended-action keyword recall** (e.g., "108", "Tele-MANAS") | ≥ 95% |
| **Latency p95** (end-to-end triage-score) | ≤ 4s |

## Layout

```
eval/
├── README.md             # this file
├── cases/                # 30+ YAML cases (16 red-flag categories + green/amber)
│   ├── 001-acs-classical.yaml
│   ├── 002-stroke-befast.yaml
│   ├── …
│   └── 030-uri-minor.yaml
├── run.ts                # Deno runner — seeds DB, invokes edge fns, scores
├── types.ts              # shared types + schema for cases
├── scorer.ts             # metric calculations
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
