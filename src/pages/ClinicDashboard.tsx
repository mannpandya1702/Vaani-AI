// ClinicDashboard.tsx
// ╔════════════════════════════════════════════════════════════════╗
// ║  Clinic-wide / future-capability surface — SEPARATE from the    ║
// ║  Doctor Cockpit (which stays focused on review + approval).     ║
// ║                                                                 ║
// ║  Sections:                                                      ║
// ║   A. In-Visit Consultation — ambient transcription + live SOAP  ║
// ║      autofill demo (prototype, sample data).                    ║
// ║   B. Outbound Communication Queue — post-approval callbacks,    ║
// ║      derived from the live cockpit feed where data exists,      ║
// ║      else realistic demo rows.                                  ║
// ║                                                                 ║
// ║  Everything here is clearly labelled prototype/demo. No change  ║
// ║  to the doctor workflow.                                        ║
// ╚════════════════════════════════════════════════════════════════╝

import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Stethoscope, Radio, PhoneOutgoing, Play, MessageSquare,
  FileText, Volume2, X, CheckCircle2, Clock, Send, Sparkles,
  Users, ClipboardCheck, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCockpitFeed, bandClasses, timeAgo, DemoDisclosureChip,
  type CockpitRow,
} from '@/pages/Cockpit';
import PopulationHealth from '@/components/PopulationHealth';

const RMP_NAME = (import.meta as any).env?.VITE_RMP_NAME ?? 'डॉक्टर साहब';

/* ─────────────────────────────────────────────────────────── */
/* Page shell                                                  */

type ClinicTab = 'ops' | 'population';

export default function ClinicDashboard() {
  const [tab, setTab] = useState<ClinicTab>('ops');
  const { data } = useCockpitFeed();
  const liveRows = data?.rows ?? [];

  const TABS: { key: ClinicTab; label: string; icon: typeof Users; hint: string }[] = [
    { key: 'ops', label: 'Clinic Operations', icon: ClipboardCheck, hint: 'In-visit notes & callbacks' },
    { key: 'population', label: 'Population Health', icon: BarChart3, hint: 'Village trends & risk map' },
  ];

  const signedToday = liveRows.filter((r) => r.soap?.mo_signed_at).length;
  const redToday = liveRows.filter((r) => r.triage?.band === 'RED').length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border/70 px-4 py-3 flex items-center gap-3 sticky top-0 bg-background/85 backdrop-blur-md z-40">
        <span className="vaani-bindi-pulse" aria-hidden />
        <span className="font-bold tracking-tight">vaani</span>
        <span className="text-sm font-medium text-muted-foreground hidden sm:inline">· clinic</span>
        <NavLink
          to="/cockpit"
          className="ml-2 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Doctor Cockpit
        </NavLink>
        <DemoDisclosureChip />
      </header>

      <main className="flex-1 overflow-y-auto pb-16">
        {/* Hero */}
        <section className="vaani-mesh text-vaani-paper">
          <div className="container max-w-6xl py-10 md:py-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-vaani-paper/20 bg-vaani-paper/5 px-3 py-1 text-xs font-medium text-vaani-paper/80 mb-5">
              <Sparkles className="w-3.5 h-3.5 text-vaani-saffron" /> Clinic command centre
            </span>
            <h1 className="text-3xl md:text-[2.6rem] leading-tight font-bold tracking-tight">
              Your clinic, <span className="vaani-gradient-text">at a glance.</span>
            </h1>
            <p className="mt-3 text-[15px] md:text-base text-vaani-paper/80 leading-relaxed max-w-2xl">
              Ambient note-taking and patient call-backs across the practice. The doctor's review &amp; sign-off
              always stays in the{' '}
              <NavLink to="/cockpit" className="underline decoration-vaani-paper/40 underline-offset-2 hover:text-vaani-paper">
                Cockpit
              </NavLink>.
            </p>

            {/* Summary stat cards */}
            <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroStat icon={Users} label="In feed now" value={liveRows.length} sub="patients screened" />
              <HeroStat icon={CheckCircle2} label="Signed today" value={signedToday} sub="ready for callback" tone="success" />
              <HeroStat icon={Radio} label="Red-flag cases" value={redToday} sub="routed to RMP" tone="warning" />
              <HeroStat icon={Stethoscope} label="On call" value={RMP_NAME} sub="reviewing doctor" isText />
            </div>
          </div>
        </section>

        <div className="container max-w-6xl px-4 pt-8 space-y-7">
          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'group inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm transition',
                    active
                      ? 'border-primary/40 bg-primary/10 text-foreground shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  <t.icon className={cn('w-4 h-4', active ? 'text-warning' : 'text-muted-foreground group-hover:text-foreground')} />
                  <span className="text-left leading-tight">
                    <span className={cn('block font-semibold', active && 'text-foreground')}>{t.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {tab === 'ops' && (
            <div className="space-y-7">
              <AmbientConsultationPanel />
              <OutboundQueuePanel />
            </div>
          )}
          {tab === 'population' && <PopulationHealth liveRows={liveRows} />}
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Hero stat card                                              */

function HeroStat({
  icon: Icon, label, value, sub, tone, isText,
}: {
  icon: typeof Users; label: string; value: number | string; sub: string;
  tone?: 'success' | 'warning'; isText?: boolean;
}) {
  const accentText =
    tone === 'success' ? 'text-vaani-green' :
    tone === 'warning' ? 'text-vaani-saffron' :
    'text-vaani-paper';
  return (
    <div className="rounded-2xl border border-vaani-paper/15 bg-vaani-paper/5 backdrop-blur-sm px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-vaani-paper/65">
        <Icon className={cn('w-3.5 h-3.5', accentText)} /> {label}
      </div>
      <div className={cn('mt-1.5 font-bold tracking-tight', isText ? 'text-lg font-hind' : 'text-2xl tabular-nums')}>
        {value}
      </div>
      <div className="text-[11px] text-vaani-paper/55">{sub}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Prototype label chip                                        */

function PrototypeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded-md border border-accent/40 bg-accent/10 text-accent px-2 py-1">
      <Sparkles className="w-3 h-3" /> {label}
    </span>
  );
}

/* Section header used by the ops cards */
function SectionHead({
  icon: Icon, title, subtitle, chip, action,
}: {
  icon: typeof Users; title: string; subtitle?: string; chip?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-5 py-4 flex items-center gap-3 flex-wrap">
      <span className="w-9 h-9 rounded-xl bg-primary/12 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-warning" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{title}</span>
          {chip}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* A. In-Visit Consultation — ambient transcription + SOAP     */

interface TranscriptLine { speaker: 'DOCTOR' | 'PATIENT' | 'ASHA'; text: string }

const SAMPLE_TRANSCRIPT: TranscriptLine[] = [
  { speaker: 'DOCTOR', text: 'नमस्ते, बैठिए। क्या तकलीफ़ है?' },
  { speaker: 'PATIENT', text: 'डॉक्टर साहब, तीन दिन से बुख़ार है और खाँसी भी।' },
  { speaker: 'DOCTOR', text: 'बुख़ार तेज़ रहता है? कँपकँपी आती है?' },
  { speaker: 'PATIENT', text: 'हाँ, रात को तेज़ हो जाता है। बदन भी दर्द करता है।' },
  { speaker: 'ASHA', text: 'Sir, SpO2 96 hai, temperature subah 101 °F tha.' },
  { speaker: 'DOCTOR', text: 'खाँसी में बलगम आता है? खून तो नहीं?' },
  { speaker: 'PATIENT', text: 'बलगम आता है, खून नहीं।' },
  { speaker: 'DOCTOR', text: 'कोई पुरानी बीमारी — शुगर, बी.पी.?' },
  { speaker: 'PATIENT', text: 'नहीं डॉक्टर साहब।' },
  { speaker: 'DOCTOR', text: 'ठीक है, वायरल फीवर लग रहा है। आराम और पैरासिटामोल। तीन दिन में आराम न हो तो दिखाइए।' },
];

// SOAP fields reveal as the conversation progresses (threshold = lines revealed).
const SAMPLE_SOAP: { key: string; label: string; after: number; body: string }[] = [
  { key: 's', label: 'S — Subjective', after: 4, body: '3-day fever with night-time spikes + chills, productive cough, body ache. No haemoptysis.' },
  { key: 'o', label: 'O — Objective', after: 5, body: 'Temp 101 °F (AM), SpO₂ 96% (ASHA-reported). No respiratory distress noted.' },
  { key: 'a', label: 'A — Assessment', after: 9, body: 'Presumptive screening: acute febrile illness, likely viral. No red flags (afebrile-sepsis / hemoptysis screen negative). [STG v3]' },
  { key: 'p', label: 'P — Plan', after: 10, body: 'Symptomatic care, oral hydration, antipyretic PRN. Review in 3 days or earlier if breathlessness or persistent high fever.' },
];
const SAMPLE_ICD = [
  { code: 'J06.9', after: 9, title: 'Acute upper respiratory infection, unspecified' },
  { code: 'R50.9', after: 9, title: 'Fever, unspecified' },
];

function AmbientConsultationPanel() {
  const [revealed, setRevealed] = useState(0); // # of transcript lines shown
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setRevealed((n) => {
        if (n >= SAMPLE_TRANSCRIPT.length) { setPlaying(false); return n; }
        return n + 1;
      });
    }, 1100);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing]);

  function start() {
    setRevealed(0);
    setPlaying(true);
  }

  const done = revealed >= SAMPLE_TRANSCRIPT.length;

  return (
    <section className="vaani-elevated overflow-hidden">
      <SectionHead
        icon={Stethoscope}
        title="In-Visit Consultation"
        subtitle="Listen to the conversation, draft the note — the doctor only reviews."
        chip={<PrototypeChip label="Prototype · in-visit note autofill" />}
        action={
          <button
            onClick={start}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3.5 py-2 text-sm font-semibold shadow-sm hover:brightness-105 transition"
          >
            <Play className="w-4 h-4" /> {revealed === 0 ? 'Play demo' : done ? 'Replay' : 'Playing…'}
          </button>
        }
      />

      <div className="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Transcript */}
        <div className="p-5 space-y-2.5 min-h-[320px]">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-accent" /> Live transcript · speaker-labelled
          </div>
          {revealed === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 py-12 px-4 text-center">
              <Radio className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Press <span className="font-medium text-foreground">Play demo</span> to watch the consult write itself up.
              </p>
            </div>
          )}
          <AnimatePresence>
            {SAMPLE_TRANSCRIPT.slice(0, revealed).map((l, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('flex gap-2', l.speaker === 'PATIENT' && 'flex-row-reverse text-right')}
              >
                <span className={cn(
                  'shrink-0 text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 h-fit',
                  l.speaker === 'DOCTOR' && 'bg-accent/15 text-accent',
                  l.speaker === 'PATIENT' && 'bg-success/15 text-success',
                  l.speaker === 'ASHA' && 'bg-warning/15 text-warning',
                )}>
                  {l.speaker}
                </span>
                <span className="text-sm leading-snug" lang="hi">{l.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {playing && !done && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" /> listening…
            </div>
          )}
        </div>

        {/* Live SOAP preview */}
        <div className="p-5 bg-muted/30">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-accent" /> SOAP note · drafting live
          </div>
          <div className="space-y-3.5">
            {SAMPLE_SOAP.map((f) => {
              const show = revealed >= f.after;
              return (
                <div key={f.key}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{f.label}</div>
                  {show ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm leading-relaxed text-foreground">{f.body}</motion.div>
                  ) : (
                    <div className="h-4 rounded bg-foreground/5 animate-pulse" />
                  )}
                </div>
              );
            })}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">ICD-10</div>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_ICD.map((c) => revealed >= c.after ? (
                  <motion.span key={c.code} initial={{ opacity: 0 }} animate={{ opacity: 1 }} title={c.title}
                    className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">ICD-10 {c.code} — {c.title}</motion.span>
                ) : (
                  <span key={c.code} className="h-5 w-24 rounded bg-foreground/5 animate-pulse inline-block" />
                ))}
              </div>
            </div>
          </div>
          {done && (
            <div className="mt-4 rounded-lg border border-success/30 bg-success/10 p-2.5 text-xs text-success flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Note drafted — routes to the cockpit for RMP review &amp; sign.
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Demo / sample data. In practice: the recorded consult drafts the SOAP note and ICD codes, then hands off to the doctor's cockpit — nothing is finalised without a doctor's signature.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* B. Outbound Communication Queue                             */

type OutboundStatus = 'Pending' | 'Ready' | 'Queued' | 'Completed';

interface OutboundItem {
  id: string;
  name: string;
  status: OutboundStatus;
  scheduledLabel: string;
  purpose: string;
  band: 'RED' | 'AMBER' | 'GREEN';
  messageHi: string;
  messageEn: string;
  demo: boolean;
}

function buildCallback(row: CockpitRow): { hi: string; en: string } {
  const label = (row.soap?.presumptive_screening_label ?? row.triage.presumptive_label ?? 'आपकी बात').replace(/_/g, ' ');
  const planHi = row.soap?.plan?.trim();
  const hi = `नमस्ते जी। ${RMP_NAME} ने आपकी रिपोर्ट देख ली है। ${planHi ? planHi + ' ' : ''}कोई दिक्कत बढ़े तो तुरंत बताइएगा। धन्यवाद।`;
  const en = `Namaste. ${RMP_NAME} has reviewed your report (${label}). ${row.soap?.plan?.trim() ?? 'Please follow the advice shared.'} Call back if anything worsens.`;
  return { hi, en };
}

function purposeFor(row: CockpitRow): string {
  if (row.triage.band === 'RED') return 'Red-flag follow-up callback';
  if (row.triage.band === 'AMBER') return 'Screening result + watch advice';
  return 'Screening result callback';
}

const DEMO_OUTBOUND: OutboundItem[] = [
  { id: 'demo-1', name: 'Sunita Devi', status: 'Completed', scheduledLabel: 'Today, 10:42', purpose: 'Screening result callback', band: 'GREEN',
    messageHi: 'नमस्ते जी। डॉक्टर साहब ने आपकी रिपोर्ट देख ली है। आराम कीजिए और पानी पीते रहिए। तीन दिन में ठीक न हो तो दिखाइए। धन्यवाद।',
    messageEn: 'Namaste. The doctor reviewed your report. Rest and stay hydrated; review in 3 days if not better.', demo: true },
  { id: 'demo-2', name: 'Ramesh Yadav', status: 'Queued', scheduledLabel: 'Today, 11:15', purpose: 'Red-flag follow-up callback', band: 'RED',
    messageHi: 'नमस्ते जी। डॉक्टर साहब ने आपकी रिपोर्ट तुरंत देख ली है। कृपया नज़दीकी अस्पताल जाइए — हम संपर्क में हैं।',
    messageEn: 'Namaste. The doctor has urgently reviewed your report. Please reach the nearest hospital — we are in contact.', demo: true },
  { id: 'demo-3', name: 'Lakshmi (ANC)', status: 'Pending', scheduledLabel: 'Awaiting sign-off', purpose: 'ANC visit reminder', band: 'AMBER',
    messageHi: 'नमस्ते जी। आपकी अगली जाँच का समय पास है। तारीख़ की पुष्टि के लिए डॉक्टर साहब की मंज़ूरी का इंतज़ार है।',
    messageEn: 'Namaste. Your next ANC check is due. Awaiting the doctor’s confirmation of the date.', demo: true },
];

function OutboundQueuePanel() {
  const { data } = useCockpitFeed();
  const rows = data?.rows ?? [];

  // Derive real queue items from the feed; fall back to demo rows if empty.
  const liveItems: OutboundItem[] = useMemo(() => {
    return rows
      .filter((r) => r.patient)
      .map((r) => {
        const { hi, en } = buildCallback(r);
        const status: OutboundStatus = r.soap?.mo_signed_at ? 'Queued' : (r.soap ? 'Ready' : 'Pending');
        return {
          id: r.triage.id,
          name: r.patient!.full_name?.trim() || 'Unknown patient',
          status,
          scheduledLabel: r.soap?.mo_signed_at ? `signed ${timeAgo(r.soap.mo_signed_at)}` : 'awaiting sign-off',
          purpose: purposeFor(r),
          band: r.triage.band,
          messageHi: hi,
          messageEn: en,
          demo: false,
        };
      });
  }, [rows]);

  const items = liveItems.length > 0 ? liveItems : DEMO_OUTBOUND;
  const [preview, setPreview] = useState<OutboundItem | null>(null);

  return (
    <section className="vaani-elevated overflow-hidden">
      <SectionHead
        icon={PhoneOutgoing}
        title="Outbound Communication Queue"
        subtitle="“The doctor has seen you.” Every callback waits for a signed note."
        chip={<PrototypeChip label="Prototype · post-approval callbacks" />}
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {liveItems.length > 0 ? `${items.length} from live feed` : 'sample data'}
          </span>
        }
      />

      <div className="divide-y divide-border">
        {items.map((it) => (
          <div key={it.id} className="px-5 py-3.5 flex items-center gap-3 flex-wrap hover:bg-muted/30 transition-colors">
            <div className={cn('w-1.5 self-stretch rounded-full min-h-[2.5rem]', bandClasses(it.band).dot)} />
            <div className="flex-1 min-w-[160px]">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{it.name}</span>
                {it.demo && <span className="text-[10px] uppercase tracking-wider rounded bg-muted text-muted-foreground px-1.5 py-0.5">demo</span>}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                <span>{it.purpose}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{it.scheduledLabel}</span>
              </div>
            </div>
            <StatusBadge status={it.status} />
            <button
              onClick={() => setPreview(it)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary/40 hover:bg-muted transition"
            >
              <MessageSquare className="w-3.5 h-3.5 text-accent" /> View callback
            </button>
          </div>
        ))}
      </div>

      <CallbackPreviewDialog item={preview} onClose={() => setPreview(null)} />
    </section>
  );
}

const STATUS_ORDER: OutboundStatus[] = ['Pending', 'Ready', 'Queued', 'Completed'];
function StatusBadge({ status }: { status: OutboundStatus }) {
  const idx = STATUS_ORDER.indexOf(status);
  const cls =
    status === 'Completed' ? 'bg-success/15 text-success' :
    status === 'Queued' ? 'bg-accent/15 text-accent' :
    status === 'Ready' ? 'bg-primary/15 text-warning' :
    'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', cls)}>
      <span className="font-mono opacity-60">{idx + 1}/4</span> {status}
    </span>
  );
}

function CallbackPreviewDialog({ item, onClose }: { item: OutboundItem | null; onClose: () => void }) {
  const [speaking, setSpeaking] = useState(false);

  function play() {
    if (!item) return;
    // Best-effort in-browser voice preview for the demo; no-ops if unavailable.
    try {
      const synth = window.speechSynthesis;
      if (!synth) { setSpeaking(true); window.setTimeout(() => setSpeaking(false), 1500); return; }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(item.messageHi);
      u.lang = 'hi-IN';
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(u);
    } catch { setSpeaking(false); }
  }
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* noop */ } }, []);

  if (!item) return null;
  return (
    <Dialog.Root open={!!item} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-secondary/50 z-[60] backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[95vw] max-w-lg vaani-elevated p-0 shadow-2xl">
          <div className="border-b border-border px-5 py-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-primary/12 flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4 text-warning" />
            </span>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-base font-semibold">Callback to {item.name}</Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">{item.purpose} · {item.status}</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"><X className="w-4 h-4" /></Dialog.Close>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Patient message (Hindi)</div>
              <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-sm leading-relaxed" lang="hi">{item.messageHi}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">English gloss</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{item.messageEn}</div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={play}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3.5 py-2 text-sm font-semibold shadow-sm hover:brightness-105 transition"
              >
                <Play className="w-4 h-4" /> {speaking ? 'Playing…' : 'Play sample callback'}
              </button>
              <span className="text-[11px] text-muted-foreground">
                Demo voice preview. In practice, Vaani Didi voice-calls the patient in their language.
              </span>
            </div>
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
              <Send className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent" />
              The callback is placed only after the RMP signs the SOAP note — and any medicine names are removed from the patient message.
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
