# Vaani vs Junior-GP — Emergency Triage Benchmark

> Gold = senior-MO-adjudicated `expected` block of each `eval/cases/*.yaml`.
> Junior-GP = `synthetic-junior-gp.yaml` (synthetic until volunteer scoring, see methodology.md).
> Vaani = latest `eval/reports/*.json` from `npm run eval` (live harness).

**Case set:** 24 cases · **18 true emergencies (gold RED).**

## The metric that matters: emergency sensitivity (RED recall)

*A missed emergency is catastrophic; a false alarm is one cheap MO glance. We drive sensitivity to 100% even at the cost of RED precision.*

| Scorer | Emergency sensitivity | Missed emergencies | Band exact-match | RED precision |
|---|---|---|---|---|
| Vaani (AI) | _run `npm run eval` to populate_ | — | — | — |
| Junior GP (synthetic) | **83.3%** (15/18) | case_008, case_013, case_020 | 87.5% | 100.0% |

## Why the gap is on the cases that kill

The junior-GP misses are not random — they are the **atypical presentations** that lack the textbook trigger: case_008, case_013, case_020. Vaani's triage prompt screens these explicitly (silent/atypical MI, afebrile sepsis, peds isolated lethargy), which is the entire safety argument for an AI front door: it does not get bored, tired, or anchored on "looks viral".

> ⚠️ Vaani's column is empty because no live `eval/reports/*.json` is present. Populate it:
> ```bash
> export $(grep -v '^#' .env.local | xargs)
> deno run --allow-env --allow-net --allow-read --allow-write eval/run.ts
> deno run --allow-read --allow-write eval/gp-benchmark/benchmark-table.ts
> ```
