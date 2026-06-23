import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Auth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const fn =
        mode === 'signin'
          ? supabase.auth.signInWithPassword
          : supabase.auth.signUp;
      const { error } = await fn.call(supabase.auth, { email, password });
      if (error) throw error;
      toast.success(mode === 'signin' ? 'Welcome back' : 'Check your email');
      navigate('/cockpit');
    } catch (err: any) {
      toast.error(err.message ?? 'Authentication failed');
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
            <span className="text-xl font-semibold">vaani</span>
          </div>
          <h1 className="text-2xl font-semibold">
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-6">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full h-12 px-4 rounded-lg border bg-background"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="w-full h-12 px-4 rounded-lg border bg-background"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === 'signin'
              ? "No account? Create one"
              : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
