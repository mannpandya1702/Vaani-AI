import { Routes, Route, NavLink } from 'react-router-dom';
import { LayoutGrid, Users, FileText, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Cockpit() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-2">
        <span className="vaani-bindi" />
        <span className="font-semibold">vaani · cockpit</span>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Routes>
          <Route index element={<TriageQueue />} />
          <Route path="patients" element={<Patients />} />
          <Route path="notes" element={<Notes />} />
          <Route path="me" element={<Me />} />
        </Routes>
      </main>

      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const tabs = [
    { to: '/cockpit', icon: LayoutGrid, label: 'Queue', end: true },
    { to: '/cockpit/patients', icon: Users, label: 'Patients' },
    { to: '/cockpit/notes', icon: FileText, label: 'Notes' },
    { to: '/cockpit/me', icon: UserIcon, label: 'You' },
  ] as const;

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

function TriageQueue() {
  return (
    <div className="container max-w-screen-md p-4 space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Triage Queue</h2>
      <p className="text-muted-foreground">
        Swipe-style triage cards land here when Vaani screens a patient.
      </p>
      <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
        All clear. Chai break ☕
        <div className="mt-2 text-sm">
          (Connect VAPI + Sarvam in <code>.env.local</code> to see real triage.)
        </div>
      </div>
    </div>
  );
}

function Patients() {
  return (
    <div className="container max-w-screen-md p-4">
      <h2 className="text-2xl font-semibold tracking-tight mb-4">Patients</h2>
      <p className="text-muted-foreground">Patient timeline view — coming Day 5.</p>
    </div>
  );
}

function Notes() {
  return (
    <div className="container max-w-screen-md p-4">
      <h2 className="text-2xl font-semibold tracking-tight mb-4">SOAP Notes</h2>
      <p className="text-muted-foreground">
        eSanjeevani-format SOAP editor with inline edit — coming Day 4.
      </p>
    </div>
  );
}

function Me() {
  return (
    <div className="container max-w-screen-md p-4">
      <h2 className="text-2xl font-semibold tracking-tight mb-4">You</h2>
      <p className="text-muted-foreground">Profile + on-call toggle.</p>
    </div>
  );
}
