// eval/scorer.ts — score one case + aggregate metrics.

import type { Band, CaseResult, EvalCase, RunReport } from './types.ts';

export function scoreCase(c: EvalCase, actual: {
  band: Band | null;
  red_flag_categories: string[];
  presumptive_label: string | null;
  confidence: number;
  recommended_action: string | null;
  needs_mo_review: boolean | null;
  latency_ms: number;
}): CaseResult {
  const reasons: string[] = [];

  const band_match = actual.band === c.expected.band;
  if (!band_match) reasons.push(`band: expected ${c.expected.band} got ${actual.band}`);

  const expectedCats = new Set(c.expected.red_flag_categories);
  const actualCats = new Set(actual.red_flag_categories);
  const recall = expectedCats.size === 0
    ? 1
    : Array.from(expectedCats).filter((x) => actualCats.has(x)).length / expectedCats.size;
  const precision = actualCats.size === 0
    ? (expectedCats.size === 0 ? 1 : 0)
    : Array.from(actualCats).filter((x) => expectedCats.has(x)).length / actualCats.size;
  if (recall < 1 && expectedCats.size > 0) {
    const missing = Array.from(expectedCats).filter((x) => !actualCats.has(x));
    reasons.push(`categories missing: ${missing.join(', ')}`);
  }

  const expectedLabels = c.expected.presumptive_label
    ? Array.isArray(c.expected.presumptive_label)
      ? c.expected.presumptive_label
      : [c.expected.presumptive_label]
    : [];
  const label_match = expectedLabels.length === 0
    ? true
    : expectedLabels.includes(actual.presumptive_label ?? '');
  if (!label_match && expectedLabels.length > 0) {
    reasons.push(`label: expected one of [${expectedLabels.join('|')}] got "${actual.presumptive_label}"`);
  }

  const confidence_pass = c.expected.confidence_min == null
    ? true
    : actual.confidence >= c.expected.confidence_min;
  if (!confidence_pass) {
    reasons.push(`confidence ${actual.confidence.toFixed(2)} < min ${c.expected.confidence_min}`);
  }

  const action = (actual.recommended_action ?? '').toLowerCase();
  const action_must_contain_pass = (c.expected.recommended_action_must_contain ?? [])
    .every((needle) => action.includes(needle.toLowerCase()));
  if (!action_must_contain_pass) {
    const missing = (c.expected.recommended_action_must_contain ?? [])
      .filter((n) => !action.includes(n.toLowerCase()));
    reasons.push(`action missing: ${missing.join(', ')}`);
  }
  const action_must_not_contain_pass = (c.expected.recommended_action_must_not_contain ?? [])
    .every((forbidden) => !action.includes(forbidden.toLowerCase()));
  if (!action_must_not_contain_pass) {
    const present = (c.expected.recommended_action_must_not_contain ?? [])
      .filter((f) => action.includes(f.toLowerCase()));
    reasons.push(`action contains forbidden: ${present.join(', ')}`);
  }

  const needs_mo_review_match = c.expected.needs_mo_review == null
    ? null
    : actual.needs_mo_review === c.expected.needs_mo_review;
  if (needs_mo_review_match === false) {
    reasons.push(`needs_mo_review: expected ${c.expected.needs_mo_review} got ${actual.needs_mo_review}`);
  }

  const pass = band_match
    && recall === 1
    && label_match
    && confidence_pass
    && action_must_contain_pass
    && action_must_not_contain_pass
    && (needs_mo_review_match !== false);

  return {
    case_id: c.id,
    case_title: c.title,
    expected_band: c.expected.band,
    actual_band: actual.band,
    band_match,
    expected_categories: c.expected.red_flag_categories,
    actual_categories: actual.red_flag_categories,
    categories_recall: recall,
    categories_precision: precision,
    expected_label: expectedLabels,
    actual_label: actual.presumptive_label,
    label_match,
    confidence: actual.confidence,
    confidence_pass,
    action_must_contain_pass,
    action_must_not_contain_pass,
    needs_mo_review_match,
    latency_ms: actual.latency_ms,
    pass,
    failure_reasons: reasons,
  };
}

export function aggregate(results: CaseResult[]): RunReport {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;

  // Band exact-match
  const bandMatches = results.filter((r) => r.band_match).length;

  // ── Emergency sensitivity — THE metric (case-level RED recall) ──
  // Denominator: gold-RED cases. Numerator: gold-RED cases we also called RED.
  const goldRed = results.filter((r) => r.expected_band === 'RED');
  const caughtRed = goldRed.filter((r) => r.actual_band === 'RED');
  const emergency_sensitivity = goldRed.length === 0 ? 1 : caughtRed.length / goldRed.length;
  // RED precision: of the cases WE called RED, how many were truly RED.
  const calledRed = results.filter((r) => r.actual_band === 'RED');
  const truePosRed = calledRed.filter((r) => r.expected_band === 'RED');
  const red_precision = calledRed.length === 0 ? 1 : truePosRed.length / calledRed.length;

  // Red-flag recall/precision — only over cases that have expected categories
  const withFlags = results.filter((r) => r.expected_categories.length > 0);
  const avgRecall = withFlags.length === 0
    ? 1
    : withFlags.reduce((s, r) => s + r.categories_recall, 0) / withFlags.length;
  const avgPrecision = withFlags.length === 0
    ? 1
    : withFlags.reduce((s, r) => s + r.categories_precision, 0) / withFlags.length;

  // Label match — only over cases that have expected labels
  const withLabels = results.filter((r) => r.expected_label.length > 0);
  const labelMatchPct = withLabels.length === 0
    ? 1
    : withLabels.filter((r) => r.label_match).length / withLabels.length;

  // Action keyword match
  const withMustContain = results.filter((r) =>
    (r.expected_categories.length > 0) || true /* all */);
  const actionContainPct = withMustContain.filter((r) => r.action_must_contain_pass).length
    / Math.max(1, withMustContain.length);
  const actionNotContainPct = withMustContain.filter((r) => r.action_must_not_contain_pass).length
    / Math.max(1, withMustContain.length);

  const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const confMean = results.reduce((s, r) => s + r.confidence, 0) / Math.max(1, total);

  return {
    ran_at: new Date().toISOString(),
    total_cases: total,
    passed,
    failed: total - passed,
    metrics: {
      band_exact_match_pct: bandMatches / Math.max(1, total),
      emergency_sensitivity,
      emergency_total: goldRed.length,
      emergency_missed: goldRed.length - caughtRed.length,
      red_precision,
      red_called: calledRed.length,
      red_flag_recall: avgRecall,
      red_flag_precision: avgPrecision,
      label_match_pct: labelMatchPct,
      action_must_contain_pct: actionContainPct,
      action_must_not_contain_pct: actionNotContainPct,
      latency_p50_ms: p50,
      latency_p95_ms: p95,
      confidence_mean: confMean,
    },
    targets: {
      band_exact_match_pct: 0.92,
      emergency_sensitivity: 1.0,
      red_flag_recall: 0.98,
      red_flag_precision: 0.75,
      label_match_pct: 0.70,
      action_must_contain_pct: 0.95,
      latency_p95_ms: 4000,
    },
    results,
  };
}

export function renderReport(report: RunReport): string {
  const m = report.metrics;
  const t = report.targets;
  const fail = (got: number, target: number, dir: 'gte' | 'lte' = 'gte') => {
    const ok = dir === 'gte' ? got >= target : got <= target;
    return ok ? '✅' : '❌';
  };
  const pct = (x: number) => (x * 100).toFixed(1) + '%';

  let md = `# Vaani-AI Eval Report\n\n`;
  md += `Generated: ${report.ran_at}\n\n`;
  md += `**${report.passed}/${report.total_cases} cases passed.**\n\n`;
  md += `## Metrics\n\n`;
  md += `> **The metric that matters: emergency sensitivity** — case-level RED recall on true emergencies. `;
  md += `We drive this to 100% even at the cost of RED precision: a missed emergency is catastrophic, a false alarm is one cheap MO glance.\n\n`;
  md += `| Metric | Target | Actual | Status |\n|---|---|---|---|\n`;
  md += `| **Emergency sensitivity** (RED recall, ${m.emergency_total - m.emergency_missed}/${m.emergency_total} caught) | ≥ ${pct(t.emergency_sensitivity)} | ${pct(m.emergency_sensitivity)} | ${fail(m.emergency_sensitivity, t.emergency_sensitivity)} |\n`;
  md += `| RED precision (of ${m.red_called} flagged RED — reported, not gated) | — | ${pct(m.red_precision)} | — |\n`;
  md += `| Band exact-match (RED/AMBER/GREEN) | ≥ ${pct(t.band_exact_match_pct)} | ${pct(m.band_exact_match_pct)} | ${fail(m.band_exact_match_pct, t.band_exact_match_pct)} |\n`;
  md += `| Red-flag category recall | ≥ ${pct(t.red_flag_recall)} | ${pct(m.red_flag_recall)} | ${fail(m.red_flag_recall, t.red_flag_recall)} |\n`;
  md += `| Red-flag precision | ≥ ${pct(t.red_flag_precision)} | ${pct(m.red_flag_precision)} | ${fail(m.red_flag_precision, t.red_flag_precision)} |\n`;
  md += `| Presumptive-label match | ≥ ${pct(t.label_match_pct)} | ${pct(m.label_match_pct)} | ${fail(m.label_match_pct, t.label_match_pct)} |\n`;
  md += `| Recommended-action keyword recall | ≥ ${pct(t.action_must_contain_pct)} | ${pct(m.action_must_contain_pct)} | ${fail(m.action_must_contain_pct, t.action_must_contain_pct)} |\n`;
  md += `| Latency p50 | — | ${m.latency_p50_ms}ms | — |\n`;
  md += `| Latency p95 | ≤ ${t.latency_p95_ms}ms | ${m.latency_p95_ms}ms | ${fail(m.latency_p95_ms, t.latency_p95_ms, 'lte')} |\n`;
  md += `| Mean confidence | — | ${m.confidence_mean.toFixed(2)} | — |\n\n`;
  md += `## Per-case results\n\n`;
  md += `| # | Case | Expected | Actual | Latency | Pass | Reasons |\n|---|---|---|---|---|---|---|\n`;
  for (const r of report.results) {
    md += `| ${r.case_id} | ${r.case_title.slice(0, 40)} | ${r.expected_band} ${JSON.stringify(r.expected_categories)} | ${r.actual_band} ${JSON.stringify(r.actual_categories)} | ${r.latency_ms}ms | ${r.pass ? '✅' : '❌'} | ${r.failure_reasons.join('; ') || '—'} |\n`;
  }
  return md;
}
