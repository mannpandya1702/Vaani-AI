# Vaani-AI — 5-minute submission video script
**India AI Hackathon (NBV + AIENgg) · Application deadline: 2026-06-28**

Mapped to the brief's four judging dimensions and four required video coverage points.
Numbers here are the REAL latest eval run (`eval/reports/2026-06-26.json`). See
`docs/hackathon-brief-alignment.md` for the full evidence matrix.

> Dimensions: (1) Problem Definition 20% · (2) Data Processing 25% · (3) System Design 25% · (4) Evals 30%
> Coverage: clinical stage + depth · vernacular voice data · data-processing + system-design · evals

Runtime target: **4:50** (10s safety margin).

---

## 0:00 – 0:30 · Cold open (visual: live call on vaani-ai-azure.vercel.app)

**VO (founder, calm, ~75 words):**
> India has one doctor for every eleven thousand people in its villages. Most of a
> doctor's day isn't diagnosis — it's screening, triage, summarising, and follow-up.
> Vaani is the AI layer that gives those hours back. A voice agent that screens a
> patient in their own language **before** the doctor, hands the doctor a ready-to-sign
> SOAP note, and then **calls the patient back** to say the doctor has seen them. This
> is a real call.

(8s of the live Hindi screening, including Vaani's gender-neutral disclosure.)

---

## 0:30 – 1:15 · Problem Definition (dim 1, 20%)

**VO (~60 words):**
> The brief lists five clinical stages that waste doctor hours and rewards threading
> several into one agent. Vaani threads **three into a working loop** — pre-visit
> voice capture, low-cost vernacular STT, and a post-visit voice callback — and touches
> two more, in-visit transcription and a shadow differential, under one architecture.
> Our scope is deliberate: **Vaani screens and listens; a certified doctor decides and signs.**

**On-screen (honest status):**
- Stage 1 · Pre-Visit Capture — ✅ live
- Stage 4 · Low-Cost Vernacular STT (₹0.36–0.83/min) — ✅ live
- Stage 5 · Post-Visit Voice Callback — ✅ live (the "doctor has seen you" loop)
- Stage 2 · In-Visit Transcription + ICD-10 — ◑ partial
- Stage 3 · AI Shadow Differential + Benchmark — ◑ framework

---

## 1:15 – 2:15 · Vernacular voice data (coverage point 2)

**Visual:** pipeline diagram, ap-south-1 highlighted.

**VO (~85 words):**
> Vernacular speech-to-text uses Sarvam Saarika and Deepgram nova for code-switched
> Hindi-English — both under the one-rupee-per-minute cap, at ₹0.36 to ₹0.83 a minute.
> Vaani speaks back through a gender-neutral prompt: we found prompt version one leaked
> the speaker's gender within four seconds and broke trust with women patients, so the
> model now uses object-agreeing infinitives, plural-formal हम, and impersonal voice to
> emit **zero gendered verb forms**. That is a vernacular-data lesson you only learn by
> running real calls.

**On-screen:**
```
A. "बात करनी है"      (object-agreeing infinitive)
B. "हम सुन रहे हैं"     (plural-formal हम)
C. "समझ आ गया"        (impersonal)
```

---

## 2:15 – 3:30 · Data Processing + System Design (dims 2+3, 25%+25%)

**Visual:** call-lifecycle sequence diagram.

**VO (~95 words):**
> Every payload to Claude is **PII-redacted first** — name, phone, ABHA, Aadhaar — and a
> cross-border-transfer audit row is written before the request fires. DPDP-compliant by
> construction. The key design choice: a **deterministic red-flag layer sits ABOVE the
> LLM**. A missed emergency is catastrophic, so red-flags are auditable code with provable
> recall — not retrieval, not LLM guesswork. That's why we chose an agent with a rules
> floor over RAG; RAG is staged for when our pathways catalogue is large enough to add
> recall instead of variance. Claude drafts the SOAP; a real RMP signs it; then Vaani
> calls back: *"डॉक्टर साहब ने देख लिया है."*

**On-screen:** the agent-vs-RAG tradeoff table (from `docs/system-design-rationale.md`).

---

## 3:30 – 4:30 · Evals (dim 4, 30% — "no evals = no score")

**Visual:** terminal of `deno run eval/run.ts`, then the metrics table.

**VO (~80 words):**
> Evals run on twelve cases across sixteen red-flag categories against the live edge
> function. Latest numbers: **red-flag recall one hundred percent** — we miss zero
> emergencies — band exact-match one hundred percent, precision ninety percent, presumptive
> label match eighty-three percent. Post-call triage scores in three and a half seconds at
> the median; the live voice turn is sub-two-second on its own path. Cost per three-minute
> consult: four to eight rupees. We disclose honestly: the label-match gap and a latency
> outlier on cold start are open, and the eval is what surfaced them.

**On-screen metrics:**
| Metric (brief's name) | Result | Target |
|---|---|---|
| Error rate (band exact-match) | 100% | ≥92% |
| Red-flag recall (safety) | 100% | ≥98% |
| Red-flag precision | 90% | ≥75% |
| Top-k (presumptive label) | 83% | — |
| Cost / consult | ₹4.30–8.16 | <₹10 |
| Triage latency (p50, async) | 3.5s | post-call |

> **Stage 3 / "Shadow Diagnosis":** we run a shadow differential for benchmarking but
> **never let the AI deliver a diagnosis** — a certified RMP signs every note. The
> benchmark methodology is shipped (`eval/gp-benchmark/`); scaling to thousands of cases
> needs real GPs we recruit post-pilot.

---

## 4:30 – 4:50 · Close

**VO (~35 words):**
> Vaani is live today at vaani-ai-azure.vercel.app — real voice, real triage, real
> doctor sign-off. Built by a small team with a clinical, legal, and AI-engineering
> advisor board. The doctor is the decider; the AI is the listener. Thank you.

(Wordmark + URL hold.)

---

## Recording checklist
- [ ] 1080p / 30fps; ambient mic, no music under clinical claims
- [ ] English subtitles over all Hindi audio
- [ ] "AI-assisted screening · RMP-signed" label visible on every cockpit screen-cap
- [ ] Stage-1 disclosure on screen ≥3s within first 30s
- [ ] Use the REAL latest numbers above — never the old 93.8%/75% figures
- [ ] Submit via the brief's Google Form by **27 Jun EOD IST** (T-1 buffer before the 28 Jun deadline)

## Attach with submission
- `docs/hackathon-brief-alignment.md` (the evidence matrix)
- `docs/system-design-rationale.md` (RAG-vs-agent — dim 3)
- `docs/cost-analysis.md` (Stage 4 cost evidence)
- `eval/reports/2026-06-26.json` (latest eval)
- `eval/gp-benchmark/methodology.md` (Stage 3 methodology)
