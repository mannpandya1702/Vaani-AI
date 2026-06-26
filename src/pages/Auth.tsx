import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, Phone, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

type Method = 'email' | 'phone';
type Stage = 'enter' | 'otp';

/**
 * Real Supabase auth — passwordless via email magic link OR phone OTP.
 * The hackathon-production-ready replacement for the DemoGate token gate.
 *
 * Method choice:
 *   - Email magic link: simplest, works on any browser, no SMS cost. Default.
 *   - Phone OTP (E.164 only): more friction but the production patient flow
 *     once a DLT-registered Msg91 template is wired in Supabase Phone Auth
 *     settings. Until then, Supabase falls back to its default SMS provider
 *     (Twilio / MessageBird) — works for testing.
 *
 * Role:
 *   - Default `app_metadata.role = 'patient'` for new signups.
 *   - `eval/promote-rmp.ts` (CLI script with service role) promotes a user
 *     to `app_metadata.role = 'rmp'` so they can access /cockpit.
 *   - Admin-set roles only — never user-settable.
 */
export default function Auth() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>('email');
  const [stage, setStage] = useState<Stage>('enter');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  // If user is already signed in, route them to the surface they have role for.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted || !session) return;
      const role = (session.user.app_metadata?.role as string) ?? 'patient';
      navigate(role === 'rmp' || role === 'admin' ? '/cockpit' : '/asha');
    });
    return () => { mounted = false; };
  }, [navigate]);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (method === 'email') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin + '/auth' },
        });
        if (error) throw error;
        toast.success('Check your email for the sign-in link');
        // Stay on stage='enter' — the user clicks the magic link from email.
      } else {
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
        toast.success(`OTP sent to ${phone}`);
        setStage('otp');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms',
      });
      if (error) throw error;
      const role = (data.session?.user.app_metadata?.role as string) ?? 'patient';
      toast.success('Signed in');
      navigate(role === 'rmp' || role === 'admin' ? '/cockpit' : '/asha');
    } catch (err: any) {
      toast.error(err?.message ?? 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="vaani-bindi" />
            <span className="text-xl font-semibold">vaani · वाणी</span>
          </div>
          <h1 className="text-2xl font-semibold">Sign in to Vaani-AI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Passwordless · DPDP-compliant · audit-logged
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 space-y-5">
          {/* Method toggle */}
          <div className="inline-flex w-full border rounded-full p-1">
            {(['email', 'phone'] as Method[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMethod(m); setStage('enter'); }}
                className={cn(
                  'flex-1 px-4 py-1.5 text-sm rounded-full transition inline-flex items-center justify-center gap-1.5',
                  method === m ? 'bg-foreground text-background' : 'text-muted-foreground',
                )}
              >
                {m === 'email' ? <Mail className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                {m === 'email' ? 'Email link' : 'Phone OTP'}
              </button>
            ))}
          </div>

          {stage === 'enter' ? (
            <form onSubmit={sendOtp} className="space-y-3">
              {method === 'email' ? (
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full h-12 px-4 rounded-lg border bg-background"
                />
              ) : (
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="+91XXXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  pattern="^\+\d{10,15}$"
                  autoComplete="tel"
                  className="w-full h-12 px-4 rounded-lg border bg-background font-mono"
                />
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-lg bg-vaani-saffron text-vaani-navy font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {loading ? '…' : method === 'email' ? 'Email me a link' : 'Send OTP'}
              </button>
              {method === 'email' && (
                <p className="text-xs text-muted-foreground text-center">
                  We'll email you a sign-in link. No password, no SMS.
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Code sent to <span className="font-mono">{phone}</span>.
                <button
                  type="button"
                  onClick={() => setStage('enter')}
                  className="ml-2 underline"
                >
                  change
                </button>
              </div>
              <input
                inputMode="numeric"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                pattern="\d{6}"
                autoComplete="one-time-code"
                className="w-full h-12 px-4 rounded-lg border bg-background font-mono text-center text-2xl tracking-[0.5em]"
              />
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full h-12 rounded-lg bg-vaani-saffron text-vaani-navy font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {loading ? '…' : 'Verify'}
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center inline-flex items-center justify-center gap-1.5 w-full">
          <Shield className="w-3 h-3" />
          By signing in you accept the Vaani-AI pilot terms + privacy policy
          (DPDP 2023).
        </p>
      </div>
    </main>
  );
}
