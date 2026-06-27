// PopulationHealth.tsx
// ╔════════════════════════════════════════════════════════════════╗
// ║  Clinic-administrator population-health analytics.              ║
// ║                                                                 ║
// ║  Dependency-free (no map/chart libraries) — every visual is     ║
// ║  inline SVG / CSS so it adds zero bundle weight and matches the ║
// ║  existing styling. Uses the real patient geo fields             ║
// ║  (village_name / district) from the live feed where present,    ║
// ║  blended with a deterministic demo dataset so the dashboards    ║
// ║  are populated for the prototype.                               ║
// ║                                                                 ║
// ║  Views: interactive village/district map · symptom-cluster      ║
// ║  heatmap · disease trends · top symptoms · high-risk patients · ║
// ║  referral stats · red-flag counts · village distribution.       ║
// ║  Filters: date · disease · risk level · village.                ║
// ╚════════════════════════════════════════════════════════════════╝

import { useMemo, useState, type ReactNode } from 'react';
import {
  Map as MapIcon, Activity, TrendingUp, AlertTriangle, ArrowUpRight,
  Users, Filter, Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { bandClasses, type CockpitRow, type TriageBand } from '@/pages/Cockpit';

/* ─── Domain ─────────────────────────────────────────────── */

interface PHRecord {
  id: string;
  name: string;
  village: string;
  district: string;
  symptom: string;
  disease: string;
  band: TriageBand;
  redFlag: string | null;
  referred: boolean;
  date: string; // ISO
  age: number;
  sex: 'M' | 'F';
  live: boolean;
}

const VILLAGES = [
  { name: 'Rampur', district: 'Sitapur', x: 20, y: 28 },
  { name: 'Bansgaon', district: 'Sitapur', x: 44, y: 20 },
  { name: 'Khairabad', district: 'Sitapur', x: 68, y: 32 },
  { name: 'Mahmudabad', district: 'Hardoi', x: 30, y: 56 },
  { name: 'Pisawan', district: 'Hardoi', x: 56, y: 60 },
  { name: 'Biswan', district: 'Sitapur', x: 80, y: 52 },
  { name: 'Laharpur', district: 'Hardoi', x: 26, y: 82 },
  { name: 'Tambaur', district: 'Sitapur', x: 62, y: 84 },
];

const DISEASES = [
  { symptom: 'Fever', disease: 'dengue / viral fever', redFlag: 'fever_high_risk', weight: 6 },
  { symptom: 'Cough', disease: 'TB suspect', redFlag: 'hemoptysis', weight: 4 },
  { symptom: 'Diarrhoea', disease: 'gastroenteritis', redFlag: 'dehydration_severe', weight: 4 },
  { symptom: 'Body ache', disease: 'malaria suspect', redFlag: 'fever_high_risk', weight: 3 },
  { symptom: 'Breathlessness', disease: 'asthma / COPD', redFlag: 'respiratory', weight: 2 },
  { symptom: 'Chest pain', disease: 'ACS suspect', redFlag: 'cardiac', weight: 2 },
  { symptom: 'Headache', disease: 'pre-eclampsia (ANC)', redFlag: 'preeclampsia_eclampsia', weight: 2 },
  { symptom: 'Abdominal pain', disease: 'acute abdomen', redFlag: 'gi_acute', weight: 2 },
  { symptom: 'Weakness', disease: 'anaemia', redFlag: null, weight: 2 },
  { symptom: 'Skin rash', disease: 'dermatitis', redFlag: null, weight: 1 },
];

const DAY = 86_400_000;

/* ─── Deterministic demo dataset (seeded; stable across renders) ─ */

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genDemo(now: number): PHRecord[] {
  const r = mulberry32(42);
  const first = ['Sunita', 'Ramesh', 'Lakshmi', 'Mohan', 'Geeta', 'Arjun', 'Kavita', 'Suresh', 'Pooja', 'Rakesh', 'Anita', 'Vijay', 'Meena', 'Dinesh', 'Radha', 'Kamla'];
  const last = ['Devi', 'Yadav', 'Kumar', 'Singh', 'Verma', 'Lal', 'Bai', 'Prasad'];
  const pool: typeof DISEASES = [];
  for (const d of DISEASES) for (let i = 0; i < d.weight; i++) pool.push(d);
  const out: PHRecord[] = [];
  for (let i = 0; i < 140; i++) {
    const v = VILLAGES[Math.floor(r() * VILLAGES.length)];
    const d = pool[Math.floor(r() * pool.length)];
    const band: TriageBand = r() < 0.12 ? 'RED' : r() < 0.45 ? 'AMBER' : 'GREEN';
    const daysAgo = Math.floor(r() * 21);
    const referred = band === 'RED' ? r() < 0.85 : band === 'AMBER' ? r() < 0.3 : r() < 0.04;
    const redFlag = band === 'RED' ? d.redFlag : band === 'AMBER' && r() < 0.3 ? d.redFlag : null;
    out.push({
      id: `demo-${i}`,
      name: `${first[Math.floor(r() * first.length)]} ${last[Math.floor(r() * last.length)]}`,
      village: v.name, district: v.district,
      symptom: d.symptom, disease: d.disease,
      band, redFlag, referred,
      date: new Date(now - daysAgo * DAY).toISOString(),
      age: 3 + Math.floor(r() * 75), sex: r() < 0.5 ? 'M' : 'F',
      live: false,
    });
  }
  return out;
}

function mapLive(rows: CockpitRow[]): PHRecord[] {
  return rows.filter((r) => r.patient).map((r) => ({
    id: r.triage.id,
    name: r.patient!.full_name?.trim() || 'Unknown',
    village: r.patient!.village_name?.trim() || 'Unmapped',
    district: '—',
    symptom: (r.triage.presumptive_label ?? 'other').replace(/_/g, ' '),
    disease: (r.soap?.presumptive_screening_label ?? r.triage.presumptive_label ?? 'other').replace(/_/g, ' '),
    band: r.triage.band,
    redFlag: (r.triage.red_flag_categories ?? [])[0] ?? null,
    referred: r.shadow?.referral_recommended ?? (r.triage.band === 'RED'),
    date: r.triage.created_at,
    age: r.patient!.age_years ?? 0,
    sex: (r.patient!.sex as 'M' | 'F') ?? 'M',
    live: true,
  }));
}

/* ─── Tiny chart primitives (SVG / CSS) ───────────────────── */

function Bars({ data, color }: { data: { label: string; value: number; tint?: string }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-muted-foreground" title={d.label}>{d.label}</span>
          <div className="flex-1 h-3 rounded-full bg-foreground/5 overflow-hidden">
            <div className={cn('h-full rounded-full', d.tint ?? color ?? 'bg-primary')} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-7 text-right font-medium tabular-nums">{d.value}</span>
        </div>
      ))}
      {data.length === 0 && <p className="text-xs text-muted-foreground">No data for this filter.</p>}
    </div>
  );
}

function LineChart({ series, days }: { series: { name: string; color: string; points: number[] }[]; days: number }) {
  const W = 320, H = 110, pad = 6;
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const x = (i: number) => pad + (i / Math.max(1, days - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={pad} x2={W - pad} y1={H - pad - g * (H - pad * 2)} y2={H - pad - g * (H - pad * 2)} className="stroke-foreground/10" strokeWidth={0.5} />
        ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"
            points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

const BAND_HEX: Record<TriageBand, string> = { RED: '#ef4444', AMBER: '#f59e0b', GREEN: '#10b981' };

/* ─── Main ─────────────────────────────────────────────────── */

export default function PopulationHealth({ liveRows = [] }: { liveRows?: CockpitRow[] }) {
  const now = useMemo(() => Date.now(), []);
  const all = useMemo(() => [...mapLive(liveRows), ...genDemo(now)], [liveRows, now]);

  const [days, setDays] = useState(21);
  const [disease, setDisease] = useState('all');
  const [risk, setRisk] = useState<'all' | TriageBand>('all');
  const [village, setVillage] = useState('all');

  const filtered = useMemo(() => {
    const cutoff = now - days * DAY;
    return all.filter((r) =>
      new Date(r.date).getTime() >= cutoff &&
      (disease === 'all' || r.symptom === disease) &&
      (risk === 'all' || r.band === risk) &&
      (village === 'all' || r.village === village),
    );
  }, [all, now, days, disease, risk, village]);

  // Aggregations
  const total = filtered.length;
  const redFlags = filtered.filter((r) => r.redFlag).length;
  const referrals = filtered.filter((r) => r.referred).length;
  const highRisk = filtered.filter((r) => r.band === 'RED');
  const liveCount = filtered.filter((r) => r.live).length;

  const byVillage = useMemo(() => {
    const m = new Map<string, { count: number; bands: Record<TriageBand, number> }>();
    for (const r of filtered) {
      const e = m.get(r.village) ?? { count: 0, bands: { RED: 0, AMBER: 0, GREEN: 0 } };
      e.count++; e.bands[r.band]++;
      m.set(r.village, e);
    }
    return m;
  }, [filtered]);

  const bySymptom = useMemo(() => tally(filtered, (r) => r.symptom), [filtered]);
  const byRedFlag = useMemo(() => tally(filtered.filter((r) => r.redFlag), (r) => r.redFlag!), [filtered]);

  // Symptom × village heatmap (top symptoms × mapped villages)
  const topSymptoms = bySymptom.slice(0, 6).map((s) => s.label);
  const heat = useMemo(() => {
    const grid: Record<string, Record<string, number>> = {};
    for (const s of topSymptoms) grid[s] = {};
    for (const r of filtered) {
      if (!topSymptoms.includes(r.symptom)) continue;
      grid[r.symptom][r.village] = (grid[r.symptom][r.village] ?? 0) + 1;
    }
    return grid;
  }, [filtered, topSymptoms]);
  const heatMax = Math.max(1, ...topSymptoms.flatMap((s) => VILLAGES.map((v) => heat[s]?.[v.name] ?? 0)));

  // Disease trend lines (top-3 symptoms over the window)
  const trend = useMemo(() => {
    const top3 = bySymptom.slice(0, 3);
    const colors = ['#6366f1', '#ef4444', '#10b981'];
    return top3.map((s, i) => {
      const pts: number[] = Array.from({ length: days }, () => 0);
      for (const r of filtered) {
        if (r.symptom !== s.label) continue;
        const d = Math.floor((now - new Date(r.date).getTime()) / DAY);
        const idx = days - 1 - d;
        if (idx >= 0 && idx < days) pts[idx]++;
      }
      return { name: s.label, color: colors[i] ?? '#888', points: pts };
    });
  }, [filtered, bySymptom, days, now]);

  const filtersActive = disease !== 'all' || risk !== 'all' || village !== 'all' || days !== 21;

  return (
    <section className="space-y-5">
      {/* Filters */}
      <div className="rounded-2xl border bg-card p-3 flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select label="Date" value={String(days)} onChange={(v) => setDays(Number(v))}
          options={[['7', 'Last 7 days'], ['14', 'Last 14 days'], ['21', 'Last 21 days']]} />
        <Select label="Disease" value={disease} onChange={setDisease}
          options={[['all', 'All symptoms'], ...DISEASES.map((d) => [d.symptom, d.symptom] as [string, string])]} />
        <Select label="Risk" value={risk} onChange={(v) => setRisk(v as any)}
          options={[['all', 'All risk'], ['RED', 'RED'], ['AMBER', 'AMBER'], ['GREEN', 'GREEN']]} />
        <Select label="Village" value={village} onChange={setVillage}
          options={[['all', 'All villages'], ...VILLAGES.map((v) => [v.name, `${v.name} (${v.district})`] as [string, string])]} />
        {filtersActive && (
          <button onClick={() => { setDays(21); setDisease('all'); setRisk('all'); setVillage('all'); }}
            className="text-xs text-muted-foreground hover:text-foreground underline ml-1">Reset</button>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {liveCount > 0 ? `${liveCount} live + ${total - liveCount} demo` : 'demo data (real geo schema)'}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={Users} label="Patients screened" value={total} tint="text-foreground" />
        <KPI icon={Flame} label="Red-flag cases" value={redFlags} tint="text-red-600 dark:text-red-400" sub={`${pct(redFlags, total)} of total`} />
        <KPI icon={ArrowUpRight} label="Referrals" value={referrals} tint="text-indigo-600 dark:text-indigo-400" sub={`${pct(referrals, total)} referral rate`} />
        <KPI icon={AlertTriangle} label="High-risk (RED)" value={highRisk.length} tint="text-amber-600 dark:text-amber-400" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Interactive map */}
        <Panel title="Village / District map" icon={MapIcon} note="schematic — click a village to filter">
          <svg viewBox="0 0 100 100" className="w-full h-auto rounded-lg bg-emerald-500/5 border">
            {VILLAGES.map((v) => {
              const e = byVillage.get(v.name);
              const count = e?.count ?? 0;
              const dom: TriageBand = e ? (['RED', 'AMBER', 'GREEN'] as TriageBand[]).reduce((a, b) => e.bands[b] > e.bands[a] ? b : a, 'GREEN') : 'GREEN';
              const rad = 2 + Math.sqrt(count) * 1.6;
              const active = village === v.name;
              return (
                <g key={v.name} className="cursor-pointer" onClick={() => setVillage(active ? 'all' : v.name)}>
                  <circle cx={v.x} cy={v.y} r={rad} fill={BAND_HEX[dom]} fillOpacity={active ? 0.85 : 0.45}
                    stroke={BAND_HEX[dom]} strokeWidth={active ? 1 : 0.4} />
                  <text x={v.x} y={v.y - rad - 1.2} textAnchor="middle" className="fill-foreground" fontSize={3}>{v.name}</text>
                  <text x={v.x} y={v.y + 1} textAnchor="middle" className="fill-background font-bold" fontSize={3}>{count}</text>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <Legend hex={BAND_HEX.RED} label="RED-dominant" />
            <Legend hex={BAND_HEX.AMBER} label="AMBER" />
            <Legend hex={BAND_HEX.GREEN} label="GREEN" />
            <span className="ml-auto">bubble size ∝ cases</span>
          </div>
        </Panel>

        {/* Symptom-cluster heatmap */}
        <Panel title="Symptom-cluster heatmap" icon={Flame} note="symptom × village density">
          <div className="overflow-x-auto">
            <table className="text-[11px] border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th></th>
                  {VILLAGES.map((v) => (
                    <th key={v.name} className="font-normal text-muted-foreground align-bottom">
                      <div className="rotate-180 [writing-mode:vertical-rl] h-12 mx-auto">{v.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topSymptoms.map((s) => (
                  <tr key={s}>
                    <td className="pr-1 text-right text-muted-foreground whitespace-nowrap">{s}</td>
                    {VILLAGES.map((v) => {
                      const c = heat[s]?.[v.name] ?? 0;
                      return (
                        <td key={v.name}>
                          <div title={`${s} · ${v.name}: ${c}`} className="w-6 h-6 rounded grid place-items-center text-foreground/70"
                            style={{ background: `rgba(239,68,68,${c === 0 ? 0.04 : 0.15 + (c / heatMax) * 0.7})` }}>
                            {c > 0 ? c : ''}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Disease trends */}
        <Panel title="Disease trends over time" icon={TrendingUp} note={`daily cases · last ${days} days`}>
          <LineChart series={trend} days={days} />
        </Panel>

        {/* Top symptoms */}
        <Panel title="Top reported symptoms" icon={Activity}>
          <Bars data={bySymptom.slice(0, 7)} color="bg-indigo-500" />
        </Panel>

        {/* Village distribution */}
        <Panel title="Village-wise patient distribution" icon={Users}>
          <Bars
            data={VILLAGES.map((v) => ({ label: `${v.name}`, value: byVillage.get(v.name)?.count ?? 0 }))
              .sort((a, b) => b.value - a.value)}
            color="bg-emerald-500"
          />
        </Panel>

        {/* Red-flag counts */}
        <Panel title="Red-flag case counts" icon={Flame} note="by category">
          <Bars data={byRedFlag.slice(0, 7).map((d) => ({ ...d, tint: 'bg-red-500' }))} />
        </Panel>

        {/* Referral statistics */}
        <Panel title="Referral statistics" icon={ArrowUpRight}>
          <div className="flex items-center gap-4">
            <Donut referred={referrals} total={total} />
            <div className="text-sm space-y-1">
              <div><span className="font-semibold text-indigo-600 dark:text-indigo-400">{referrals}</span> referred ({pct(referrals, total)})</div>
              <div className="text-muted-foreground">{total - referrals} managed locally</div>
              <div className="text-xs text-muted-foreground mt-1">RED referral rate: {pct(highRisk.filter((r) => r.referred).length, highRisk.length)}</div>
            </div>
          </div>
        </Panel>

        {/* High-risk patients */}
        <Panel title="High-risk patients" icon={AlertTriangle} note={`${highRisk.length} RED`}>
          <ul className="space-y-1.5 max-h-56 overflow-y-auto">
            {highRisk.slice(0, 12).map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-xs">
                <span className={cn('w-1.5 h-1.5 rounded-full', bandClasses('RED').dot)} />
                <span className="font-medium truncate">{r.name}</span>
                {r.live && <span className="text-[9px] uppercase rounded bg-foreground/5 px-1">live</span>}
                <span className="text-muted-foreground truncate">{r.disease}</span>
                <span className="ml-auto text-muted-foreground whitespace-nowrap">{r.village}</span>
              </li>
            ))}
            {highRisk.length === 0 && <li className="text-xs text-muted-foreground">No high-risk patients in this filter.</li>}
          </ul>
        </Panel>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Prototype analytics. Demo dataset uses the real schema fields (village_name / district_code / state_code / pin_code);
        live screenings from the feed are folded into the totals and tagged <span className="font-medium">live</span>.
      </p>
    </section>
  );
}

/* ─── Small presentational helpers ─────────────────────────── */

function tally(rows: PHRecord[], key: (r: PHRecord) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function pct(n: number, d: number) { return d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`; }

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/30">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function KPI({ icon: Icon, label, value, sub, tint }: { icon: typeof Users; label: string; value: number; sub?: string; tint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className={cn('w-3.5 h-3.5', tint)} />{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Panel({ title, icon: Icon, note, children }: { title: string; icon: typeof Users; note?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{title}</span>
        {note && <span className="ml-auto text-[11px] text-muted-foreground">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Legend({ hex, label }: { hex: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: hex }} />{label}</span>;
}

function Donut({ referred, total }: { referred: number; total: number }) {
  const frac = total === 0 ? 0 : referred / total;
  const R = 18, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 44 44" className="w-20 h-20 -rotate-90">
      <circle cx={22} cy={22} r={R} fill="none" stroke="currentColor" className="text-foreground/10" strokeWidth={6} />
      <circle cx={22} cy={22} r={R} fill="none" stroke="#6366f1" strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${frac * C} ${C}`} />
      <text x={22} y={22} textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-foreground font-semibold" fontSize={9} style={{ transformOrigin: 'center' }}>
        {pct(referred, total)}
      </text>
    </svg>
  );
}
