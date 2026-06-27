// eval/shadow-eval.ts — AI Shadow Diagnosis evaluation metrics.
//
// The shadow-diagnosis module stores BOTH the AI recommendation and the
// doctor's final decision in shadow_diagnoses. This script reads the reviewed
// rows and computes the metrics the hackathon problem statement asks for:
//   - Agreement between AI and doctor (overall + accept rate)
//   - Agreement by disease category
//   - Referral accuracy
//   - False-positive referrals (AI referred, doctor did not)
//   - False-negative referrals (AI did not refer, doctor did)
//
// The doctor's decision is treated as ground truth — the AI never overrides it.
//
// Run (with .env.local sourced):
//   deno run --allow-env --allow-net --allow-read --allow-write eval/shadow-eval.ts
//
// Output: eval/reports/shadow-<UTC-date>.md  (+ console)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { ensureDir } from 'https://deno.land/std@0.224.0/fs/ensure_dir.ts';
import { join } from 'https://deno.land/std@0.224.0/path/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env');
  Deno.exit(2);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ShadowRow {
  id: string;
  referral_recommended: boolean | null;
  urgency: string | null;
  doctor_action: string;
  doctor_referral_decision: boolean | null;
  doctor_urgency: string | null;
  triage_decision_id: string | null;
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

async function main() {
  // Pull reviewed shadow opinions (doctor acted) + their triage category.
  const { data: rows, error } = await sb
    .from('shadow_diagnoses')
    .select('id, referral_recommended, urgency, doctor_action, doctor_referral_decision, doctor_urgency, triage_decision_id, triage_decisions(red_flag_categories, presumptive_label)')
    .neq('doctor_action', 'pending');

  if (error) {
    console.error('query failed:', error.message);
    Deno.exit(2);
  }

  const reviewed = (rows ?? []) as Array<ShadowRow & { triage_decisions: any }>;
  const total = reviewed.length;

  // ── Agreement: doctor accepted the AI opinion as-is ──────────────
  const accepted = reviewed.filter((r) => r.doctor_action === 'accepted').length;
  const edited = reviewed.filter((r) => r.doctor_action === 'edited').length;
  const ignored = reviewed.filter((r) => r.doctor_action === 'ignored').length;

  // ── Referral metrics (only rows where the doctor recorded a referral call) ──
  const refRows = reviewed.filter((r) => typeof r.doctor_referral_decision === 'boolean');
  let refAgree = 0, fp = 0, fn = 0;
  for (const r of refRows) {
    const ai = !!r.referral_recommended;
    const dr = !!r.doctor_referral_decision;
    if (ai === dr) refAgree++;
    else if (ai && !dr) fp++;   // AI referred, doctor did not → false positive
    else if (!ai && dr) fn++;   // AI did not refer, doctor did → false negative (the dangerous one)
  }

  // ── Urgency agreement ────────────────────────────────────────────
  const urgRows = reviewed.filter((r) => r.doctor_urgency);
  const urgAgree = urgRows.filter((r) => r.urgency === r.doctor_urgency).length;

  // ── Agreement by disease category ────────────────────────────────
  const byCat = new Map<string, { n: number; refAgree: number; refN: number; accepted: number }>();
  for (const r of reviewed) {
    const cats: string[] = r.triage_decisions?.red_flag_categories?.length
      ? r.triage_decisions.red_flag_categories
      : ['(none / non-emergency)'];
    for (const c of cats) {
      const e = byCat.get(c) ?? { n: 0, refAgree: 0, refN: 0, accepted: 0 };
      e.n++;
      if (r.doctor_action === 'accepted') e.accepted++;
      if (typeof r.doctor_referral_decision === 'boolean') {
        e.refN++;
        if (!!r.referral_recommended === !!r.doctor_referral_decision) e.refAgree++;
      }
      byCat.set(c, e);
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  let md = `# AI Shadow Diagnosis — Evaluation Report\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  if (total === 0) {
    md += `> No reviewed shadow opinions yet (doctor_action is still 'pending' on all rows).\n`;
    md += `> Run some calls through the pipeline and review the AI Clinical Opinion card in the cockpit, then re-run this script.\n`;
    console.log(md);
    await writeReport(md);
    return;
  }

  md += `**${total} reviewed AI opinions.** The doctor's decision is ground truth — the AI never overrides it.\n\n`;
  md += `## Agreement: AI vs doctor\n\n`;
  md += `| Outcome | Count | Share |\n|---|---:|---:|\n`;
  md += `| Accepted as-is (full agreement) | ${accepted} | ${pct(accepted, total)} |\n`;
  md += `| Edited (partial agreement) | ${edited} | ${pct(edited, total)} |\n`;
  md += `| Ignored | ${ignored} | ${pct(ignored, total)} |\n`;
  md += `| Urgency agreement | ${urgAgree} | ${pct(urgAgree, urgRows.length)} |\n\n`;

  md += `## Referral accuracy (doctor decision = ground truth)\n\n`;
  md += `Scored over ${refRows.length} rows where the doctor recorded a referral decision.\n\n`;
  md += `| Metric | Value |\n|---|---:|\n`;
  md += `| Referral agreement | ${pct(refAgree, refRows.length)} |\n`;
  md += `| **False-positive referrals** (AI referred, doctor did not) | ${fp} (${pct(fp, refRows.length)}) |\n`;
  md += `| **False-negative referrals** (AI missed a referral the doctor made) | ${fn} (${pct(fn, refRows.length)}) |\n\n`;
  md += `> False negatives are the dangerous class — an AI that under-refers. We watch this number hardest.\n\n`;

  md += `## Agreement by disease category\n\n`;
  md += `| Category | Reviewed | Accepted as-is | Referral agreement |\n|---|---:|---:|---:|\n`;
  for (const [cat, e] of Array.from(byCat).sort((a, b) => b[1].n - a[1].n)) {
    md += `| ${cat} | ${e.n} | ${pct(e.accepted, e.n)} | ${pct(e.refAgree, e.refN)} |\n`;
  }
  md += `\n`;

  console.log(md);
  await writeReport(md);
}

async function writeReport(md: string) {
  const date = new Date().toISOString().slice(0, 10);
  const reportsDir = new URL('./reports/', import.meta.url).pathname;
  await ensureDir(reportsDir);
  await Deno.writeTextFile(join(reportsDir, `shadow-${date}.md`), md);
  console.log(`Report: eval/reports/shadow-${date}.md`);
}

main().catch((e) => { console.error(e); Deno.exit(2); });
