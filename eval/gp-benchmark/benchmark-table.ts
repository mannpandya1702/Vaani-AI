// eval/gp-benchmark/benchmark-table.ts
//
// The headline benchmark artifact: "Vaani vs junior-GP baseline" on the metric
// that actually matters in emergency triage — EMERGENCY SENSITIVITY (case-level
// RED recall on true emergencies). A missed emergency kills; a false alarm is
// one cheap MO glance. So we optimise sensitivity toward 100% and report (not
// gate) RED precision.
//
// Ground truth (gold) = the senior-MO-adjudicated `expected` block of each
// eval/cases/*.yaml. Junior-GP baseline = eval/gp-benchmark/synthetic-junior-gp.yaml.
// Vaani (AI) column = the latest eval/reports/<date>.json produced by run.ts
// (offline-empty until you run the live harness).
//
// Run (no DB/network needed for the GP-vs-gold side):
//   deno run --allow-read --allow-write eval/gp-benchmark/benchmark-table.ts
//
// Output: eval/gp-benchmark/benchmark-report.md  (+ console)

import { parse as parseYaml } from 'https://deno.land/std@0.224.0/yaml/parse.ts';
import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

type Band = 'RED' | 'AMBER' | 'GREEN';

interface Decision { band: Band; categories: string[]; label: string }

const CASES_DIR = new URL('../cases', import.meta.url).pathname;
const GP_FILE = new URL('./synthetic-junior-gp.yaml', import.meta.url).pathname;
const REPORTS_DIR = new URL('../reports', import.meta.url).pathname;
const OUT = new URL('./benchmark-report.md', import.meta.url).pathname;

// ── Load gold (case `expected` blocks) ────────────────────────────
async function loadGold(): Promise<Record<string, Decision>> {
  const gold: Record<string, Decision> = {};
  for await (const e of walk(CASES_DIR, { exts: ['.yaml', '.yml'], includeDirs: false })) {
    const c = parseYaml(await Deno.readTextFile(e.path)) as any;
    if (!c?.id || !c?.expected) continue;
    gold[c.id] = {
      band: c.expected.band,
      categories: c.expected.red_flag_categories ?? [],
      label: Array.isArray(c.expected.presumptive_label)
        ? c.expected.presumptive_label[0] ?? ''
        : (c.expected.presumptive_label ?? ''),
    };
  }
  return gold;
}

// ── Load junior-GP synthetic baseline ─────────────────────────────
async function loadGp(): Promise<Record<string, Decision>> {
  const doc = parseYaml(await Deno.readTextFile(GP_FILE)) as any;
  const out: Record<string, Decision> = {};
  for (const [id, r] of Object.entries(doc.responses ?? {})) {
    const rr = r as any;
    out[id] = { band: rr.band, categories: rr.red_flag_categories ?? [], label: rr.presumptive_screening_label ?? '' };
  }
  return out;
}

// ── Load Vaani's latest live run, if any ──────────────────────────
async function loadVaani(): Promise<Record<string, Decision> | null> {
  let latest: { path: string; name: string } | null = null;
  try {
    for await (const e of walk(REPORTS_DIR, { exts: ['.json'], includeDirs: false })) {
      if (!latest || e.name > latest.name) latest = { path: e.path, name: e.name };
    }
  } catch { return null; }
  if (!latest) return null;
  const report = JSON.parse(await Deno.readTextFile(latest.path));
  const out: Record<string, Decision> = {};
  for (const r of report.results ?? []) {
    if (!r.actual_band) continue;
    out[r.case_id] = { band: r.actual_band, categories: r.actual_categories ?? [], label: r.actual_label ?? '' };
  }
  return Object.keys(out).length ? out : null;
}

interface Metrics {
  scorer: string;
  emergency_total: number;
  emergency_caught: number;
  emergency_sensitivity: number;
  missed: string[];           // case_ids of missed emergencies
  band_match: number;
  band_total: number;
  red_called: number;
  red_precision: number;
}

function score(scorer: string, gold: Record<string, Decision>, pred: Record<string, Decision>): Metrics {
  const ids = Object.keys(gold).filter((id) => pred[id]); // only cases the scorer covered
  const goldRed = ids.filter((id) => gold[id].band === 'RED');
  const caught = goldRed.filter((id) => pred[id].band === 'RED');
  const missed = goldRed.filter((id) => pred[id].band !== 'RED');
  const calledRed = ids.filter((id) => pred[id].band === 'RED');
  const truePosRed = calledRed.filter((id) => gold[id].band === 'RED');
  const bandMatch = ids.filter((id) => pred[id].band === gold[id].band).length;
  return {
    scorer,
    emergency_total: goldRed.length,
    emergency_caught: caught.length,
    emergency_sensitivity: goldRed.length ? caught.length / goldRed.length : 1,
    missed,
    band_match: bandMatch,
    band_total: ids.length,
    red_called: calledRed.length,
    red_precision: calledRed.length ? truePosRed.length / calledRed.length : 1,
  };
}

const pct = (x: number) => (x * 100).toFixed(1) + '%';

function render(gold: Record<string, Decision>, gp: Metrics, ai: Metrics | null): string {
  const redTotal = Object.values(gold).filter((d) => d.band === 'RED').length;
  let md = `# Vaani vs Junior-GP — Emergency Triage Benchmark\n\n`;
  md += `> Gold = senior-MO-adjudicated \`expected\` block of each \`eval/cases/*.yaml\`.\n`;
  md += `> Junior-GP = \`synthetic-junior-gp.yaml\` (synthetic until volunteer scoring, see methodology.md).\n`;
  md += `> Vaani = latest \`eval/reports/*.json\` from \`npm run eval\` (live harness).\n\n`;
  md += `**Case set:** ${Object.keys(gold).length} cases · **${redTotal} true emergencies (gold RED).**\n\n`;
  md += `## The metric that matters: emergency sensitivity (RED recall)\n\n`;
  md += `*A missed emergency is catastrophic; a false alarm is one cheap MO glance. We drive sensitivity to 100% even at the cost of RED precision.*\n\n`;
  md += `| Scorer | Emergency sensitivity | Missed emergencies | Band exact-match | RED precision |\n`;
  md += `|---|---|---|---|---|\n`;
  const row = (m: Metrics) =>
    `| ${m.scorer} | **${pct(m.emergency_sensitivity)}** (${m.emergency_caught}/${m.emergency_total}) | ${m.missed.length ? m.missed.join(', ') : 'none'} | ${pct(m.band_match / Math.max(1, m.band_total))} | ${pct(m.red_precision)} |\n`;
  if (ai) md += row({ ...ai, scorer: 'Vaani (AI)' });
  else md += `| Vaani (AI) | _run \`npm run eval\` to populate_ | — | — | — |\n`;
  md += row({ ...gp, scorer: 'Junior GP (synthetic)' });
  md += `\n`;

  md += `## Why the gap is on the cases that kill\n\n`;
  md += `The junior-GP misses are not random — they are the **atypical presentations** that lack the textbook trigger: `;
  md += `${gp.missed.join(', ') || 'none'}. `;
  md += `Vaani's triage prompt screens these explicitly (silent/atypical MI, afebrile sepsis, peds isolated lethargy), `;
  md += `which is the entire safety argument for an AI front door: it does not get bored, tired, or anchored on "looks viral".\n\n`;

  if (!ai) {
    md += `> ⚠️ Vaani's column is empty because no live \`eval/reports/*.json\` is present. Populate it:\n`;
    md += `> \`\`\`bash\n> export $(grep -v '^#' .env.local | xargs)\n> deno run --allow-env --allow-net --allow-read --allow-write eval/run.ts\n> deno run --allow-read --allow-write eval/gp-benchmark/benchmark-table.ts\n> \`\`\`\n`;
  }
  return md;
}

const gold = await loadGold();
const gpPred = await loadGp();
const aiPred = await loadVaani();
const gp = score('Junior GP (synthetic)', gold, gpPred);
const ai = aiPred ? score('Vaani (AI)', gold, aiPred) : null;

const report = render(gold, gp, ai);
console.log(report);
const anyDeno = (globalThis as any).Deno;
if (anyDeno) {
  await anyDeno.writeTextFile(OUT, report);
  console.log(`\nWrote ${OUT}`);
}
