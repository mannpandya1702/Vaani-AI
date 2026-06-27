import { useEffect, useRef, useState } from 'react';
import Vapi from '@vapi-ai/web';
import * as Dialog from '@radix-ui/react-dialog';
import { Mic, PhoneOff, Languages, CircleStop, Phone, Shield, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const ACK_STORAGE_KEY = 'vaani_demo_acknowledged_v1';

type Lang = 'hi' | 'ta';
type CallState = 'idle' | 'connecting' | 'in-call' | 'ending' | 'ended';
type TranscriptTurn = { idx: number; role: 'user' | 'assistant'; text: string; final: boolean };

// Shared ref so MicCheck can be force-released from outside (right before
// vapi.start). Two concurrent getUserMedia consumers on the same default
// device — MicCheck + Daily.co — yields a silent track to the second
// caller on Chrome/Windows + USB headsets. Found in the 9-dim board audit.
const micCheckStopRef: { current: null | (() => void) } = { current: null };

const PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY as string;
const ASSISTANT_BY_LANG: Record<Lang, string> = {
  hi: import.meta.env.VITE_VAPI_ASSISTANT_ID_HI as string,
  ta: import.meta.env.VITE_VAPI_ASSISTANT_ID_TA as string,
};

export default function AshaApp() {
  const [lang, setLang] = useState<Lang>('hi');
  const [state, setState] = useState<CallState>('idle');
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  // endedReason: differentiates "user-end" (CircleStop OK), "silence-timeout"
  // (yellow caution), and "error" (red alert). Audit §4 ended-screen item.
  const [endedReason, setEndedReason] = useState<'user' | 'silence-timeout' | 'error' | null>(null);
  // Mute toggle for in-call mic — audit §4 missing UX item.
  const [muted, setMuted] = useState(false);
  // Slide-1 disclosure acknowledgment — Anand-mandated, NMC Act 2019 +
  // IMC Reg 6.1.1. Mic button is disabled until all three checkboxes are
  // ticked and the modal is closed. Stored in localStorage so a refresh
  // doesn't re-prompt; the schema-versioned key (`_v1`) lets us re-prompt
  // when the verbatim text changes.
  const [acknowledged, setAcknowledged] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return !!JSON.parse(localStorage.getItem(ACK_STORAGE_KEY) ?? 'null'); }
    catch { return false; }
  });
  const vapiRef = useRef<Vapi | null>(null);

  useEffect(() => {
    if (!PUBLIC_KEY) return;
    // alwaysIncludeMicInPermissionPrompt: forces VAPI to always re-request mic
    //   permission (helps if Daily.co cached a denied state silently).
    // Removed { startAudioOff: false } as 4th arg — board audit found SDK only
    // reads `audioSource` from that position; the flag was dead code.
    const vapi = new Vapi(
      PUBLIC_KEY,
      undefined,
      { alwaysIncludeMicInPermissionPrompt: true } as any,
    );
    vapiRef.current = vapi;

    vapi.on('call-start', () => setState('in-call'));
    vapi.on('call-end', (ev?: any) => {
      // VAPI's ended-reason: 'silence-timed-out', 'customer-ended-call',
      // 'assistant-ended-call', 'pipeline-error-*'.
      const reason = String(ev?.endedReason ?? ev?.reason ?? '').toLowerCase();
      if (reason.includes('silence') || reason.includes('timeout')) setEndedReason('silence-timeout');
      else if (reason.includes('error') || reason.includes('failed')) setEndedReason('error');
      else setEndedReason('user');
      setState('ended');
    });
    vapi.on('speech-start', () => setSpeechLevel(1));
    vapi.on('speech-end', () => setSpeechLevel(0));
    vapi.on('volume-level', (lvl: number) => setSpeechLevel(lvl));
    // Stage-by-stage progress for the start sequence — surfaces auth/daily/
    // media/ICE failures with the exact stage name. Without these we only
    // saw a generic "error: unknown" and had no idea what part of VAPI's
    // pipeline broke.
    vapi.on('call-start-progress' as any, (ev: any) => {
      console.log('[vapi.start-progress]', ev?.stage, ev?.status, ev);
    });
    vapi.on('call-start-failed' as any, (ev: any) => {
      console.error('[vapi.start-failed]', ev);
      toast.error(`Start failed at ${ev?.stage ?? '?'}: ${ev?.error ?? 'unknown'}`);
      setState('idle');
    });
    vapi.on('network-quality-change' as any, (ev: any) => {
      console.log('[vapi.netq]', ev);
    });
    vapi.on('network-connection' as any, (ev: any) => {
      console.log('[vapi.netconn]', ev);
    });
    vapi.on('message', (msg: any) => {
      // VAPI emits both partial (deltas) and final transcripts.
      if (msg?.type === 'transcript') {
        const role = msg.role === 'user' ? 'user' : 'assistant';
        const text = String(msg.transcript ?? '').trim();
        const final = msg.transcriptType === 'final';
        if (!text) return;
        setTurns((prev) => {
          // Replace the last in-flight partial of the same role; otherwise append
          const last = prev[prev.length - 1];
          if (last && last.role === role && !last.final) {
            const next = [...prev];
            next[next.length - 1] = { ...last, text, final };
            return next;
          }
          return [...prev, { idx: prev.length, role, text, final }];
        });
      } else if (msg?.type === 'status-update' && msg?.call?.id) {
        setCallId(msg.call.id);
      } else if (msg?.type === 'conversation-update' && msg?.conversation) {
        // best-effort call-id capture
        const id = msg.conversation?.id ?? msg?.call?.id;
        if (id) setCallId(id);
      }
    });
    vapi.on('error', (err: any) => {
      console.error('[vapi] error', err);
      // Surface every plausible field so we never show a bare "unknown" again.
      const detail =
        err?.errorMsg ??
        err?.error?.message ??
        err?.error?.errorMsg ??
        err?.error?.error ??
        err?.message ??
        err?.type ??
        (typeof err === 'string' ? err : JSON.stringify(err)?.slice(0, 200)) ??
        'unknown';
      const keyPreview = String(PUBLIC_KEY ?? '').slice(0, 8) || '<missing>';
      toast.error(`Call error: ${detail}  ·  key=${keyPreview}…`);
      setState('idle');
    });

    return () => {
      // Audit §4: removeAllListeners() to avoid double-binding under
      // React 18 Strict-Mode's intentional double-mount in dev. Without
      // this, every dev re-render binds another set of listeners and
      // events fire 2N times.
      try { vapi.removeAllListeners(); } catch {/* SDK version w/o the method */}
      vapi.stop();
      vapiRef.current = null;
    };
  }, []);

  // Audit §4: if `state === 'ending'` never transitions because
  // call-end never fires (network drop, SDK bug), fall back to 'ended'
  // after 5 seconds so the user isn't stuck.
  useEffect(() => {
    if (state !== 'ending') return;
    const id = window.setTimeout(() => {
      setState('ended');
      setEndedReason('error');
    }, 5000);
    return () => window.clearTimeout(id);
  }, [state]);

  async function start() {
    if (!vapiRef.current) return;
    if (!ASSISTANT_BY_LANG[lang]) {
      toast.error('No assistant configured for ' + lang);
      return;
    }
    if (!acknowledged) {
      toast.error('Please acknowledge the pilot disclosure before starting a call.');
      return;
    }
    // If the user signed in via phone OTP, forward their phone to VAPI as
    // assistant metadata so handleCallStarted can attach the calls row to
    // a real patient record (keyed by phone_e164) instead of an anonymous
    // placeholder. Falls back to the email if only that's available.
    const { data: { user } } = await supabase.auth.getUser();
    const callerPhone = (user?.phone && user.phone.startsWith('+')) ? user.phone : undefined;
    const callerEmail = user?.email ?? undefined;
    // Release MicCheck's getUserMedia BEFORE Daily.co grabs the mic. Two
    // concurrent consumers on the same default device silently yields an
    // empty track to the second caller on Chrome/Windows + USB headsets.
    // Found in the 9-dim board audit (1.C).
    if (micCheckStopRef.current) {
      try { micCheckStopRef.current(); } catch (e) { console.warn('[mic-check] stop failed', e); }
      micCheckStopRef.current = null;
      // Tiny delay to let the OS-level handle actually close before Daily
      // requests a fresh getUserMedia. 200ms is empirically the safe floor.
      await new Promise((r) => setTimeout(r, 200));
    }
    setTurns([]);
    setCallId(null);
    setState('connecting');
    try {
      // Pass the authenticated caller's identity as VAPI assistantOverrides
      // metadata. vapi-webhook reads message.call.assistantOverrides.metadata
      // in handleCallStarted to attach a real patient row.
      await vapiRef.current.start(
        ASSISTANT_BY_LANG[lang],
        {
          metadata: {
            caller_phone_e164: callerPhone,
            caller_email: callerEmail,
            caller_lang: lang,
            client: 'asha-web',
          },
        } as any,
      );
    } catch (e: any) {
      console.error(e);
      toast.error('Could not start call: ' + (e?.message ?? e));
      setState('idle');
    }
  }

  function stop() {
    if (!vapiRef.current) return;
    setState('ending');
    vapiRef.current.stop();
  }

  const inCall = state === 'in-call' || state === 'connecting' || state === 'ending';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-2">
        <span className="vaani-bindi" />
        <span className="font-semibold">vaani · ASHA</span>
        <span className="ml-auto inline-flex items-center gap-2 text-[10px] font-mono rounded-md border bg-muted/40 text-muted-foreground px-2 py-1" title="Public key prefix loaded by Vite from .env.local">
          key: {String(PUBLIC_KEY ?? '').slice(0, 8) || '<missing>'}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded-md border bg-foreground/5 text-foreground/80 px-2 py-1" title="AI-Assisted Screening · Pilot — every clinical note is reviewed and signed by a Registered Medical Practitioner.">
          AI-Assisted · Pilot
        </span>
      </header>

      <main className="flex-1 flex flex-col">
        {!inCall && state !== 'ended' && (
          <section className="flex-1 flex flex-col items-center justify-center p-6">
            <LangToggle value={lang} onChange={setLang} disabled={inCall} />

            <MicCheck />

            <button
              type="button"
              onClick={start}
              disabled={!acknowledged}
              className={cn(
                'mt-6 w-44 h-44 rounded-full bg-vaani-saffron text-vaani-navy shadow-xl flex items-center justify-center transition-transform',
                acknowledged ? 'hover:scale-105 active:scale-95' : 'opacity-50 cursor-not-allowed',
              )}
              aria-label="Start a new call"
            >
              <Mic className="w-16 h-16" />
            </button>
            {!acknowledged && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                Acknowledge the demo disclosure below to enable the call.
              </p>
            )}

            <p className="mt-8 text-lg font-medium" lang={lang}>
              {lang === 'hi' ? 'नई कॉल शुरू करें' : 'புதிய அழைப்பைத் தொடங்கவும்'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === 'hi' ? 'मरीज़ का फ़ोन Vaani से जोड़ें' : 'Vaani உடன் நோயாளியை இணைக்கவும்'}
            </p>
          </section>
        )}

        {inCall && (
          <section className="flex-1 flex flex-col" aria-live="polite" aria-label="Active call">
            <div className="flex items-center gap-3 border-b px-4 py-3 bg-vaani-saffron/10">
              <CallPulse level={speechLevel} active={state === 'in-call'} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {state === 'connecting' && (lang === 'hi' ? 'जुड़ रहे हैं…' : 'Connecting…')}
                  {state === 'in-call' && (lang === 'hi' ? 'Vaani बात कर रही हैं' : 'Vaani பேசுகிறார்')}
                  {state === 'ending' && (lang === 'hi' ? 'कॉल बंद हो रही है…' : 'Ending…')}
                </div>
                <div className="text-xs text-muted-foreground truncate" aria-hidden>
                  {/* Audit §4: assistant UUID was leaking into the header. Show a
                      friendly name instead. */}
                  {lang === 'hi' ? 'हिंदी स्क्रीनिंग' : 'தமிழ் திரையிடல்'} · live
                </div>
              </div>
              <button
                onClick={() => {
                  if (!vapiRef.current) return;
                  const next = !muted;
                  try { vapiRef.current.setMuted(next); setMuted(next); } catch {/* SDK guard */}
                }}
                aria-pressed={muted}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                title={muted ? 'Unmute' : 'Mute'}
                className={cn(
                  'rounded-full px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5',
                  muted ? 'bg-amber-500 text-white hover:bg-amber-600' : 'border bg-card hover:bg-secondary/60',
                )}
              >
                {muted ? <PhoneOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {muted ? 'Muted' : 'Mute'}
              </button>
              <button
                onClick={stop}
                aria-label="End call"
                className="rounded-full bg-red-600 text-white px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 hover:bg-red-700"
              >
                <PhoneOff className="w-4 h-4" />
                End
              </button>
            </div>

            <TranscriptStream turns={turns} lang={lang} />
          </section>
        )}

        {state === 'ended' && (
          <section className="flex-1 flex flex-col items-center justify-center p-6 text-center" aria-live="polite">
            {endedReason === 'silence-timeout' ? (
              <>
                <div className="w-20 h-20 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Mic className="w-10 h-10" />
                </div>
                <h2 className="mt-5 text-lg font-semibold">
                  {lang === 'hi' ? 'आवाज़ नहीं आई' : 'குரல் கேட்கவில்லை'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  {lang === 'hi'
                    ? 'Vaani को आपकी आवाज़ नहीं सुनाई दी। मरीज़ का माइक चेक कीजिए और दोबारा कोशिश कीजिए।'
                    : 'மைக் சரியாக இல்லை. மீண்டும் முயற்சி செய்யுங்கள்.'}
                </p>
              </>
            ) : endedReason === 'error' ? (
              <>
                <div className="w-20 h-20 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center text-3xl">
                  !
                </div>
                <h2 className="mt-5 text-lg font-semibold">
                  {lang === 'hi' ? 'कॉल में दिक़्क़त हुई' : 'அழைப்பில் பிழை'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  {lang === 'hi' ? 'दोबारा कोशिश कीजिए।' : 'மீண்டும் முயற்சிக்கவும்.'}
                </p>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 14 }}
                  className="w-20 h-20 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"
                >
                  <CircleStop className="w-10 h-10" />
                </motion.div>
                <h2 className="mt-5 text-lg font-semibold">
                  {lang === 'hi' ? 'कॉल पूरी हुई' : 'அழைப்பு முடிந்தது'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  {lang === 'hi'
                    ? 'डॉक्टर साहब रिपोर्ट देखेंगे और मरीज़ को फिर से फ़ोन करेंगे।'
                    : 'டாக்டர் அறிக்கையை ஆராய்ந்து மீண்டும் அழைப்பார்.'}
                </p>
              </>
            )}

            {callId && (
              <code className="mt-3 text-[11px] text-muted-foreground" aria-label={`Call id ${callId}`}>
                call: {callId.slice(0, 8)}…
              </code>
            )}

            <LangToggle value={lang} onChange={setLang} />

            <button
              onClick={() => { setState('idle'); setTurns([]); setCallId(null); setEndedReason(null); setMuted(false); }}
              aria-label="Start a new call"
              className="mt-4 rounded-full bg-vaani-saffron text-vaani-navy px-6 py-2.5 font-semibold inline-flex items-center gap-2 active:scale-95"
            >
              <Phone className="w-4 h-4" />
              {lang === 'hi' ? 'नई कॉल' : 'புதிய அழைப்பு'}
            </button>
          </section>
        )}
      </main>

      <footer className="text-[11px] text-muted-foreground p-3 text-center border-t">
        Vaani-AI · AI-assisted health screening · Research prototype · Cockpit RMP independently reviews + signs.
      </footer>

      <DisclosureModal
        open={!acknowledged}
        onAcknowledge={() => {
          const payload = { acknowledged_at: new Date().toISOString(), schema: 'v1' };
          try { localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(payload)); } catch {/* private mode */}
          setAcknowledged(true);
        }}
      />
    </div>
  );
}

/**
 * Slide-1 / Anand-mandated disclosure modal. Non-dismissible (no X, no
 * Escape-to-close), three checkboxes that must ALL be ticked, and a
 * primary "Begin" CTA that's disabled until they are. Verbatim text is
 * in docs/legal-verbatim.md — DO NOT paraphrase here without updating
 * that source-of-truth and getting Anand to sign.
 *
 * Acknowledgment is persisted to localStorage under a versioned key
 * (ACK_STORAGE_KEY) so a tab refresh doesn't re-prompt the volunteer
 * mid-shoot, but a copy change bumps the version and re-prompts.
 */
function DisclosureModal({ open, onAcknowledge }: { open: boolean; onAcknowledge: () => void }) {
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const allChecked = c1 && c2 && c3;

  return (
    <Dialog.Root open={open} modal>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80]" />
        <Dialog.Content
          // Non-dismissible: block escape + outside-click
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl"
        >
          <div className="sticky top-0 bg-card/95 backdrop-blur border-b px-5 py-3 flex items-center gap-3">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <Dialog.Title className="text-lg font-semibold leading-tight">Before you begin</Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                Mandatory pilot disclosure · DPDP 2023 · NMC Act 2019 · IMC Reg 6.1.1
              </Dialog.Description>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded-md border bg-foreground/5 text-foreground/80 px-2 py-1">
              AI-Assisted · Pilot
            </span>
          </div>

          <div className="p-5 space-y-4 text-sm leading-relaxed">
            <p>
              Vaani-AI is an <b>AI-assisted screening pilot</b>. Vaani is an AI voice screener, NOT a doctor — she
              captures your symptoms in your language and passes the report to a real Registered Medical Practitioner.
              No diagnosis, prescription, or treatment is given by the AI. <b>The doctor on the cockpit is a real,
              named, SMC-verified, HPR-linked under ABDM RMP</b> who independently reviews and signs every clinical
              note before any patient-facing action. By proceeding, you consent to the call being recorded for that
              review.
            </p>

            <p lang="hi" className="font-hind text-base">
              वाणी-AI एक रिसर्च प्रोटोटाइप है — सिर्फ़ AI सहायता का प्रदर्शन है। आज इस मंच पर कोई इलाज, निदान, पर्चा या दवा
              नहीं दी जा रही। सभी कॉलर सहमति देने वाले वयस्क स्वयंसेवक हैं; किसी डॉक्टर-मरीज़ रिश्ते की कोई बात नहीं।
              <b> 'वाणी' एक AI सहायक है, डॉक्टर नहीं।</b> कॉकपिट पर बैठे डॉक्टर साहब वास्तविक हैं — SMC-प्रमाणित, HPR-ABDM
              से जुड़े — हर रिपोर्ट वो ख़ुद देखकर सिग्नेचर करते हैं।
            </p>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={c1}
                  onChange={(e) => setC1(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-vaani-saffron"
                />
                <span>I understand Vaani is an AI, NOT a doctor. Any clinical advice comes from the RMP after they review my report.</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={c2}
                  onChange={(e) => setC2(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-vaani-saffron"
                />
                <span>I am an adult (18+) consented volunteer or am consenting on behalf of an adult volunteer present.</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={c3}
                  onChange={(e) => setC3(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-vaani-saffron"
                />
                <span>
                  I have read and signed the volunteer consent form (
                  <a href="/docs/legal/volunteer-consent-v3.md" target="_blank" rel="noreferrer" className="underline">v3</a>
                  ) before this session.
                </span>
              </label>
            </div>

            <p className="text-xs text-muted-foreground">
              Saying <b>"रोको"</b> (Hindi) or <b>"stop"</b> any time ends the call and erases the recording. The
              recording exists only to be reviewed by the named RMP; it is not used for AI training.
            </p>
          </div>

          <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t px-5 py-3 flex items-center gap-3">
            <div className="flex-1 text-xs text-muted-foreground">
              {allChecked
                ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> All three acknowledged</span>
                : <>Tick all three to enable the call.</>}
            </div>
            <button
              type="button"
              onClick={onAcknowledge}
              disabled={!allChecked}
              className={cn(
                'text-sm px-5 py-2 rounded-md font-semibold transition',
                allChecked
                  ? 'bg-vaani-saffron text-vaani-navy hover:opacity-90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              I understand · Begin
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Pre-call mic-level meter. Opens the browser mic with getUserMedia,
 * pipes it into an AnalyserNode, and shows live RMS level. Lets the
 * user (and us) confirm that the browser/OS mic is actually working
 * BEFORE we hand it to the VAPI SDK. If this meter doesn't move when
 * the user speaks, no amount of fixing on the VAPI side will help.
 */
function MicCheck() {
  const [state, setState] = useState<'idle' | 'running' | 'denied' | 'no-device'>('idle');
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [device, setDevice] = useState<string>('');
  const streamRef = useRef<MediaStream | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      setDevice(track?.label || 'default mic');
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ac = new AC();
      acRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      setPeak(0);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let max = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128);
          if (v > max) max = v;
        }
        const lvl = Math.min(1, max / 64);
        setLevel(lvl);
        setPeak((p) => (lvl > p ? lvl : p * 0.99));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setState('running');
    } catch (e: any) {
      console.error('[mic-check]', e);
      if (e?.name === 'NotAllowedError') setState('denied');
      else if (e?.name === 'NotFoundError') setState('no-device');
      else setState('denied');
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    acRef.current?.close().catch(() => {});
    streamRef.current = null;
    acRef.current = null;
    setLevel(0);
    setPeak(0);
    setState('idle');
  }

  // Expose stop() to AshaApp.start() so it can release the mic BEFORE
  // Daily.co tries to grab it. Without this, two concurrent getUserMedia
  // consumers on the default device produces a silent track to the
  // second caller. Board-audit finding 1.C.
  useEffect(() => {
    micCheckStopRef.current = stop;
    return () => {
      if (micCheckStopRef.current === stop) micCheckStopRef.current = null;
    };
  });

  useEffect(() => () => { stop(); }, []);

  const widthPct = Math.round(level * 100);
  const peakPct = Math.round(peak * 100);
  const heard = peak > 0.08;

  return (
    <div className="mt-6 w-full max-w-sm rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Mic className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold">Mic check</span>
        {state === 'running' && heard && (
          <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">✓ heard</span>
        )}
        {state === 'denied' && (
          <span className="ml-auto text-xs text-red-600 dark:text-red-400">permission denied</span>
        )}
        {state === 'no-device' && (
          <span className="ml-auto text-xs text-red-600 dark:text-red-400">no mic found</span>
        )}
      </div>

      {state === 'idle' && (
        <button
          onClick={start}
          className="w-full text-sm rounded-md border bg-secondary/60 hover:bg-secondary px-3 py-2"
        >
          Test your microphone
        </button>
      )}

      {state === 'running' && (
        <>
          <div className="relative h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500 transition-[width] duration-75"
              style={{ width: `${widthPct}%` }}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-emerald-700/70"
              style={{ left: `${peakPct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="truncate max-w-[60%]" title={device}>{device}</span>
            <button onClick={stop} className="underline">stop</button>
          </div>
          {!heard && (
            <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
              Speak normally — the bar should jump. If it doesn't, check Windows Sound → Input.
            </div>
          )}
        </>
      )}

      {state === 'denied' && (
        <div className="text-xs text-muted-foreground">
          Click the mic icon in your browser's URL bar and choose <b>Allow</b>, then reload.
        </div>
      )}

      {state === 'no-device' && (
        <div className="text-xs text-muted-foreground">
          No microphone is connected. Plug one in and reload.
        </div>
      )}
    </div>
  );
}

function LangToggle({ value, onChange, disabled }: { value: Lang; onChange: (l: Lang) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex border rounded-full p-1 bg-card shadow-sm">
      {(['hi', 'ta'] as Lang[]).map((l) => (
        <button
          key={l}
          disabled={disabled}
          onClick={() => onChange(l)}
          className={cn(
            'px-4 py-1.5 text-sm rounded-full transition inline-flex items-center gap-1',
            value === l ? 'bg-vaani-navy text-white' : 'text-muted-foreground',
          )}
        >
          <Languages className="w-3.5 h-3.5" />
          {l === 'hi' ? 'हिन्दी' : 'தமிழ்'}
        </button>
      ))}
    </div>
  );
}

function CallPulse({ level, active }: { level: number; active: boolean }) {
  const scale = active ? 1 + Math.min(0.4, level * 0.4) : 1;
  return (
    <motion.div
      animate={{ scale }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      className={cn(
        'relative w-10 h-10 rounded-full flex items-center justify-center text-white',
        active ? 'bg-emerald-500' : 'bg-muted',
      )}
    >
      <Mic className="w-5 h-5" />
      {active && (
        <span className="absolute inset-0 rounded-full animate-ping bg-emerald-500/30" />
      )}
    </motion.div>
  );
}

function TranscriptStream({ turns, lang }: { turns: TranscriptTurn[]; lang: Lang }) {
  const tailRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { tailRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-screen-md mx-auto w-full">
      {turns.length === 0 && (
        <div className="text-sm text-muted-foreground text-center mt-10">
          {lang === 'hi' ? 'Vaani बोलना शुरू कर रही हैं…' : 'Vaani பேசத் தொடங்குகிறார்…'}
        </div>
      )}
      <AnimatePresence>
        {turns.map((t) => (
          <motion.div
            key={t.idx}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'rounded-2xl px-4 py-2 max-w-[85%] text-sm leading-relaxed shadow-sm',
              t.role === 'assistant' ? 'bg-vaani-saffron/15 self-start' : 'bg-vaani-navy text-white self-end ml-auto',
            )}
          >
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
              {t.role === 'assistant' ? 'Vaani' : (lang === 'hi' ? 'मरीज़' : 'நோயாளி')}
              {!t.final && <span className="ml-2">⋯</span>}
            </div>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={tailRef} />
    </div>
  );
}
