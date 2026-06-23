import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <main className="min-h-screen bg-vaani-navy text-vaani-paper">
      <div className="container max-w-5xl py-16 md:py-24">
        {/* Top brand */}
        <div className="flex items-center gap-3 mb-16">
          <span className="vaani-bindi-pulse" aria-hidden />
          <span className="text-2xl font-semibold tracking-tight">vaani</span>
        </div>

        {/* Hero */}
        <h1 className="text-5xl md:text-7xl font-bold leading-tight tracking-tight mb-8">
          The voice of health
          <br />
          <span className="text-vaani-saffron">for Bharat</span>.
        </h1>

        <p className="text-xl md:text-2xl max-w-2xl text-vaani-paper/80 mb-12 font-hind" lang="hi">
          एक AI सहायक, हर ASHA के लिए — हर मरीज़ की भाषा में।
        </p>
        <p className="text-lg max-w-2xl text-vaani-paper/70 mb-12 leading-relaxed">
          AI-assisted health screening, triage, and follow-up for India&apos;s
          primary care system. Built for ASHA workers and rural PHCs. Plugs into
          ABDM.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <Stat number="1 : 11,000" label="India's doctor-patient ratio" />
          <Stat number="10.4 lakh" label="ASHA workers, already in every village" />
          <Stat number="79 cr+" label="ABHA IDs issued (and counting)" />
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap gap-4">
          <Link
            to="/auth"
            className="inline-flex items-center px-6 py-3 rounded-lg bg-vaani-saffron text-vaani-navy font-semibold hover:opacity-90 transition"
          >
            Sign in
          </Link>
          <Link
            to="/cockpit"
            className="inline-flex items-center px-6 py-3 rounded-lg border border-vaani-paper/30 text-vaani-paper hover:bg-vaani-paper/10 transition"
          >
            Doctor cockpit →
          </Link>
          <Link
            to="/asha"
            className="inline-flex items-center px-6 py-3 rounded-lg border border-vaani-paper/30 text-vaani-paper hover:bg-vaani-paper/10 transition"
          >
            ASHA app →
          </Link>
        </div>

        {/* Footer disclaimer per Anand */}
        <div className="mt-24 pt-8 border-t border-vaani-paper/20 text-sm text-vaani-paper/60 space-y-2">
          <p>
            Vaani-AI provides AI-assisted clinical decision support. Not a
            substitute for professional medical advice.
          </p>
          <p>ABDM Sandbox certified; production rollout post-pilot.</p>
        </div>
      </div>
    </main>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-xl border border-vaani-paper/15 bg-vaani-paper/5 p-5">
      <div className="text-3xl font-bold text-vaani-saffron mb-1">{number}</div>
      <div className="text-sm text-vaani-paper/70">{label}</div>
    </div>
  );
}
