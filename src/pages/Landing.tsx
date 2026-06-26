import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <main className="min-h-screen bg-vaani-navy text-vaani-paper">
      <div className="container max-w-5xl py-16 md:py-24">
        {/* Top brand — bilingual marker (audit §4 priya: brand mark was text-only "vaani") */}
        <div className="flex items-center gap-3 mb-16">
          <span className="vaani-bindi-pulse" aria-hidden />
          <span className="text-2xl font-semibold tracking-tight">vaani</span>
          <span className="text-2xl font-medium tracking-tight text-vaani-paper/60 font-hind" lang="hi" aria-hidden>
            · वाणी
          </span>
        </div>

        {/* Hero */}
        <h1 className="text-5xl md:text-7xl font-bold leading-tight tracking-tight mb-8">
          The voice of health
          <br />
          <span className="text-vaani-saffron">for Bharat</span>.
        </h1>

        <p className="text-xl md:text-2xl max-w-2xl text-vaani-paper/80 mb-12 font-hind leading-relaxed" lang="hi">
          एक AI सहायक, हर ASHA के लिए — हर मरीज़ की भाषा में।
        </p>
        <p className="text-lg max-w-2xl text-vaani-paper/70 mb-12 leading-relaxed">
          AI-assisted voice screening, deterministic red-flag triage, and a
          named-RMP signed callback loop. Built for ASHA workers and rural PHCs.
          Indic STT + TTS (Sarvam) · Claude Sonnet 4.6 · DPDP-compliant PII
          redaction · ABDM-ready.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <Stat number="1 : 11,000" label="India's doctor-patient ratio" />
          <Stat number="10.4 lakh" label="ASHA workers, already in every village" />
          <Stat number="79 cr+" label="ABHA IDs issued (and counting)" />
        </div>

        {/* CTAs — audit §4: clear primary + two secondaries instead of three coequal */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/asha"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-vaani-saffron text-vaani-navy font-semibold hover:opacity-90 transition shadow-lg shadow-vaani-saffron/20"
          >
            Start a screening →
          </Link>
          <Link
            to="/cockpit"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-vaani-paper/30 text-vaani-paper hover:bg-vaani-paper/10 transition"
          >
            RMP cockpit
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-vaani-paper/80 hover:text-vaani-paper hover:bg-vaani-paper/5 transition"
          >
            Sign in
          </Link>
        </div>

        {/* Footer disclaimer */}
        <div className="mt-24 pt-8 border-t border-vaani-paper/20 text-sm text-vaani-paper/60 space-y-2">
          <p>
            Vaani is an AI screener — every clinical note is reviewed and signed
            by a Registered Medical Practitioner under NMC Act 2019. Not a
            substitute for emergency care; dial 108 in an emergency.
          </p>
          <p>ABDM Sandbox integration in progress · DPDP 2023 compliant ·
            Audit log retained per TPG 2020 ¶3.5.</p>
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
