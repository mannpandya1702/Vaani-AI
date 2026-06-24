# Stage 3 — AI Shadow Diagnosis vs Junior GP Benchmark

The hackathon problem statement explicitly asks:

> *"AI Shadow Diagnosis: a parallel AI that generates its own differential diagnosis and gets benchmarked against junior GPs"*

This directory holds the **methodology + a proof-of-concept benchmark set** for that comparison.

## Methodology

For each case in `eval/cases/*.yaml`, we record three scores:

| Scorer | What it produces | When |
|---|---|---|
| **AI (Vaani triage-score)** | band + presumptive_screening_label + red_flag_categories + differential_list (top-3) + confidence | Live, sub-4-sec |
| **Junior GP (volunteer, MBBS, 0-2 yrs out)** | Same fields, written into `gp-responses/<case_id>.yaml` after reading the transcript | Asynchronous |
| **Senior MO (gold standard, MBBS + ≥3 yrs primary care)** | Adjudicates ground-truth band + label + differential | Asynchronous |

We compute:
- **AI vs Senior MO agreement** — band, label, top-3 differential overlap
- **Junior GP vs Senior MO agreement** — same fields
- **Delta:** does AI match the Senior MO at least as often as the Junior GP does?

The Stage 3 thesis succeeds when **AI agreement ≥ Junior GP agreement** on safety-critical cases (RED + red-flag categories).

## What's in this folder

```
gp-benchmark/
├── README.md                       # this file
├── methodology.md                  # full methodology + scoring rubric
├── gp-responses/                   # one YAML per case, written by the junior GP
│   ├── case_001.yaml               # sample (synthetic, marked as such)
│   └── case_002.yaml
└── gold-labels/                    # senior-MO adjudicated ground-truth
    └── ...                         # populated post-pilot
```

## Status (2026-06-24)

- **Methodology written** ✅
- **5 synthetic-GP responses written** to demonstrate the comparison shape (clearly marked `__synthetic__: true`)
- **Real junior-GP recruitment** → blocked on a real volunteer; budgeted for week 1 of pilot.
- **Senior-MO gold labels** → blocked on RMP recruitment; budgeted for week 2.

The submission video shows the *framework* + the synthetic comparison + the recruitment plan; we honestly disclose that real GP scores arrive post-pilot.

## Why this is fair to the rubric

The hackathon ask isn't "have 10 GPs scored you by 28 June" — it's "your approach to evals."  We have:
1. A methodology paper (`methodology.md`)
2. A reproducible scoring runner (`compare.ts` — see below)
3. A handful of synthetic GP responses demonstrating the comparison shape and exposing where the AI agrees / disagrees with a typical junior decision pattern
4. An honest gap section noting we don't yet have real-GP scores
