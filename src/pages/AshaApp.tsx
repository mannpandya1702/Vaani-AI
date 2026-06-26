import { useEffect, useRef, useState } from 'react';
import Vapi from '@vapi-ai/web';
import { Mic, PhoneOff, Languages, CircleStop, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Lang = 'hi' | 'ta';
type CallState = 'idle' | 'connecting' | 'in-call' | 'ending' | 'ended';
type TranscriptTurn = { idx: number; role: 'user' | 'assistant'; text: string; final: boolean };

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
  const vapiRef = useRef<Vapi | null>(null);

  useEffect(() => {
    if (!PUBLIC_KEY) return;
    const vapi = new Vapi(PUBLIC_KEY);
    vapiRef.current = vapi;

    vapi.on('call-start', () => setState('in-call'));
    vapi.on('call-end', () => setState('ended'));
    vapi.on('speech-start', () => setSpeechLevel(1));
    vapi.on('speech-end', () => setSpeechLevel(0));
    vapi.on('volume-level', (lvl: number) => setSpeechLevel(lvl));
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
      vapi.stop();
      vapiRef.current = null;
    };
  }, []);

  async function start() {
    if (!vapiRef.current) return;
    if (!ASSISTANT_BY_LANG[lang]) {
      toast.error('No assistant configured for ' + lang);
      return;
    }
    setTurns([]);
    setCallId(null);
    setState('connecting');
    try {
      await vapiRef.current.start(ASSISTANT_BY_LANG[lang]);
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
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded-md border border-amber-500/70 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-1">
          AI · DEMO MODE
        </span>
      </header>

      <main className="flex-1 flex flex-col">
        {!inCall && state !== 'ended' && (
          <section className="flex-1 flex flex-col items-center justify-center p-6">
            <LangToggle value={lang} onChange={setLang} disabled={inCall} />

            <button
              type="button"
              onClick={start}
              className="mt-10 w-44 h-44 rounded-full bg-vaani-saffron text-vaani-navy shadow-xl flex items-center justify-center hover:scale-105 transition-transform active:scale-95"
              aria-label="Start a new call"
            >
              <Mic className="w-16 h-16" />
            </button>

            <p className="mt-8 text-lg font-medium" lang={lang}>
              {lang === 'hi' ? 'नई कॉल शुरू करें' : 'புதிய அழைப்பைத் தொடங்கவும்'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === 'hi' ? 'मरीज़ का फ़ोन Vaani से जोड़ें' : 'Vaani உடன் நோயாளியை இணைக்கவும்'}
            </p>
          </section>
        )}

        {inCall && (
          <section className="flex-1 flex flex-col">
            <div className="flex items-center gap-3 border-b px-4 py-3 bg-vaani-saffron/10">
              <CallPulse level={speechLevel} active={state === 'in-call'} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">
                  {state === 'connecting' && 'Connecting…'}
                  {state === 'in-call' && (lang === 'hi' ? 'Vaani बात कर रही हैं' : 'Vaani பேசுகிறார்')}
                  {state === 'ending' && 'Wrapping up…'}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  Assistant {ASSISTANT_BY_LANG[lang]?.slice(0, 8)}…
                </div>
              </div>
              <button
                onClick={stop}
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
          <section className="flex-1 flex flex-col items-center justify-center p-6 text-center">
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
            {callId && (
              <code className="mt-3 text-[11px] text-muted-foreground">call: {callId.slice(0, 8)}…</code>
            )}
            <button
              onClick={() => { setState('idle'); setTurns([]); setCallId(null); }}
              className="mt-6 rounded-full bg-vaani-saffron text-vaani-navy px-6 py-2.5 font-semibold inline-flex items-center gap-2 active:scale-95"
            >
              <Phone className="w-4 h-4" />
              {lang === 'hi' ? 'नई कॉल' : 'புதிய அழைப்பு'}
            </button>
          </section>
        )}
      </main>

      <footer className="text-[11px] text-muted-foreground p-3 text-center border-t">
        Vaani-AI · AI-assisted health screening · Decisions reviewed by the named RMP.
      </footer>
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
