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
  FileText, Volume2, X, CheckCircle2, Clock, Send,
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

  const TABS: { key: ClinicTab; label: string }[] = [
    { key: 'ops', label: 'Clinic Operations' },
    { key: 'population', label: 'Population Health' },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-2 sticky top-0 bg-background/90 backdrop-blur z-40">
        <span className="vaani-bindi" />
        <span className="font-semibold">vaani · clinic</span>
        <NavLink to="/cockpit" className="ml-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Doctor Cockpit
        </NavLink>
        <DemoDisclosureChip />
      </header>

      <main className="flex-1 overflow-y-auto pb-12">
        <div className="container max-w-screen-lg p-4 space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clinic Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Clinic-wide capabilities — shown for the demo. The doctor's review &amp; approval stays in the
              {' '}<NavLink to="/cockpit" className="underline">Cockpit</NavLink>.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1.5 border-b">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition',
                  tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'ops' && (
            <div className="space-y-6">
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
/* Prototype label chip                                        */

function PrototypeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded-md border border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-2 py-1">
      <Radio className="w-3 h-3" /> {label}
    </span>
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
    <section className="rounded-2xl border bg-card overflow-hidden">
      <div className="border-b px-4 py-3 flex items-center gap-2 flex-wrap">
        <Stethoscope className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold">In-Visit Consultation</span>
        <PrototypeChip label="Prototype Feature – In-Visit Transcription & EMR Autofill" />
        <button
          onClick={start}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          <Play className="w-4 h-4" /> {revealed === 0 ? 'Play ambient demo' : done ? 'Replay' : 'Playing…'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x">
        {/* Transcript */}
        <div className="p-4 space-y-2 min-h-[320px]">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" /> Ambient transcript · diarized
          </div>
          {revealed === 0 && (
            <div className="text-sm text-muted-foreground py-10 text-center">
              Press <span className="font-medium">Play ambient demo</span> to watch the consult transcribe live.
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
                  l.speaker === 'DOCTOR' && 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
                  l.speaker === 'PATIENT' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                  l.speaker === 'ASHA' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                )}>
                  {l.speaker}
                </span>
                <span className="text-sm leading-snug">{l.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {playing && !done && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> transcribing…
            </div>
          )}
        </div>

        {/* Live SOAP preview */}
        <div className="p-4 bg-muted/20">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Live SOAP autofill
          </div>
          <div className="space-y-3">
            {SAMPLE_SOAP.map((f) => {
              const show = revealed >= f.after;
              return (
                <div key={f.key}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{f.label}</div>
                  {show ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm leading-relaxed">{f.body}</motion.div>
                  ) : (
                    <div className="h-4 rounded bg-foreground/5 animate-pulse" />
                  )}
                </div>
              );
            })}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">ICD-10</div>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_ICD.map((c) => revealed >= c.after ? (
                  <motion.span key={c.code} initial={{ opacity: 0 }} animate={{ opacity: 1 }} title={c.title}
                    className="rounded-md border bg-secondary/30 px-2 py-0.5 text-xs">ICD-10 {c.code} — {c.title}</motion.span>
                ) : (
                  <span key={c.code} className="h-5 w-24 rounded bg-foreground/5 animate-pulse inline-block" />
                ))}
              </div>
            </div>
          </div>
          {done && (
            <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> EMR drafted — would route to the cockpit for RMP review &amp; sign.
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Demo / sample data. Production path: recorded consult → diarized STT → SOAP + ICD autofill → cockpit.
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
    <section className="rounded-2xl border bg-card overflow-hidden">
      <div className="border-b px-4 py-3 flex items-center gap-2 flex-wrap">
        <PhoneOutgoing className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold">Outbound Communication Queue</span>
        <PrototypeChip label="Prototype – Post-Approval Callbacks" />
        <span className="ml-auto text-xs text-muted-foreground">
          {liveItems.length > 0 ? `${items.length} from live feed` : 'sample data'}
        </span>
      </div>

      <div className="divide-y">
        {items.map((it) => (
          <div key={it.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className={cn('w-1.5 self-stretch rounded-full min-h-[2.5rem]', bandClasses(it.band).dot)} />
            <div className="flex-1 min-w-[160px]">
              <div className="flex items-center gap-2">
                <span className="font-medium">{it.name}</span>
                {it.demo && <span className="text-[10px] uppercase tracking-wider rounded bg-foreground/5 text-muted-foreground px-1.5 py-0.5">demo</span>}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <span>{it.purpose}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{it.scheduledLabel}</span>
              </div>
            </div>
            <StatusBadge status={it.status} />
            <button
              onClick={() => setPreview(it)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-secondary/60"
            >
              <MessageSquare className="w-3.5 h-3.5" /> View callback
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
    status === 'Completed' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' :
    status === 'Queued' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' :
    status === 'Ready' ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' :
    'bg-amber-500/15 text-amber-700 dark:text-amber-300';
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
    // Best-effort browser TTS for the demo; gracefully no-ops if unavailable.
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
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[95vw] max-w-lg rounded-2xl border bg-card p-0 shadow-2xl">
          <div className="border-b px-5 py-3 flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <Dialog.Title className="text-base font-semibold">Callback to {item.name}</Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">{item.purpose} · {item.status}</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 hover:bg-secondary/60"><X className="w-4 h-4" /></Dialog.Close>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Generated patient message (Hindi)</div>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">{item.messageHi}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">English gloss</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{item.messageEn}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={play}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
              >
                <Play className="w-4 h-4" /> {speaking ? 'Playing…' : 'Play Sample Callback'}
              </button>
              <span className="text-[11px] text-muted-foreground">
                Demo voice (browser TTS). Production: Sarvam Bulbul → Exotel call.
              </span>
            </div>
            <div className="rounded-lg border border-dashed bg-muted/20 p-2.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />
              In production this dispatches only after the RMP signs the SOAP — drug names are scrubbed from the patient message.
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
