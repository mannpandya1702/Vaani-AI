import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Shield } from 'lucide-react';

/**
 * Lightweight demo-route gate. Production would use Supabase auth; for
 * the hackathon, the requirement is "stop scrapers and random URLs from
 * landing on /cockpit and /asha", not "enforce a real session."
 *
 * Accepts a token via:
 *   1. `?demo=<token>` query string — the URL the founder hands out
 *   2. `localStorage.vaani_demo_token` — persisted after a successful
 *      query-string entry
 *
 * The expected token is the value of `VITE_DEMO_TOKEN` env var. If the
 * env var isn't set, the gate is OPEN (so local dev doesn't require a
 * token); set `VITE_DEMO_TOKEN` in production .env to engage the gate.
 */
const STORAGE_KEY = 'vaani_demo_token';
const EXPECTED = import.meta.env.VITE_DEMO_TOKEN as string | undefined;

export function DemoGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!EXPECTED) { setGranted(true); return; }
    const params = new URLSearchParams(location.search);
    const queryToken = params.get('demo');
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (queryToken === EXPECTED) {
      try { localStorage.setItem(STORAGE_KEY, queryToken); } catch {/* private mode */}
      setGranted(true);
    } else if (stored === EXPECTED) {
      setGranted(true);
    } else {
      setGranted(false);
    }
  }, [location.search]);

  if (granted === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">…</div>
      </div>
    );
  }

  if (granted) return <>{children}</>;

  return <DemoGateBlocked />;
}

function DemoGateBlocked() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center mb-5">
        <Shield className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">Restricted demo</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This surface is part of an AI clinical-decision-support research prototype
        (Vaani-AI). It is not a public product. Access is by demo invite only —
        append <code className="px-1 rounded bg-muted">?demo=&lt;your token&gt;</code> to
        the URL, or return to the <a href="/" className="underline text-foreground">landing page</a>.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Need access? Contact the team via the GitHub repo.
      </p>
    </div>
  );
}

export default DemoGate;
