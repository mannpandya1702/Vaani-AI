// eval/run.ts — Vaani-AI eval harness runner.
//
// Reads YAML cases from eval/cases/, seeds one ephemeral call per case into
// Supabase, invokes the deployed triage-score edge function, reads the
// resulting triage_decisions row, scores against expected fields, then
// cleans up the seeded data so cockpit-feed stays uncluttered.
//
// Usage (with .env.local sourced):
//   deno run --allow-env --allow-net --allow-read --allow-write eval/run.ts
//
// Filter to one case: deno run … eval/run.ts case_001
//
// Outputs:
//   eval/reports/<UTC-date>.md
//   eval/reports/<UTC-date>.json

import { parse as parseYaml } from 'https://deno.land/std@0.224.0/yaml/parse.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';
import { ensureDir } from 'https://deno.land/std@0.224.0/fs/ensure_dir.ts';
import { dirname, join } from 'https://deno.land/std@0.224.0/path/mod.ts';

import type { EvalCase, CaseResult } from './types.ts';
import { scoreCase, aggregate, renderReport } from './scorer.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const MASTER_KEY = Deno.env.get('WEBHOOK_MASTER_KEY');
if (!SUPABASE_URL || !SERVICE_ROLE || !MASTER_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / WEBHOOK_MASTER_KEY in env');
  Deno.exit(2);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Eval tenant — created once, reused, never deleted ────────
const EVAL_TENANT_NAME = '__eval_tenant__';

async function ensureEvalTenant(): Promise<string> {
  const { data: existing } = await sb
    .from('tenants')
    .select('id')
    .eq('name', EVAL_TENANT_NAME)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await sb
    .from('tenants')
    .insert({
      name: EVAL_TENANT_NAME,
      level: 'demo',
      tenant_path: 'eval',
      timezone: 'Asia/Kolkata',
      preferred_language: 'hi',
    })
    .select('id')
    .single();
  if (error) throw new Error(`tenant insert: ${error.message}`);
  return data.id;
}

const PREG_MAP: Record<string, string> = {
  pregnant: 'pregnant',
  postpartum: 'postpartum',
  not_applicable: 'not_pregnant',
  unknown: 'unknown',
};
const SEX_MAP: Record<string, string> = {
  M: 'M', F: 'F', other: 'Other', unknown: 'Unknown',
};

async function ensureEvalPatient(tenantId: string, c: EvalCase): Promise<string> {
  // Each case gets its own ephemeral patient to keep clinical context isolated.
  const { data, error } = await sb
    .from('patients')
    .insert({
      tenant_id: tenantId,
      full_name: `__eval__${c.id}`,
      // Synthesize a unique fake phone per case (E.164 +91 mobile range 9xxxxxxxxx).
      phone_e164: `+9190000${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`,
      age_years: Math.max(0, Math.round(c.patient.age_years)),
      sex: SEX_MAP[c.patient.sex] ?? 'Unknown',
      preferred_language: c.patient.preferred_language,
      pregnancy_status: PREG_MAP[c.patient.pregnancy_status ?? 'not_applicable'] ?? 'not_pregnant',
      village_name: c.patient.village_name ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`patient insert (${c.id}): ${error.message}`);
  return data.id;
}

async function seedCall(tenantId: string, patientId: string, c: EvalCase): Promise<string> {
  const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const endedAt = new Date().toISOString();
  const { data, error } = await sb
    .from('calls')
    .insert({
      tenant_id: tenantId,
      patient_id: patientId,
      channel: 'voice',
      outcome: 'completed',
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: 240,
      lang_declared: c.patient.preferred_language,
      lang_detected: c.patient.preferred_language,
    })
    .select('id')
    .single();
  if (error) throw new Error(`call insert (${c.id}): ${error.message}`);

  const turnRows = c.transcript.map((t, idx) => ({
    call_id: data.id,
    turn_idx: idx,
    role: t.role,
    transcript: t.text,
    lang: c.patient.preferred_language,
  }));
  if (turnRows.length > 0) {
    const { error: tErr } = await sb.from('turns').insert(turnRows);
    if (tErr) throw new Error(`turns insert (${c.id}): ${tErr.message}`);
  }
  return data.id;
}

async function cleanupCall(callId: string, patientId: string): Promise<void> {
  // Order: turns → triage_decisions → soap_notes → call → patient.
  // RLS service-role bypasses checks; FK cascades cover what we miss.
  await sb.from('turns').delete().eq('call_id', callId);
  await sb.from('triage_decisions').delete().eq('call_id', callId);
  await sb.from('soap_notes').delete().eq('call_id', callId);
  await sb.from('pii_token_map').delete().eq('call_id', callId);
  await sb.from('cross_border_transfers').delete().eq('call_id', callId);
  await sb.from('call_costs').delete().eq('call_id', callId);
  await sb.from('calls').delete().eq('id', callId);
  await sb.from('patients').delete().eq('id', patientId);
}

async function invokeTriage(callId: string): Promise<unknown> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/triage-score`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${MASTER_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ call_id: callId }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`triage-score ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

async function runOne(tenantId: string, c: EvalCase): Promise<CaseResult> {
  const t0 = performance.now();
  let patientId = '';
  let callId = '';
  try {
    patientId = await ensureEvalPatient(tenantId, c);
    callId = await seedCall(tenantId, patientId, c);
    await invokeTriage(callId);
    const latency_ms = Math.round(performance.now() - t0);

    const { data: tr } = await sb
      .from('triage_decisions')
      .select('band, red_flag_categories, presumptive_label, confidence, recommended_action, needs_mo_review, reasoning')
      .eq('call_id', callId)
      .single();
    if (Deno.env.get('EVAL_VERBOSE') === '1') {
      console.log(`\n      [${c.id}] band=${tr?.band} cats=${JSON.stringify(tr?.red_flag_categories)} label=${tr?.presumptive_label} conf=${tr?.confidence}`);
      console.log(`      reasoning: ${(tr?.reasoning ?? '').slice(0, 200)}`);
      console.log(`      action: ${(tr?.recommended_action ?? '').slice(0, 200)}`);
    }

    return scoreCase(c, {
      band: tr?.band ?? null,
      red_flag_categories: tr?.red_flag_categories ?? [],
      presumptive_label: tr?.presumptive_label ?? null,
      confidence: tr?.confidence ?? 0,
      recommended_action: tr?.recommended_action ?? null,
      needs_mo_review: tr?.needs_mo_review ?? null,
      latency_ms,
    });
  } catch (e) {
    const latency_ms = Math.round(performance.now() - t0);
    return {
      case_id: c.id,
      case_title: c.title,
      expected_band: c.expected.band,
      actual_band: null,
      band_match: false,
      expected_categories: c.expected.red_flag_categories,
      actual_categories: [],
      categories_recall: 0,
      categories_precision: 0,
      expected_label: c.expected.presumptive_label
        ? Array.isArray(c.expected.presumptive_label) ? c.expected.presumptive_label : [c.expected.presumptive_label]
        : [],
      actual_label: null,
      label_match: false,
      confidence: 0,
      confidence_pass: false,
      action_must_contain_pass: false,
      action_must_not_contain_pass: false,
      needs_mo_review_match: null,
      latency_ms,
      pass: false,
      failure_reasons: [`runner_error: ${String(e).slice(0, 200)}`],
    };
  } finally {
    if (callId && patientId) {
      try { await cleanupCall(callId, patientId); } catch (e) {
        console.warn(`[cleanup ${c.id}]`, String(e).slice(0, 100));
      }
    }
  }
}

async function loadCases(filter?: string): Promise<EvalCase[]> {
  const cases: EvalCase[] = [];
  const dir = new URL('./cases', import.meta.url).pathname;
  for await (const entry of walk(dir, { exts: ['.yaml', '.yml'], includeDirs: false })) {
    const text = await Deno.readTextFile(entry.path);
    const parsed = parseYaml(text) as EvalCase;
    if (filter && parsed.id !== filter) continue;
    cases.push(parsed);
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return cases;
}

async function main() {
  const filter = Deno.args[0];
  const cases = await loadCases(filter);
  if (cases.length === 0) {
    console.error('No cases found. Did you write any YAMLs under eval/cases/?');
    Deno.exit(2);
  }
  console.log(`Running ${cases.length} case(s)…`);

  const tenantId = await ensureEvalTenant();
  const results: CaseResult[] = [];

  for (const c of cases) {
    process.stdout?.write?.(`  ${c.id} ${c.title.slice(0, 50).padEnd(50)} `);
    const r = await runOne(tenantId, c);
    results.push(r);
    console.log(r.pass ? `✅ ${r.latency_ms}ms` : `❌ ${r.failure_reasons[0] ?? 'fail'} (${r.latency_ms}ms)`);
  }

  const report = aggregate(results);
  const date = new Date().toISOString().slice(0, 10);
  const reportsDir = new URL('./reports/', import.meta.url).pathname;
  await ensureDir(reportsDir);
  await Deno.writeTextFile(join(reportsDir, `${date}.md`), renderReport(report));
  await Deno.writeTextFile(join(reportsDir, `${date}.json`), JSON.stringify(report, null, 2));

  console.log();
  console.log(`Passed ${report.passed}/${report.total_cases}`);
  console.log(`Emergency sensitivity ${(report.metrics.emergency_sensitivity * 100).toFixed(1)}%  (${report.metrics.emergency_total - report.metrics.emergency_missed}/${report.metrics.emergency_total} RED caught · target = 100%)`);
  if (report.metrics.emergency_missed > 0) {
    console.log(`  ⚠️  ${report.metrics.emergency_missed} MISSED EMERGENCY — this is the catastrophic failure mode.`);
  }
  console.log(`RED precision     ${(report.metrics.red_precision * 100).toFixed(1)}%  (reported, not gated)`);
  console.log(`Band exact-match  ${(report.metrics.band_exact_match_pct * 100).toFixed(1)}%  (target ≥ 92%)`);
  console.log(`Red-flag recall   ${(report.metrics.red_flag_recall * 100).toFixed(1)}%  (target ≥ 98%)`);
  console.log(`Red-flag precision ${(report.metrics.red_flag_precision * 100).toFixed(1)}%  (target ≥ 75%)`);
  console.log(`Latency p95       ${report.metrics.latency_p95_ms}ms  (target ≤ 4000ms)`);
  console.log();
  console.log(`Report: eval/reports/${date}.md`);

  // CI gate
  const m = report.metrics;
  const t = report.targets;
  // Emergency sensitivity is the HARD gate — any missed emergency fails CI.
  // RED precision is intentionally NOT gated (we accept false alarms).
  const fail = m.emergency_sensitivity < t.emergency_sensitivity
    || m.band_exact_match_pct < t.band_exact_match_pct
    || m.red_flag_recall < t.red_flag_recall
    || m.red_flag_precision < t.red_flag_precision
    || m.label_match_pct < t.label_match_pct
    || m.action_must_contain_pct < t.action_must_contain_pct
    || m.latency_p95_ms > t.latency_p95_ms;
  Deno.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  Deno.exit(2);
});
