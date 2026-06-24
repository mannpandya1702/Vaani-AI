// eval/gp-benchmark/compare.ts
//
// Compares AI vs Junior GP vs Senior MO scores per case. Outputs agreement
// metrics + Cohen's kappa for band field.
//
// Run after eval/run.ts has populated ai-scores/ and the human scorers have
// populated gp-responses/ and gold-labels/.
//
// Usage:
//   deno run --allow-read --allow-write eval/gp-benchmark/compare.ts

import { parse as parseYaml } from 'https://deno.land/std@0.224.0/yaml/parse.ts';
import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

const ROOT = new URL('.', import.meta.url).pathname;

interface Score {
  case_id: string;
  band: 'RED' | 'AMBER' | 'GREEN';
  presumptive_screening_label: string;
  red_flag_categories: string[];
  differential_list?: Array<{ label: string }>;
}

async function loadDir(sub: string): Promise<Record<string, Score>> {
  const out: Record<string, Score> = {};
  try {
    for await (const entry of walk(`${ROOT}/${sub}`, { exts: ['.yaml', '.yml', '.json'] })) {
      const text = await Deno.readTextFile(entry.path);
      const parsed = entry.path.endsWith('.json')
        ? JSON.parse(text)
        : parseYaml(text) as Score;
      out[parsed.case_id] = parsed;
    }
  } catch { /* dir may not exist yet */ }
  return out;
}

function cohenKappa(a: string[], b: string[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  // Observed agreement
  const po = a.filter((x, i) => x === b[i]).length / a.length;
  // Expected agreement under chance
  const labels = Array.from(new Set([...a, ...b]));
  let pe = 0;
  for (const l of labels) {
    const pa = a.filter((x) => x === l).length / a.length;
    const pb = b.filter((x) => x === l).length / b.length;
    pe += pa * pb;
  }
  if (pe === 1) return 1;
  return (po - pe) / (1 - pe);
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a.map((x) => x.toLowerCase()));
  const B = new Set(b.map((x) => x.toLowerCase()));
  const inter = Array.from(A).filter((x) => B.has(x)).length;
  const union = new Set([...a, ...b].map((x) => x.toLowerCase())).size;
  return union === 0 ? 1 : inter / union;
}

async function main() {
  const ai = await loadDir('ai-scores');
  const gp = await loadDir('gp-responses');
  const gold = await loadDir('gold-labels');

  const caseIds = Object.keys(gp).filter((id) => ai[id] && gold[id]);
  if (caseIds.length === 0) {
    console.error('No overlapping cases with AI + GP + Gold. Populate all three folders first.');
    console.error(`  ai-scores/: ${Object.keys(ai).length} files`);
    console.error(`  gp-responses/: ${Object.keys(gp).length} files`);
    console.error(`  gold-labels/: ${Object.keys(gold).length} files`);
    Deno.exit(2);
  }

  const aiBands = caseIds.map((id) => ai[id].band);
  const gpBands = caseIds.map((id) => gp[id].band);
  const goldBands = caseIds.map((id) => gold[id].band);

  const aiVsGold = aiBands.filter((x, i) => x === goldBands[i]).length / caseIds.length;
  const gpVsGold = gpBands.filter((x, i) => x === goldBands[i]).length / caseIds.length;
  const kappaAi = cohenKappa(aiBands, goldBands);
  const kappaGp = cohenKappa(gpBands, goldBands);

  const labelAi = caseIds.filter((id) => ai[id].presumptive_screening_label === gold[id].presumptive_screening_label).length / caseIds.length;
  const labelGp = caseIds.filter((id) => gp[id].presumptive_screening_label === gold[id].presumptive_screening_label).length / caseIds.length;

  const diffAi = caseIds.map((id) =>
    jaccard(
      (ai[id].differential_list ?? []).map((d) => d.label),
      (gold[id].differential_list ?? []).map((d) => d.label),
    )).reduce((a, b) => a + b, 0) / caseIds.length;
  const diffGp = caseIds.map((id) =>
    jaccard(
      (gp[id].differential_list ?? []).map((d) => d.label),
      (gold[id].differential_list ?? []).map((d) => d.label),
    )).reduce((a, b) => a + b, 0) / caseIds.length;

  console.log(`\nCompared ${caseIds.length} cases.\n`);
  console.log(`Band agreement vs Senior MO gold:`);
  console.log(`  AI:        ${(aiVsGold * 100).toFixed(1)}%   κ=${kappaAi.toFixed(2)}`);
  console.log(`  Junior GP: ${(gpVsGold * 100).toFixed(1)}%   κ=${kappaGp.toFixed(2)}`);
  console.log();
  console.log(`Presumptive-label exact-match vs gold:`);
  console.log(`  AI:        ${(labelAi * 100).toFixed(1)}%`);
  console.log(`  Junior GP: ${(labelGp * 100).toFixed(1)}%`);
  console.log();
  console.log(`Differential top-3 Jaccard vs gold:`);
  console.log(`  AI:        ${(diffAi * 100).toFixed(1)}%`);
  console.log(`  Junior GP: ${(diffGp * 100).toFixed(1)}%`);
  console.log();
  console.log(`Verdict: AI ${aiVsGold >= gpVsGold ? '≥' : '<'} Junior GP on band agreement.`);
}

main().catch((e) => { console.error(e); Deno.exit(2); });
