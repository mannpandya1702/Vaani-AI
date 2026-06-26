# Methodology — AI-assisted Presumptive Screening Benchmark

> The hackathon brief calls this Stage 3 "AI Shadow Diagnosis." In our own public artefacts we use "AI-assisted presumptive screening" per NMC Act 2019 / IMC Reg 6.1.1. Methodology is identical; only the label.

## Inclusion criteria for the case set

A case enters the benchmark if it meets ALL of:
- Real or realistic chief complaint (rural India primary care)
- Transcript ≥3 turns of dialogue between AI and patient
- One of the 16 red-flag categories present, OR a clearly benign GREEN case
- Patient demographics specified (age, sex, preferred_language, pregnancy_status)

## Scoring rubric

For each case, every scorer (AI / junior GP / senior MO) produces:

| Field | Type | Notes |
|---|---|---|
| `band` | RED / AMBER / GREEN | |
| `presumptive_screening_label` | string from the constrained vocabulary | NO "diagnosis" |
| `red_flag_categories` | array of enum | empty for non-emergencies |
| `differential_list` | array of `{label, likelihood: high|medium|low, rationale}` | top-3 |
| `recommended_action` | string | patient-facing instruction |
| `confidence` | 0..1 | scorer's own confidence |

## Agreement metrics

| Metric | Formula | Pass criterion |
|---|---|---|
| **Band agreement** | (matching bands) / total cases | AI ≥ Junior GP |
| **Red-flag recall** | (correctly flagged emergencies) / true emergencies | AI ≥ 0.95 |
| **Red-flag precision** | (true emergencies among flagged) / total flagged | AI ≥ 0.75 |
| **Top-1 label agreement** | (exact-match labels with senior MO) / total | AI ≥ 0.70 |
| **Top-3 differential overlap (Jaccard)** | mean Jaccard of differential_list label sets | AI ≥ Junior GP |
| **Safety-critical agreement** (the one that matters) | agreement on RED + red-flag-category for emergencies | AI ≥ 0.98, AI ≥ Junior GP |

## Scoring procedure

1. Sample 30+ cases from `eval/cases/`.
2. Strip the `expected` block (don't reveal ground truth to scorers).
3. For each case:
   a. Run `triage-score` (AI scorer) — output goes to `gp-benchmark/ai-scores/<case_id>.json`.
   b. Send the transcript to the junior GP (PDF) — response goes to `gp-benchmark/gp-responses/<case_id>.yaml`.
   c. Senior MO adjudicates the ground truth — `gp-benchmark/gold-labels/<case_id>.yaml`.
4. Run `compare.ts` to compute all metrics + Cohen's kappa for inter-rater reliability.

## Inter-rater reliability

We report **Cohen's κ** between AI vs Senior MO and Junior GP vs Senior MO on the band field. Targets:
- Junior GP vs Senior MO: κ ≥ 0.60 (substantial agreement)
- **AI vs Senior MO**: κ ≥ Junior GP's κ — that's the bar to clear for "AI is at least as good as a junior GP."

## Bias controls

- Cases are presented in randomized order to each scorer.
- Scorers do not see other scorers' responses until adjudication.
- Senior MO adjudicates ground truth WITHOUT knowing which response is the AI's.
- All scorers receive identical context — no extra hints to the AI.

## Honest limitations

- **Single senior MO** for gold labels (target: 2 for κ on the ground truth itself).
- **Hindi-only for v1** — Tamil benchmark is post-pilot.
- **No real-time stress test** — junior GP scores async, AI scores in real-time on the call.
- **Synthetic transcripts for the demo set** — real ASHA-mediated calls during pilot will exercise the noisy-STT path which is harder than clean transcripts.
