import { Mic } from 'lucide-react';

export default function AshaApp() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-2">
        <span className="vaani-bindi" />
        <span className="font-semibold">vaani · ASHA</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <button
          type="button"
          className="w-44 h-44 rounded-full bg-vaani-saffron text-vaani-navy shadow-lg flex items-center justify-center hover:scale-105 transition-transform active:scale-95"
          aria-label="Start a new call"
        >
          <Mic className="w-16 h-16" />
        </button>
        <p className="mt-8 text-lg font-medium font-hind" lang="hi">
          नई कॉल शुरू करें
        </p>
        <p className="text-sm text-muted-foreground">Tap to start a new patient call</p>
      </main>

      <footer className="text-xs text-muted-foreground p-4 text-center">
        Vaani-AI · AI-assisted health screening · Final medical decisions by the
        named RMP.
      </footer>
    </div>
  );
}
