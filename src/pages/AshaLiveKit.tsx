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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-teal-50 to-white p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white shadow-sm p-6 text-center">
        <div className="text-xs font-semibold tracking-widest text-teal-600 uppercase">वाणी · Vaani</div>
        <h1 className="mt-1 text-xl font-semibold">Talk to Vaani Didi</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          LiveKit voice stack · Sarvam STT/TTS · doctor-safe AI
        </p>

        {/* language toggle (disabled mid-call) */}
        <div className="mt-4 inline-flex rounded-lg border p-0.5 text-sm">
          {(['hi', 'ta'] as Lang[]).map((l) => (
            <button
              key={l}
              disabled={phase === 'connecting' || phase === 'connected'}
              onClick={() => setLang(l)}
              className={[
                'px-3 py-1 rounded-md transition inline-flex items-center gap-1',
                lang === l ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-secondary/60',
                (phase === 'connecting' || phase === 'connected') ? 'opacity-60' : '',
              ].join(' ')}
            >
              <Globe className="w-3 h-3" /> {l === 'hi' ? 'हिंदी' : 'தமிழ்'}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {phase === 'connected' ? (
            <button
              onClick={stop}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white py-3 font-semibold hover:bg-red-700"
            >
              <PhoneOff className="w-4 h-4" /> End call
            </button>
          ) : (
            <button
              onClick={start}
              disabled={phase === 'connecting'}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 text-white py-3 font-semibold hover:bg-teal-700 disabled:opacity-60"
            >
              {phase === 'connecting'
                ? (<><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</>)
                : (<><Mic className="w-4 h-4" /> Start call</>)}
            </button>
          )}
        </div>

        <div className="mt-4 h-5 text-xs">
          {phase === 'connected' && (
            <span className={agentJoined ? 'text-teal-600' : 'text-amber-600'}>
              {agentJoined ? '● Vaani is on the line — speak now' : '● connected — waiting for Vaani to join…'}
            </span>
          )}
          {phase === 'ended' && <span className="text-muted-foreground">Call ended.</span>}
          {phase === 'error' && <span className="text-red-600">Error: {error}</span>}
        </div>
      </div>

      <p className="mt-4 text-[10px] text-muted-foreground max-w-sm text-center">
        Vaani screens and listens in your language; a registered doctor reviews and signs every note.
      </p>
      {/* agent audio sinks mount here */}
      <div ref={audioBoxRef} className="hidden" />
    </div>
  );
}
