import { Link } from 'react-router-dom';
import {
  ArrowRight, Mic, ShieldCheck, Stethoscope, Languages,
  PhoneCall, Activity, FileCheck2, CheckCircle2, Lock,
} from 'lucide-react';

export default function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <Stats />
      <Closing />
      <Footer />
    </main>
  );
}

/* ───────────────────────── Nav ───────────────────────── */
function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="container max-w-6xl flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="vaani-bindi-pulse" aria-hidden />
          <span className="text-lg font-bold tracking-tight">vaani</span>
          <span className="text-lg font-medium text-muted-foreground font-hind" lang="hi" aria-hidden>· वाणी</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#trust" className="hover:text-foreground transition-colors">Compliance</a>
          <Link to="/cockpit" className="hover:text-foreground transition-colors">For doctors</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth" className="hidden sm:inline-flex text-sm font-medium px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition">
            Sign in
          </Link>
          <Link to="/asha" className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground shadow-sm hover:brightness-105 transition">
            Start screening <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function Hero() {
  return (
    <section className="vaani-mesh text-vaani-paper relative overflow-hidden">
      <div className="container max-w-6xl py-20 md:py-28 grid lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
        {/* Left: copy */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-vaani-paper/20 bg-vaani-paper/5 px-3 py-1 text-xs font-medium text-vaani-paper/80 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-vaani-green" /> Live · AI-assisted health screening
          </span>
          <h1 className="text-[2.7rem] leading-[1.05] md:text-6xl font-bold tracking-tight">
            The voice of health
            <br />
            <span className="vaani-gradient-text">for Bharat.</span>
          </h1>
          <p className="mt-5 text-lg md:text-xl text-vaani-paper/85 font-hind leading-relaxed max-w-xl" lang="hi">
            एक AI सहायक, हर ASHA के लिए — हर मरीज़ की भाषा में।
          </p>
          <p className="mt-4 text-[15px] md:text-base text-vaani-paper/70 leading-relaxed max-w-xl">
            Voice screening in the patient's own language, deterministic red-flag
            triage, and a real doctor who reviews, signs, and calls back —
            private, DPDP-compliant, and ABDM-ready.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link to="/asha" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:brightness-105 transition">
              <Mic className="w-5 h-5" /> Start a screening
            </Link>
            <Link to="/cockpit" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-vaani-paper/25 text-vaani-paper hover:bg-vaani-paper/10 transition font-medium">
              <Stethoscope className="w-5 h-5" /> Open RMP cockpit
            </Link>
          </div>

          <div className="mt-7 flex items-center gap-2 text-xs text-vaani-paper/55">
            <Lock className="w-3.5 h-3.5" />
            No AI signs a note. A registered doctor reviews and signs every case.
          </div>
        </div>

        {/* Right: live-call product visual */}
        <HeroCallCard />
      </div>
    </section>
  );
}

/* A stylised "live call → triage → doctor signed" card — the product in one glance. */
function HeroCallCard() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-2xl" aria-hidden />
      <div className="relative vaani-elevated p-5 text-foreground">
        {/* call header */}
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Mic className="w-5 h-5 text-warning" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-vaani-green ring-2 ring-card" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">वाणी Didi</div>
            <div className="text-xs text-muted-foreground">Screening · हिंदी · 00:48</div>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-vaani-green">
            <span className="triage-dot-green" /> connected
          </span>
        </div>

        {/* transcript bubbles */}
        <div className="py-4 space-y-2.5">
          <Bubble who="vaani" text="क्या तकलीफ़ है आपको?" />
          <Bubble who="patient" text="तीन दिन से बुखार और खाँसी है।" />
          <Bubble who="vaani" text="साँस लेने में दिक्कत तो नहीं?" />
        </div>

        {/* triage result */}
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3 flex items-center gap-3">
          <Activity className="w-5 h-5 text-warning shrink-0" />
          <div className="text-sm leading-tight">
            <span className="font-semibold">AMBER</span> · suspected LRTI
            <div className="text-xs text-muted-foreground">routed to on-call RMP</div>
          </div>
          <span className="ml-auto text-[11px] font-semibold text-warning">98% recall</span>
        </div>

        {/* doctor signed callback — the soul */}
        <div className="mt-3 rounded-xl bg-secondary text-secondary-foreground px-3.5 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-vaani-green/20 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5 text-vaani-green" />
          </div>
          <div className="text-sm leading-tight font-hind" lang="hi">
            डॉक्टर साहब ने देख लिया है
            <div className="text-xs text-secondary-foreground/65 font-sans">Dr. signed · patient called back</div>
          </div>
          <CheckCircle2 className="ml-auto w-5 h-5 text-vaani-green" />
        </div>
      </div>
    </div>
  );
}

function Bubble({ who, text }: { who: 'vaani' | 'patient'; text: string }) {
  const isVaani = who === 'vaani';
  return (
    <div className={`flex ${isVaani ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-sm font-hind ${
          isVaani ? 'bg-primary/12 text-foreground rounded-tl-sm' : 'bg-muted text-foreground rounded-tr-sm'
        }`}
        lang="hi"
      >
        {text}
      </div>
    </div>
  );
}

/* ─────────────────────── Trust strip ─────────────────────── */
function TrustStrip() {
  const items = ['ABDM-ready', 'DPDP 2023', 'NMC Act 2019', '12 Indian languages', 'Doctor-signed notes', 'Tele-MANAS 14416'];
  return (
    <section id="trust" className="border-b border-border bg-muted/40">
      <div className="container max-w-6xl py-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        {items.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-accent" /> {t}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── How it works ─────────────────────── */
function HowItWorks() {
  const steps = [
    { icon: Languages, title: 'She speaks. Vaani listens.', body: 'The patient is screened by voice in their own language — Hindi, Tamil and more — capturing the full history. No app, no literacy needed.' },
    { icon: Activity, title: 'Deterministic red-flag triage.', body: 'A rules-first engine flags danger signs with ≥98% recall before any model reasons — then bands the case RED / AMBER / GREEN.' },
    { icon: Stethoscope, title: 'A real doctor signs — and calls back.', body: 'An SMC-verified RMP reviews the SOAP note, signs it, and Vaani calls the patient: “डॉक्टर साहब ने देख लिया है.”' },
  ];
  return (
    <section id="how" className="container max-w-6xl py-20 md:py-24">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="text-sm font-semibold uppercase tracking-wider text-accent mb-2">How it works</div>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">The listener is AI. The decider is a doctor.</h2>
        <p className="mt-3 text-muted-foreground">Three steps, under three minutes, ending in a signed note the patient actually hears about.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {steps.map((s, i) => (
          <div key={s.title} className="vaani-elevated p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-primary/12 flex items-center justify-center">
                <s.icon className="w-6 h-6 text-warning" />
              </div>
              <span className="text-xs font-bold text-muted-foreground">0{i + 1}</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── Stats ─────────────────────── */
function Stats() {
  const stats = [
    { number: '1 : 11,000', label: "India's doctor-to-patient ratio" },
    { number: '10.4 lakh', label: 'ASHA workers, already in every village' },
    { number: '79 cr+', label: 'ABHA IDs issued (and counting)' },
  ];
  return (
    <section className="vaani-dot-grid border-y border-border bg-muted/30">
      <div className="container max-w-6xl py-16 grid sm:grid-cols-3 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="vaani-elevated p-6 border-t-[3px] border-t-primary">
            <div className="text-3xl md:text-4xl font-bold text-foreground mb-1.5">{s.number}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── Closing CTA ─────────────────────── */
function Closing() {
  const phone = (import.meta as any).env?.VITE_AGENT_PHONE_DISPLAY as string | undefined;
  return (
    <section className="container max-w-6xl py-20 md:py-24">
      <div className="vaani-mesh text-vaani-paper rounded-3xl px-8 py-14 md:px-14 text-center relative overflow-hidden">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Bring a doctor to every village call.</h2>
        <p className="mt-3 text-vaani-paper/75 max-w-xl mx-auto">
          Try a live screening now, or open the doctor cockpit to see the signed-callback loop end to end.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/asha" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:brightness-105 transition">
            <Mic className="w-5 h-5" /> Start a screening
          </Link>
          {phone && (
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-vaani-paper/25 hover:bg-vaani-paper/10 transition font-medium">
              <PhoneCall className="w-5 h-5" /> {phone}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Footer ─────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container max-w-6xl py-10 text-sm text-muted-foreground space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="vaani-bindi" aria-hidden />
          <span className="font-bold text-foreground">vaani</span>
          <span className="font-hind" lang="hi" aria-hidden>· वाणी</span>
        </div>
        <p className="max-w-3xl leading-relaxed">
          Vaani is an AI screener — every clinical note is reviewed and signed by a Registered
          Medical Practitioner under the NMC Act 2019. Not a substitute for emergency care; dial
          <span className="font-semibold text-foreground"> 108</span> in an emergency, or Tele-MANAS
          <span className="font-semibold text-foreground"> 14416</span> for mental health.
        </p>
        <p className="text-xs">ABDM Sandbox integration in progress · DPDP 2023 compliant · Audit log retained per TPG 2020 ¶3.5.</p>
      </div>
    </footer>
  );
}
