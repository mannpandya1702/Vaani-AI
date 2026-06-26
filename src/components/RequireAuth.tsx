import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Shield } from 'lucide-react';

type Role = 'patient' | 'rmp' | 'admin';

interface Props {
  children: React.ReactNode;
  /** Required role; if omitted, any signed-in user is allowed. */
  role?: Role | Role[];
}

/**
 * Production replacement for DemoGate. Reads the Supabase session, checks
 * the user's `app_metadata.role` (set by the admin via `eval/promote-rmp.ts`,
 * never by the user), and either renders children, redirects to /auth,
 * or shows an "access denied" message.
 *
 * RLS on the backend is the actual security boundary. This wrapper is the
 * UX layer that gets the user to the right place quickly without hitting
 * a 403 on the cockpit-feed query.
 */
export function RequireAuth({ children, role }: Props) {
  const location = useLocation();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // Initial read.
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    // Subscribe so we react to magic-link sign-ins arriving via URL.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    // Loading the session — render nothing flashy.
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">…</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to={`/auth?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (role) {
    const userRole = (session.user.app_metadata?.role as Role) ?? 'patient';
    const allowed = Array.isArray(role) ? role.includes(userRole) : userRole === role;
    if (!allowed) return <RoleDenied have={userRole} need={Array.isArray(role) ? role : [role]} />;
  }

  return <>{children}</>;
}

function RoleDenied({ have, need }: { have: Role; need: Role[] }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center mb-5">
        <Shield className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">Access restricted</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Your account has role <code className="px-1 rounded bg-muted">{have}</code>. This surface requires{' '}
        <code className="px-1 rounded bg-muted">{need.join(' / ')}</code>. Ask an admin to promote your account
        via <code className="px-1 rounded bg-muted">eval/promote-rmp.ts</code>.
      </p>
      <button
        onClick={() => supabase.auth.signOut().then(() => window.location.assign('/auth'))}
        className="mt-5 text-sm rounded-md border bg-card hover:bg-secondary/60 px-3 py-1.5"
      >
        Sign out
      </button>
    </div>
  );
}

export default RequireAuth;
