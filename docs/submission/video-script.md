# वाणी Vaani-AI — 5-Minute Submission Video Script

**Total: 5:00. Record the live demo (0:35–1:50) FIRST and clean — everything else is voice-over you can re-take.**
Format cue: `[SHOW]` = what's on screen · `[SAY]` = what you say (calm, confident, ~150 wpm).

---

### 0:00 – 0:35 · HOOK + PROBLEM  *(the four required points start here)*
[SHOW] Title card: **वाणी · Vaani-AI** — "The doctor will see you now — in your language." Then the stat **1 : 11,000**.
[SAY] "Rural India has one doctor for every eleven thousand patients — eleven times worse than the WHO standard. But the bottleneck isn't the number of doctors. It's the hours a doctor loses to screening, history-taking, and follow-up. Vaani is an AI voice front-door that does exactly that work — in the patient's own language — and hands a doctor-ready history to a real physician. Let me show you a real call."

### 0:35 – 1:50 · THE LIVE DEMO  *(the heart — let it breathe)*
[SHOW] Screen-record `vaani-ai-azure.vercel.app/asha`. Start the call. Speak Hindi: *"नमस्ते… दो दिन से तेज़ बुख़ार है और कँपकँपी हो रही है।"* Let Vaani greet, take consent, ask your name, walk the danger-sign questions, give age. Hang up.
[SAY] (over the call) "She greets, captures consent under the DPDP Act, asks who's calling, then walks a clinician's history chain — complaint, onset, severity, the complaint-specific danger signs, age and sex — all in natural Hindi, with English and Tamil code-switching handled."
[SHOW] Switch to the cockpit (`/rmp`). Within ~10 seconds the **card appears** — patient name, the triage band, the SOAP note, and the **AI Clinical Opinion** (shadow differential). Click it. Click **Approve & Sign.**
[SAY] "Seconds after she hangs up, a card lands in front of a real Registered Medical Practitioner — SMC-verified, ABDM-linked. They see the structured history, an ICD-10 SOAP note, and a separate AI second-opinion. The doctor reviews, and signs."
[SHOW] The **Hindi callback audio plays**: *"नमस्ते। डॉक्टर साहब ने आपकी पूरी रिपोर्ट देख ली है…"*
[SAY] "And here's the moment we built everything for — Vaani calls the patient back, in their language: *the doctor has seen you.* That's the failure of every telehealth product: the patient never knows if a doctor actually looked. We close that loop. **No AI signs a note. No AI dispenses care.** The AI is the listener; the doctor is the decider."

### 1:50 – 2:25 · CLINICAL STAGE + DEPTH  *(point 1)*
[SHOW] One clean slide: "Stage 1 — Pre-Visit Capture" highlighted, the other four stages dimmed beneath it.
[SAY] "We scope tightly to one named stage — Stage one, pre-visit capture: vernacular history into a structured SOAP summary, before the consult. We never diagnose or prescribe to the patient. And because the doctor's time is the scarce resource, we integrate the stages that protect it — an independent shadow diagnosis for benchmarking, low-cost vernacular STT, and the closed-loop callback."

### 2:25 – 3:00 · VERNACULAR VOICE-DATA COLLECTION  *(point 2)*
[SHOW] Slide: a Devanagari transcript turn → two labels ("triage band" + "doctor-signed SOAP").
[SAY] "Our approach to data: the conversation *is* the dataset. Every call is captured turn-by-turn, natively in Devanagari and Tamil script, code-switching preserved, PII-redacted. And every call is labeled twice — by our deterministic triage, and, as the gold label, by the real doctor's signed note. So we build a doctor-adjudicated, consented, India-hosted vernacular clinical-speech corpus — collected through ASHA workers at Primary Health Centres, stratified to over-sample the rare emergencies that matter most."

### 3:00 – 3:55 · DATA PROCESSING + SYSTEM DESIGN  *(point 3 — the 25%+25% slide)*
[SHOW] The architecture flow: Patient → VAPI → Indic STT → **Safety proxy** → Claude → triage → SOAP → shadow → RMP → callback.
[SAY] "System design. We're agent-first, prompt-engineered — and we made the RAG-versus-agent call deliberately: the safety-critical work is deterministic red-flag rules and hard statutory refusals that must never be left to a model, so it's an agent loop with rails, not retrieval. RAG comes later, to ground clinical pathways as the catalogue grows.
Three guardrails do the heavy lifting: a **three-tier triage** where deterministic rules — BE-FAST, IMCI, silent-MI, sepsis — can only *raise* urgency, never lower it; **hardcoded statutory refusals** for sex-determination, suicide, and prescription requests that the model can't improvise around; and **ICD-10 grounding** that drops any hallucinated code. Every payload is PII-redacted before it leaves India, audited, and prompt-cached — which cuts our LLM cost by about half."

### 3:55 – 4:40 · EVALS  *(point 4 — the 30% slide; this is where you win)*
[SHOW] The metrics table + the junior-GP comparison + the cost bar.
[SAY] "Evals — run live against our deployed triage on twenty-four senior-doctor-adjudicated cases, eighteen of them true emergencies. The metric that matters is emergency sensitivity, and we catch **one hundred percent — eighteen of eighteen.** Band accuracy: one hundred percent. A synthetic junior GP, on the same cases, catches eighty-three percent — and the ones it misses are exactly the atypical presentations that lack a textbook trigger. Our shadow layer gives a ranked top-three differential we score against the signing doctor.
On unit economics: a full three-minute consult costs **eight rupees seventy-seven** — versus four hundred to fifteen hundred for a video consult — with vernacular speech-to-text under one rupee a minute, and live-voice latency tuned under one-point-four seconds."

### 4:40 – 5:00 · CLOSE
[SHOW] Back to the title + the callback line *"डॉक्टर साहब ने देख लिया है"*.
[SAY] "One doctor can now screen far more patients — without a single new medical college. The AI listens, the doctor decides, and the patient finally hears the four words that change everything: *the doctor has seen you.* That's Vaani."

---

## Filming checklist
- [ ] Do the **live call FIRST**; if a take is messy, the 2 demo cards already in the cockpit are a safe fallback to film the review→sign→callback flow.
- [ ] Cockpit shows a **named doctor** (not "डॉक्टर साहब") — confirm the RMP is seeded before filming.
- [ ] Have the metrics slide / `docs/submission/vaani-submission.html` open (print-to-PDF) as B-roll for sections 3–4.
- [ ] Keep total ≤ 5:00. If tight, trim section 2:25–3:00 first.
- [ ] Upload the PDF doc alongside the video.
