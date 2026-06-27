import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  Users,
  FileText,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  Shield,
  Languages,
  Mic,
  Stethoscope,
  ListOrdered,
  Brain,
  FlaskConical,
  HelpCircle,
  Check,
  Pencil,
  Ban,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { icd10Title } from '@/lib/icd10-rural';

const FN_BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';
const FN_AUTH = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;

/* ─────────────────────────────────────────────────────────── */
/* Types                                                      */

type TriageBand = 'RED' | 'AMBER' | 'GREEN';

interface CockpitRow {
  triage: {
    id: string;
    call_id: string;
    patient_id: string;
    tenant_id: string;
    band: TriageBand;
    presumptive_label: string;
    red_flag_categories: string[] | null;
    confidence: number;
    reasoning: string | null;
    summary_en: string | null;
    summary_native: string | null;
    recommended_action: string | null;
    needs_mo_review: boolean;
    classifier_model: string | null;
    classifier_prompt_version: string | null;
    created_at: string;
  };
  soap: null | {
    id: string;
    call_id: string;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    presumptive_screening_label: string;
    differential_list: Array<{
      label: string;
      likelihood?: 'high' | 'medium' | 'low';
      confidence?: number;
      rationale?: string;
    }>;
    icd10_codes: string[];
    icd11_codes: string[];
    mo_only_drug_hints: string[] | null;
    lang: string;
    mo_signed_at: string | null;
    mo_user_id: string | null;
    generated_at: string;
  };
  call: null | {
    id: string;
    started_at: string;
    ended_at: string | null;
    channel: string;
    lang_detected: string | null;
  };
  patient: null | {
    id: string;
    full_name: string | null;
    phone_e164: string | null;
    age_years: number | null;
    sex: string | null;
    preferred_language: string;
    pregnancy_status: string | null;
    village_name: string | null;
  };
  // AI Shadow Diagnosis (Stage 3) — a separate AI clinical opinion, generated
  // before the RMP reviews. The doctor remains the final authority.
  shadow: null | {
    id: string;
    differential_diagnoses: Array<{
      condition: string;
      confidence?: number;
      reasoning?: string;
      supporting_findings?: string[];
    }>;
    recommended_tests: string[];
    recommended_medications: string[];
    referral_recommended: boolean | null;
    referral_reason: string | null;
    urgency: 'Routine' | 'Urgent' | 'Emergency' | null;
    missing_information: string[];
    red_flag_urgency_override: boolean;
    doctor_action: 'pending' | 'ignored' | 'accepted' | 'edited';
    doctor_referral_decision: boolean | null;
    doctor_urgency: string | null;
    doctor_notes: string | null;
    doctor_decided_at: string | null;
  };
}

/* ─────────────────────────────────────────────────────────── */
/* Page shell                                                 */

export default function Cockpit() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-2 sticky top-0 bg-background/90 backdrop-blur z-40">
        <span className="vaani-bindi" />
        <span className="font-semibold">vaani · cockpit</span>
        <DemoDisclosureChip />
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Routes>
          <Route index element={<TriageQueue />} />
          <Route path="patients" element={<Patients />} />
          <Route path="notes" element={<NotesIndex />} />
          <Route path="me" element={<Me />} />
        </Routes>
      </main>

      <BottomNav />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Anand-mandated AI · DEMO MODE chip                        */

function DemoDisclosureChip() {
  return (
    <span
      className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded-md border bg-foreground/5 text-foreground/80 px-2 py-1"
      title="AI-Assisted Screening · Pilot — Vaani is an AI screener; every SOAP note is reviewed and signed by a Registered Medical Practitioner under NMC Act 2019 before any patient-facing action."
    >
      <Shield className="w-3 h-3" />
      AI-Assisted · Pilot
    </span>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Bottom nav                                                 */

function BottomNav() {
  const tabs: { to: string; icon: typeof LayoutGrid; label: string; end?: boolean }[] = [
    { to: '/cockpit', icon: LayoutGrid, label: 'Queue', end: true },
    { to: '/cockpit/patients', icon: Users, label: 'Patients' },
    { to: '/cockpit/notes', icon: FileText, label: 'Notes' },
    { to: '/cockpit/me', icon: UserIcon, label: 'You' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur z-50 safe-area-inset-bottom">
      <div className="container max-w-screen-md grid grid-cols-4">
        {tabs.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center py-2 gap-0.5 text-xs',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* The Triage Queue                                           */

function useCockpitFeed() {
  return useQuery<{ rows: CockpitRow[]; fetched_at: string }>({
    queryKey: ['cockpit-feed'],
    queryFn: async () => {
      // Audit §4: 8s client-side timeout so a stuck edge function
      // doesn't strand the UI in a loading state forever.
      const ctl = new AbortController();
      const tid = window.setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(`${FN_BASE}/cockpit-feed?limit=30`, {
          headers: { Authorization: FN_AUTH },
          signal: ctl.signal,
        });
        if (!r.ok) throw new Error(`cockpit-feed ${r.status}`);
        return await r.json();
      } finally {
        window.clearTimeout(tid);
      }
    },
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

function TriageQueue() {
  const { data, isLoading, error } = useCockpitFeed();
  const [openRow, setOpenRow] = useState<CockpitRow | null>(null);

  const rows = data?.rows ?? [];
  const counts = useMemo(() => {
    const c = { RED: 0, AMBER: 0, GREEN: 0 } as Record<TriageBand, number>;
    for (const r of rows) c[r.triage.band] += 1;
    return c;
  }, [rows]);

  return (
    <div className="container max-w-screen-md p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Triage Queue</h2>
        <div className="flex items-center gap-2 text-sm">
          <BandPill band="RED" count={counts.RED} />
          <BandPill band="AMBER" count={counts.AMBER} />
          <BandPill band="GREEN" count={counts.GREEN} />
        </div>
      </div>

      {isLoading && <SkeletonStack />}
      {error && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load cockpit feed: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <Mic className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No triage in the queue.
          <div className="mt-2 text-sm">Start a screening — a card lands here ~10s after the call ends.</div>
          <a
            href="/asha"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            <Mic className="w-4 h-4" /> Start a screening ↗
          </a>
          <div className="mt-2 text-[11px]">opens the patient screening in a new tab — keep this cockpit open to watch the card arrive</div>
        </div>
      )}

      <AnimatePresence>
        {rows.map((row) => (
          <motion.div
            key={row.triage.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
          >
            <TriageCard row={row} onClick={() => setOpenRow(row)} />
          </motion.div>
        ))}
      </AnimatePresence>

      <SoapReviewDialog
        open={!!openRow}
        row={openRow}
        onClose={() => setOpenRow(null)}
      />
    </div>
  );
}

function BandPill({ band, count }: { band: TriageBand; count: number }) {
  const cls = bandClasses(band);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border', cls.pill)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cls.dot)} />
      {band} <span className="opacity-60">{count}</span>
    </span>
  );
}

function SkeletonStack() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-xl border bg-card animate-pulse" />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Triage Card                                                */

function TriageCard({ row, onClick }: { row: CockpitRow; onClick: () => void }) {
  const cls = bandClasses(row.triage.band);
  const isRed = row.triage.band === 'RED';
  const isSigned = !!row.soap?.mo_signed_at;
  const reds = row.triage.red_flag_categories ?? [];
  const lang = row.patient?.preferred_language ?? row.call?.lang_detected ?? 'hi';
  const age = row.patient?.age_years;

  return (
    <button
      onClick={onClick}
      aria-label={`${row.triage.band} ${row.triage.presumptive_label.replace(/_/g, ' ')}${isSigned ? ', signed' : ', awaiting sign-off'}`}
      className={cn(
        'w-full text-left rounded-xl border bg-card p-4 transition shadow-sm hover:shadow-md hover:scale-[1.005]',
        cls.cardBorder,
        // Audit §4: pulse only RED + unsigned. Honor prefers-reduced-motion.
        isRed && !isSigned && 'ring-2 ring-red-500/40 motion-safe:animate-pulse',
        // Signed RED rows get an emerald glow instead of a continuing pulse.
        isSigned && isRed && 'ring-1 ring-emerald-500/40',
        isSigned && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-2 self-stretch rounded-full', cls.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className={cn('font-semibold uppercase tracking-wider text-xs', cls.text)}>
              {row.triage.band}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium truncate">{row.triage.presumptive_label.replace(/_/g, ' ')}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">conf {(row.triage.confidence * 100).toFixed(0)}%</span>
            {isSigned && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Signed
              </span>
            )}
          </div>

          {/* Who called — name + number (backfilled from the screening) */}
          <div className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1.5 truncate">
            <span className="font-medium text-foreground/70">
              {row.patient?.full_name?.trim() || 'Unknown caller'}
            </span>
            {row.patient?.phone_e164 && (
              <>
                <span>·</span>
                <span className="font-mono">{row.patient.phone_e164}</span>
              </>
            )}
          </div>

          <div className="mt-1 text-sm text-foreground/80 line-clamp-2">
            {row.triage.summary_native || row.triage.summary_en || row.triage.reasoning || '—'}
          </div>

          <div className="mt-2 flex items-center flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5">
              <Languages className="w-3 h-3" />
              {lang.toUpperCase()}
            </span>
            {age != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5">
                {row.patient?.sex ?? '?'} · {age}y
              </span>
            )}
            {reds.slice(0, 3).map((r) => (
              <span key={r} className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-700 dark:text-red-300 px-2 py-0.5">
                <AlertCircle className="w-3 h-3" /> {r}
              </span>
            ))}
            <span className="ml-auto text-muted-foreground">
              {timeAgo(row.triage.created_at)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* SOAP review + Approve & Sign (the Soul Moment)             */

function SoapReviewDialog({
  open, row, onClose,
}: { open: boolean; row: CockpitRow | null; onClose: () => void }) {
  const [signing, setSigning] = useState(false);
  const [soulMessage, setSoulMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // AI Shadow Diagnosis — doctor decision capture (ignore / accept / edit).
  const [reviewing, setReviewing] = useState(false);
  const [localDecision, setLocalDecision] = useState<
    { action: 'ignored' | 'accepted' | 'edited'; referral?: boolean; urgency?: string; notes?: string } | null
  >(null);
  const [editMode, setEditMode] = useState(false);
  const [editReferral, setEditReferral] = useState(false);
  const [editUrgency, setEditUrgency] = useState<'Routine' | 'Urgent' | 'Emergency'>('Urgent');
  const [editNotes, setEditNotes] = useState('');

  // Audit §4: reset soulMessage when the dialog closes so the next row's
  // "Sent: …" banner doesn't leak across cards. Also revoke any pending
  // blob URL on the <audio>. Reset the shadow-review state too.
  useEffect(() => {
    if (open) return;
    setSoulMessage(null);
    setLocalDecision(null);
    setEditMode(false);
    if (audioRef.current?.dataset.blobUrl) {
      try { URL.revokeObjectURL(audioRef.current.dataset.blobUrl); } catch {/* noop */}
      audioRef.current.dataset.blobUrl = '';
    }
  }, [open]);

  async function submitShadowReview(
    action: 'ignored' | 'accepted' | 'edited',
    extras?: { doctor_referral_decision?: boolean; doctor_urgency?: string; doctor_notes?: string },
  ) {
    if (!row?.shadow) return;
    setReviewing(true);
    try {
      const r = await fetch(`${FN_BASE}/shadow-diagnosis-review`, {
        method: 'POST',
        headers: { Authorization: FN_AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shadow_id: row.shadow.id, action, ...extras }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
      setLocalDecision({
        action,
        referral: extras?.doctor_referral_decision,
        urgency: extras?.doctor_urgency,
        notes: extras?.doctor_notes,
      });
      setEditMode(false);
      toast.success(`AI opinion ${action} — your decision is the record of truth.`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save your decision');
    } finally {
      setReviewing(false);
    }
  }

  if (!row) return null;
  const isSigned = !!row.soap?.mo_signed_at;
  const lang = row.patient?.preferred_language ?? 'hi';

  async function approveAndSign() {
    if (!row?.soap) return;
    setSigning(true);
    try {
      const r = await fetch(`${FN_BASE}/soap-sign`, {
        method: 'POST',
        headers: {
          Authorization: FN_AUTH,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ soap_id: row.soap.id }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);

      const audioB64: string | null = body?.signoff?.audio_b64 ?? null;
      const message: string = body?.signoff?.message ?? '';
      setSoulMessage(message);

      if (audioB64) {
        const bin = atob(audioB64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        const blob = new Blob([buf], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          // Revoke previous blob URL to avoid the leak the audit flagged.
          const prev = audioRef.current.dataset.blobUrl;
          if (prev) try { URL.revokeObjectURL(prev); } catch {/* noop */}
          audioRef.current.src = url;
          audioRef.current.dataset.blobUrl = url;
          await audioRef.current.play().catch(() => {/* autoplay blocked */});
        }
      }
      // Language-aware toast — audit flagged Tamil-patient calls
      // showing a Hindi confirmation string.
      const TOAST_BY_LANG: Record<string, string> = {
        hi: 'मरीज़ को कॉल हो गई — डॉक्टर साहब ने देख लिया है',
        ta: 'நோயாளியை அழைத்தது — டாக்டர் பார்த்துவிட்டார்',
        en: 'Patient called back — the doctor has reviewed your report',
      };
      toast.success(TOAST_BY_LANG[lang] ?? TOAST_BY_LANG.hi);
    } catch (e: any) {
      toast.error(`Sign failed: ${e?.message ?? e}`);
    } finally {
      setSigning(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-0 shadow-2xl">
          <div className="sticky top-0 bg-card/95 backdrop-blur border-b px-5 py-3 flex items-center gap-3">
            <Stethoscope className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <Dialog.Title className="text-lg font-semibold leading-tight">SOAP Review</Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                {row.triage.presumptive_label.replace(/_/g, ' ')} · {row.triage.band} · conf {(row.triage.confidence * 100).toFixed(0)}%
              </Dialog.Description>
            </div>
            <DemoDisclosureChip />
            <Dialog.Close className="rounded-md p-1 hover:bg-secondary/60">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <div className="p-5 space-y-4">
            {!row.soap && (
              <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
                SOAP draft pending… The call ended very recently — refreshing in a few seconds.
              </div>
            )}

            {row.soap && (
              <>
                <SoapSection label="S — Subjective" body={row.soap.subjective} />
                <SoapSection label="O — Objective" body={row.soap.objective} />
                <SoapSection label="A — Assessment" body={row.soap.assessment} />
                <SoapSection label="P — Plan (patient-facing)" body={row.soap.plan} />

                {row.soap.mo_only_drug_hints && row.soap.mo_only_drug_hints.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                      <Shield className="w-3.5 h-3.5" />
                      AI drug suggestions · MO-only · NOT shared with patient
                    </div>
                    <ul className="text-sm space-y-1">
                      {row.soap.mo_only_drug_hints.map((d, i) => (
                        <li key={i} className="font-mono text-xs">• {d}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {row.soap.differential_list?.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
                      <ListOrdered className="w-3.5 h-3.5" />
                      AI-suggested differential · ranked · MO-only · NOT shared with patient
                    </div>
                    <ol className="text-sm space-y-1.5">
                      {row.soap.differential_list.map((d, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            {i + 1}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{d.label}</span>
                              {d.likelihood && (
                                <span className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                  d.likelihood === 'high' && 'bg-red-500/15 text-red-600 dark:text-red-300',
                                  d.likelihood === 'medium' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                                  d.likelihood === 'low' && 'bg-secondary text-muted-foreground',
                                )}>
                                  {d.likelihood}
                                </span>
                              )}
                              {typeof d.confidence === 'number' && (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {(d.confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                            {d.rationale && (
                              <div className="text-xs text-muted-foreground">{d.rationale}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {(row.soap.icd10_codes?.length || row.soap.icd11_codes?.length) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {row.soap.icd10_codes?.map((c) => {
                      const title = icd10Title(c);
                      return (
                        <span
                          key={`a${c}`}
                          title={title ?? undefined}
                          className="rounded-md border bg-secondary/30 px-2 py-0.5"
                        >
                          ICD-10 {c}{title ? ` — ${title}` : ''}
                        </span>
                      );
                    })}
                    {row.soap.icd11_codes?.map((c) => (
                      <span key={`b${c}`} className="rounded-md border bg-secondary/30 px-2 py-0.5">ICD-11 {c}</span>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border bg-amber-500/5 p-3 text-xs">
                  <div className="font-semibold mb-1 text-amber-700 dark:text-amber-300">AI Draft Timestamp</div>
                  <div className="text-muted-foreground">
                    AI-pre-drafted from Vaani's screening transcript. The named RMP (HPR-linked under ABDM) independently reviews and signs before any patient-facing action.
                    {isSigned && (
                      <> Signed at {new Date(row.soap.mo_signed_at!).toLocaleString()}.</>
                    )}
                  </div>
                </div>
              </>
            )}

            {row.shadow && (
              <div className="rounded-xl border-2 border-indigo-500/40 bg-indigo-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                  <span className="text-sm font-semibold">AI Clinical Opinion</span>
                  <span className="text-[10px] uppercase tracking-wider rounded bg-indigo-500/15 px-1.5 py-0.5 text-indigo-700 dark:text-indigo-300">
                    Shadow Diagnosis · MO advisory
                  </span>
                  {row.shadow.urgency && (
                    <span className={cn(
                      'ml-auto rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                      row.shadow.urgency === 'Emergency' && 'bg-red-500/15 text-red-600 dark:text-red-300',
                      row.shadow.urgency === 'Urgent' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                      row.shadow.urgency === 'Routine' && 'bg-secondary text-muted-foreground',
                    )}>
                      {row.shadow.urgency}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground -mt-1">
                  Generated independently, before your review. Not a diagnosis — the doctor is the final authority.
                  {row.shadow.red_flag_urgency_override && (
                    <span className="ml-1 text-amber-700 dark:text-amber-300">⚠ Urgency raised by the red-flag safety layer.</span>
                  )}
                </div>

                {/* Top-3 differential diagnoses */}
                {row.shadow.differential_diagnoses?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Differential diagnoses (top 3)
                    </div>
                    <ol className="space-y-1.5">
                      {row.shadow.differential_diagnoses.slice(0, 3).map((d, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                            {i + 1}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{d.condition}</span>
                              {typeof d.confidence === 'number' && (
                                <span className="font-mono text-[11px] text-muted-foreground">{(d.confidence * 100).toFixed(0)}%</span>
                              )}
                            </div>
                            {d.reasoning && <div className="text-xs text-muted-foreground">{d.reasoning}</div>}
                            {d.supporting_findings && d.supporting_findings.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {d.supporting_findings.map((f, j) => (
                                  <span key={j} className="rounded bg-secondary/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">{f}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Suggested investigations */}
                {row.shadow.recommended_tests?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      <FlaskConical className="w-3.5 h-3.5" /> Suggested investigations
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {row.shadow.recommended_tests.map((t, i) => (
                        <span key={i} className="rounded-md border bg-secondary/30 px-2 py-0.5 text-xs">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* MO-only medication hints */}
                {row.shadow.recommended_medications?.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                      <Shield className="w-3.5 h-3.5" /> Suggested medications · MO-only · NOT shared with patient
                    </div>
                    <ul className="space-y-0.5">
                      {row.shadow.recommended_medications.map((m, i) => (
                        <li key={i} className="font-mono text-xs">• {m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Referral recommendation */}
                <div className="flex items-start gap-2 text-sm">
                  <ArrowUpRight className={cn('w-4 h-4 mt-0.5', row.shadow.referral_recommended ? 'text-red-600 dark:text-red-300' : 'text-muted-foreground')} />
                  <div>
                    <span className="font-medium">
                      {row.shadow.referral_recommended ? 'Referral recommended' : 'No referral recommended'}
                    </span>
                    {row.shadow.referral_reason && (
                      <span className="text-muted-foreground"> — {row.shadow.referral_reason}</span>
                    )}
                  </div>
                </div>

                {/* Missing information */}
                {row.shadow.missing_information?.length > 0 && (
                  <div className="rounded-lg border border-dashed bg-muted/40 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      <HelpCircle className="w-3.5 h-3.5" /> Missing information (raises uncertainty)
                    </div>
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      {row.shadow.missing_information.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}

                {/* Doctor decision: Ignore / Accept / Edit */}
                {(() => {
                  const decided = localDecision?.action ?? (row.shadow.doctor_action !== 'pending' ? row.shadow.doctor_action : null);
                  if (decided && !editMode) {
                    return (
                      <div className="flex items-center gap-2 border-t pt-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-medium capitalize">Doctor {decided}</span>
                        <span className="text-xs text-muted-foreground">— the doctor's decision overrides the AI.</span>
                        <button
                          onClick={() => { setEditMode(true); setEditReferral(!!row.shadow!.referral_recommended); setEditUrgency((row.shadow!.urgency as any) ?? 'Urgent'); }}
                          className="ml-auto text-xs px-2 py-1 rounded-md border hover:bg-secondary/60"
                        >
                          Change
                        </button>
                      </div>
                    );
                  }
                  if (editMode) {
                    return (
                      <div className="border-t pt-3 space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Doctor's final decision</div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={editReferral} onChange={(e) => setEditReferral(e.target.checked)} />
                          Refer the patient
                        </label>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Urgency:</span>
                          {(['Routine', 'Urgent', 'Emergency'] as const).map((u) => (
                            <button
                              key={u}
                              onClick={() => setEditUrgency(u)}
                              className={cn('text-xs px-2 py-1 rounded-md border', editUrgency === u ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-700 dark:text-indigo-300' : 'hover:bg-secondary/60')}
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Notes (what you changed and why)…"
                          className="w-full text-sm rounded-md border bg-background p-2 min-h-[60px]"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            disabled={reviewing}
                            onClick={() => submitShadowReview('edited', { doctor_referral_decision: editReferral, doctor_urgency: editUrgency, doctor_notes: editNotes })}
                            className="text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Save decision
                          </button>
                          <button onClick={() => setEditMode(false)} className="text-sm px-3 py-1.5 rounded-md border hover:bg-secondary/60">Cancel</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-2 border-t pt-2">
                      <span className="text-xs text-muted-foreground mr-auto">Your call:</span>
                      <button
                        disabled={reviewing}
                        onClick={() => submitShadowReview('ignored')}
                        className="inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-md border hover:bg-secondary/60 disabled:opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" /> Ignore
                      </button>
                      <button
                        disabled={reviewing}
                        onClick={() => { setEditMode(true); setEditReferral(!!row.shadow!.referral_recommended); setEditUrgency((row.shadow!.urgency as any) ?? 'Urgent'); }}
                        className="inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-md border hover:bg-secondary/60 disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        disabled={reviewing}
                        onClick={() => submitShadowReview('accepted')}
                        className="inline-flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" /> Accept
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t px-5 py-3 flex items-center gap-3">
            {soulMessage ? (
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex-1 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span className="truncate">Sent: "{soulMessage}"</span>
              </motion.div>
            ) : (
              <div className="flex-1 text-xs text-muted-foreground">
                Approving will call the patient back in their language.
              </div>
            )}
            <button
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-md border hover:bg-secondary/60"
            >
              Close
            </button>
            <button
              disabled={signing || !row.soap || isSigned}
              onClick={approveAndSign}
              className={cn(
                'text-sm px-4 py-1.5 rounded-md font-semibold transition',
                'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-muted disabled:text-muted-foreground',
              )}
            >
              {isSigned ? 'Already signed' : signing ? 'Signing…' : 'Approve & Sign'}
            </button>
            <audio ref={audioRef} hidden />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SoapSection({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{body}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Patients · Notes · Me — render real data from cockpit-feed */

function Patients() {
  const { data } = useCockpitFeed();
  const rows = data?.rows ?? [];
  // Group by patient id (callers we've seen).
  const byPatient = new Map<string, { id: string; ageSex: string; lang: string; calls: number; latestBand: TriageBand; latestAt: string }>();
  for (const r of rows) {
    if (!r.patient) continue;
    const key = r.patient.id;
    const prev = byPatient.get(key);
    const ageSex = `${r.patient.sex ?? '?'} · ${r.patient.age_years ?? '?'}y`;
    const lang = r.patient.preferred_language ?? '?';
    if (!prev) {
      byPatient.set(key, { id: key, ageSex, lang, calls: 1, latestBand: r.triage.band, latestAt: r.triage.created_at });
    } else {
      prev.calls += 1;
      if (r.triage.created_at > prev.latestAt) { prev.latestAt = r.triage.created_at; prev.latestBand = r.triage.band; }
    }
  }
  const list = Array.from(byPatient.values()).sort((a, b) => b.latestAt.localeCompare(a.latestAt));

  return (
    <div className="container max-w-screen-md p-4">
      <h2 className="text-2xl font-semibold tracking-tight mb-4">Patients</h2>
      {list.length === 0 && <p className="text-sm text-muted-foreground">No patients yet — they'll appear after their first call.</p>}
      <ul className="space-y-2">
        {list.map((p) => (
          <li key={p.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="w-1.5 self-stretch rounded-full" style={{ background: bandClasses(p.latestBand).dot.replace('bg-', '') }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{p.ageSex} · {p.lang.toUpperCase()}</div>
              <div className="text-xs text-muted-foreground">{p.calls} call{p.calls === 1 ? '' : 's'} · last {timeAgo(p.latestAt)}</div>
            </div>
            <BandPill band={p.latestBand} count={1} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotesIndex() {
  const { data } = useCockpitFeed();
  const rows = (data?.rows ?? []).filter((r) => r.soap?.mo_signed_at);
  return (
    <div className="container max-w-screen-md p-4">
      <h2 className="text-2xl font-semibold tracking-tight mb-4">Signed SOAP notes</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No signed notes yet.</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.triage.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2">
              <BandPill band={r.triage.band} count={1} />
              <span className="text-sm font-medium truncate">{r.triage.presumptive_label.replace(/_/g, ' ')}</span>
              <span className="ml-auto text-xs text-muted-foreground">{timeAgo(r.soap!.mo_signed_at!)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.soap?.assessment}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Me() {
  const { data } = useCockpitFeed();
  const rows = data?.rows ?? [];
  const signedToday = rows.filter((r) => {
    const ts = r.soap?.mo_signed_at;
    if (!ts) return false;
    return new Date(ts).toDateString() === new Date().toDateString();
  }).length;
  const pending = rows.filter((r) => !r.soap?.mo_signed_at).length;
  const rmpName = (import.meta as any).env?.VITE_RMP_NAME ?? 'डॉक्टर साहब';
  const rmpReg = (import.meta as any).env?.VITE_RMP_MCI_REG ?? '—';
  const agentPhone = (import.meta as any).env?.VITE_AGENT_PHONE_DISPLAY ?? null;
  return (
    <div className="container max-w-screen-md p-4">
      <h2 className="text-2xl font-semibold tracking-tight mb-4">You</h2>
      <div className="rounded-lg border bg-card p-4 mb-4">
        <div className="text-sm font-semibold">{rmpName}</div>
        <div className="text-xs text-muted-foreground">MCI / HPR Reg # {rmpReg}</div>
      </div>
      {agentPhone && (
        <div className="rounded-lg border bg-card p-4 mb-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Vaani agent number</div>
          <div className="text-lg font-mono font-semibold">{agentPhone}</div>
          <div className="text-[11px] text-muted-foreground mt-1">Callbacks + reminders go out from this number.</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Signed today" value={signedToday} />
        <Stat label="Pending" value={pending} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Helpers                                                    */

function bandClasses(band: TriageBand) {
  switch (band) {
    case 'RED':
      return {
        cardBorder: 'border-red-500/50',
        dot: 'bg-red-500',
        text: 'text-red-600 dark:text-red-400',
        pill: 'border-red-500/40 text-red-700 dark:text-red-300',
      };
    case 'AMBER':
      return {
        cardBorder: 'border-amber-500/50',
        dot: 'bg-amber-500',
        text: 'text-amber-600 dark:text-amber-400',
        pill: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
      };
    case 'GREEN':
    default:
      return {
        cardBorder: 'border-emerald-500/50',
        dot: 'bg-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400',
        pill: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
      };
  }
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
