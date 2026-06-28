// AshaLiveKit.tsx
// ──────────────────────────────────────────────────────────────────
// LiveKit-powered voice front-door — the India-based alternative to the
// VAPI /asha page. Connects the browser to a LiveKit room; the deployed
// Vaani Cloud Agent (Sarvam STT/TTS + Claude via the safety proxy)
// auto-dispatches into the room and talks back.
//
// This is a SEPARATE route (/asha-live). The VAPI /asha page is untouched.
// ──────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, ConnectionState } from 'livekit-client';
import { Mic, PhoneOff, Loader2, Globe } from 'lucide-react';

type Lang = 'hi' | 'ta';
const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Phase = 'idle' | 'connecting' | 'connected' | 'ended' | 'error';

export default function AshaLiveKit() {
  const [lang, setLang] = useState<Lang>('hi');
  const [phase, setPhase] = useState<Phase>('idle');
  const [agentJoined, setAgentJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => { roomRef.current?.disconnect(); }, []);

  async function start() {
    setError(null);
    setPhase('connecting');
    setAgentJoined(false);
    try {
      // Prefer the authenticated session token; fall back to the anon key.
      // The token endpoint validates a project JWT via authorizeCockpitRequest,
      // which checks the `ref` claim — the anon key carries it, a user session
      // token does not. Send the anon key (same as the cockpit's own calls).
      const bearer = ANON;

      const resp = await fetch(`${FN_BASE}/livekit-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      const body = await resp.json();
      if (!resp.ok) throw new Error(body?.error ?? `token ${resp.status}`);

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.autoplay = true;
          audioBoxRef.current?.appendChild(el);
        }
      });
      room.on(RoomEvent.ParticipantConnected, () => setAgentJoined(true));
      room.on(RoomEvent.ConnectionStateChanged, (s) => {
        if (s === ConnectionState.Disconnected) setPhase('ended');
      });

      await room.connect(body.url, body.token);
      // The agent may already be in the room by the time we connect.
      if (room.remoteParticipants.size > 0) setAgentJoined(true);
      await room.localParticipant.setMicrophoneEnabled(true);
      setPhase('connected');
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPhase('error');
      roomRef.current?.disconnect();
    }
  }

  async function stop() {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setPhase('ended');
  }

  const connecting = phase === 'connecting';
  const connected = phase === 'connected';
  return (
    <div className="min-h-screen vaani-mesh text-vaani-paper flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm vaani-elevated text-foreground p-7 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          <span className="vaani-bindi" aria-hidden /> वाणी · Vaani
        </div>

        {/* mic orb */}
        <div className="mt-6 flex justify-center">
          <div
            className={[
              'relative w-24 h-24 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-warning',
              connected ? 'animate-saffron-pulse' : '',
            ].join(' ')}
          >
            {connecting
              ? <Loader2 className="w-9 h-9 text-primary-foreground animate-spin" />
              : <Mic className="w-9 h-9 text-primary-foreground" />}
            {connected && <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-vaani-green ring-4 ring-card" />}
          </div>
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight">Talk to Vaani Didi</h1>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          She screens in your language. A registered doctor reviews &amp; signs every note.
        </p>

        {/* language toggle (disabled mid-call) */}
        <div className="mt-5 inline-flex rounded-xl border border-border bg-muted/40 p-1 text-sm">
          {(['hi', 'ta'] as Lang[]).map((l) => (
            <button
              key={l}
              disabled={connecting || connected}
              onClick={() => setLang(l)}
              className={[
                'px-4 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 font-medium',
                lang === l ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                (connecting || connected) ? 'opacity-60' : '',
              ].join(' ')}
            >
              <Globe className="w-3.5 h-3.5" /> {l === 'hi' ? 'हिंदी' : 'தமிழ்'}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {connected ? (
            <button
              onClick={stop}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-destructive text-destructive-foreground py-3.5 font-semibold hover:brightness-105 transition"
            >
              <PhoneOff className="w-4 h-4" /> End call
            </button>
          ) : (
            <button
              onClick={start}
              disabled={connecting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold shadow-lg shadow-primary/25 hover:brightness-105 transition disabled:opacity-60"
            >
              {connecting
                ? (<><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</>)
                : (<><Mic className="w-4 h-4" /> Start call</>)}
            </button>
          )}
        </div>

        <div className="mt-4 h-5 text-xs font-medium">
          {connected && (
            <span className={agentJoined ? 'text-accent' : 'text-warning'}>
              {agentJoined ? '● Vaani is on the line — speak now' : '● connected — waiting for Vaani…'}
            </span>
          )}
          {phase === 'ended' && <span className="text-muted-foreground">Call ended.</span>}
          {phase === 'error' && <span className="text-destructive">Error: {error}</span>}
        </div>
      </div>

      <p className="mt-5 text-[11px] text-vaani-paper/60 max-w-sm text-center">
        In your language · private &amp; DPDP-compliant · a doctor signs every note.
      </p>
      {/* agent audio sinks mount here */}
      <div ref={audioBoxRef} className="hidden" />
    </div>
  );
}
