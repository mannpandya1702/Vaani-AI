# Best-practice guide: writing VAPI voice agents that sound human

Compiled 2026-06-26 from VAPI's official docs, ElevenLabs Turbo v2.5 guidance, and AssemblyAI / VoiceInfra writeups. Mapped against Vaani's current setup so the gaps are explicit.

## Why text-style prompts fail in voice

Voice changes the rules. The same prompt that works in chat produces:
- Long, monologue-y answers (chat reads in chunks; voice listens linearly).
- Robotic delivery (no fillers, no rhythm, perfect grammar).
- Multiple questions per turn (chat handles, voice loses the listener).
- Visual artifacts spoken aloud ("dollar sign forty two point five zero", bullet markers).

A voice-optimized prompt is 60-70% shorter than a text-mode equivalent and is structured for the speaker, not the reader.

## VAPI's 6-section prompt structure

VAPI's official prompting guide recommends every production prompt have these sections, in this order. The prompt is re-executed on every turn — order matters.

1. **Identity & Personality** — name, role, tone, communication style. *"You are X, a calm Y for Z. Your tone is W."*
2. **Response Guidelines** — how to speak: brevity, formatting, pacing.
3. **Guardrails** — hard constraints that override everything else. Compliance, refusals, forbidden words. Place prominently.
4. **Context** — runtime data (date/time, caller info, clinic name).
5. **Workflow / Use Cases** — step-by-step playbooks: consent → screening → escalation.
6. **Examples** — few-shot transcripts of ideal behavior. The LLM copies what it sees.

## What makes voice agents sound HUMAN (not AI)

Six techniques from the official guide:

| Technique | What it looks like |
|---|---|
| **Disfluency as design** | 2-4 light disfluencies per turn. Healthcare uses "let me see…", "एक मिनट…" — not "uh", "like". *"If a turn comes out perfectly polished, add a filler and try again."* |
| **Rapport** | React to personal mentions before asking the next question. ("अरे, बच्चा कितने साल का है? — अच्छा, छोटा है।") |
| **Energy matching** | Crisp caller → faster + fewer fillers. Chatty caller → longer responses, more engagement. |
| **Brevity** | Spoken attention span = 8-10 sec before comprehension drops. Voice turns ≤ 14 words for normal, ≤ 10 for emergency. |
| **One question per turn** | Sequence, don't batch. *"What's your name, DOB, and reason?"* is a chat pattern; in voice it loses the listener. Reduces call duration by 28% in studies. |
| **Emotional expression control** | Limit laughter / emphatic reactions to ≤1 turn in 4. Over-reaction reads as artificial. |

## Formatting & prosody rules that translate to natural TTS

- **Punctuation for prosody**: commas + semicolons + periods → reliable natural rhythm. Em-dashes behave inconsistently across TTS providers (ElevenLabs handles them but Sarvam doesn't always).
- **No visual-only formatting**: no bold, italics, headers, numbered lists. They leak as "asterisk" or weird pauses. Use natural connectors: "पहले… फिर… आख़िर में…"
- **Spoken-form conversions** (LLM should output these, not raw):
  - `14416` → "चौदह चार सौ सोलह" (we have this for Tele-MANAS)
  - `+919999999999` → "नौ नौ नौ नौ…" or "ये नंबर"
  - `$42.50` → "forty-two dollars and fifty cents"
  - `03/04/2025` → "March fourth, twenty twenty-five"
  - `108` → "एक सौ आठ" (we have this)
- **Don't put tool/resource IDs in prompt prose** — they can leak into spoken output. Describe the capability instead ("escalate to the doctor's queue", not "call the `escalate_to_doctor` tool with `category='cardiac'`" — though tool-trigger language is OK in workflow sections).

## What to AVOID

VAPI's anti-pattern list:

| Anti-pattern | Why it fails |
|---|---|
| Porting chat prompts unchanged | Long monologues, asterisks spoken, robotic |
| Long negative banlists ("never say X, Y, Z…") | Recently-listed banned phrases become *more* probable in the next response. Counterintuitive but documented. |
| Skipping guardrails | Will eventually give unauthorized advice / fabricate values / reveal internals |
| Two questions per turn | Loses listener immediately |
| Verbose monologues listing 5 things | Chat pattern; voice attention drops after 2 items. Offer 2, ask if they want more. |
| Treating prompt as security boundary | Prompt is probabilistic; can be jailbroken. Real guardrails live in tools + post-processing. |

## Voice pipeline config — VAPI's healthcare tuning

VAPI's voice-pipeline doc maps tuning parameters to use cases. Healthcare/formal use case:

| Field | Default | Healthcare recommended | What it controls |
|---|---|---|---|
| `startSpeakingPlan.waitSeconds` | 0.4 | **0.6 – 0.8** | Final audio delay before assistant speaks — gives patients (esp. elderly) room to finish a thought |
| `startSpeakingPlan.smartEndpointingEnabled` | false | **true** (for non-English: use Krisp or transcriber-level) | Smarter end-of-turn detection vs. flat silence timer |
| `stopSpeakingPlan.voiceSeconds` | 0.2 | **0.3** | How long user must speak to count as interruption; 0.3 = balanced for non-English |
| `stopSpeakingPlan.backoffSeconds` | 1.0 | **2.0** | Pause before assistant resumes after being interrupted — deliberate, not eager |
| `stopSpeakingPlan.numWords` | 0 | **0 (VAD) for snappy, ≥1 for accurate** | 0 = fast (50-100ms), 1+ = transcript-based, ~200-500ms but accurate |
| `silenceTimeoutSeconds` | 30 | **45** | How long to wait before ending the call on silence; 45 gives rural callers room |
| `responseDelaySeconds` | 0 | 0.1 | Tiny breath before the assistant starts — sounds less twitchy |
| `numWordsToInterruptAssistant` | 1 | **2 – 3** | How many words before user audio counts as an interruption (avoids treating "हाँ" backchannels as interrupts) |
| Transcriber `endpointing` (Deepgram) | 350 | 300-400ms English; **higher for Hindi** | Lower = faster, but Hindi long vowels need ≥ 350ms |
| Transcriber language | `hi` / `ta` | **`multi` (nova-3)** | Catches Hinglish code-switching — single-language drops mixed speech |

### ElevenLabs Turbo v2.5 voice tuning

| Field | Default | Natural-sounding recommended | What it controls |
|---|---|---|---|
| `stability` | 0.5 | **0.50 – 0.55** | Lower = more expressive variation, higher = more consistent but monotone. 0.55 is the sweet spot per ElevenLabs |
| `similarity` | 0.75 | 0.75 – 0.85 | How close to the base voice timbre |
| `speed` | 1.0 | **0.85 – 0.95** for elderly / rural listeners | Slower for comprehension — Aanya §13 calls for 0.85 on "urgent" path |
| `use_speaker_boost` | true | true | Helps English numbers / units |

Total end-to-end response time targets (per VAPI's published benchmarks):
- Aggressive (sales, gaming): **1.9 s**
- Balanced (general support): **2.3 s**
- Conservative (healthcare): **4.7 s** — but each second past 3 starts to feel slow

Our target: **< 1.4 s p95** per CLAUDE.md — aggressive end of the healthcare range. We can hit it because we're cache-friendly + close-region (Bedrock ap-south-1).

## Latency components (where time actually goes)

```
User stops speaking
  → Endpointing evaluation (300-500ms typical, ~150ms with Deepgram Flux)
    → LLM processing (~800ms cold, ~300ms with prompt cache hit)
      → TTS generation (~300-500ms ElevenLabs Turbo v2.5 first chunk)
        → waitSeconds (audio playback delay)
          → Assistant speaks
```

The wins for our pipeline:
1. **Prompt cache** — our 7588-char Hindi prompt is well above the 1024-token cache threshold. Subsequent turns pay delta-only.
2. **Streaming TTS** — ElevenLabs Turbo starts emitting chunks at ~300ms.
3. **Lower endpointing** — we're at 350ms for nova-2; nova-3 multi may be different. Worth testing both.

## Vaani's current state vs. recommendations

| Area | Current | Recommended | Gap |
|---|---|---|---|
| Prompt structure | Largely VAPI's 6-section already (just split across more headings) | 6-section | None substantive |
| Disfluency guidance | Now present in v2 ("skip backchannel ~1 in 4") | 2-4 light disfluencies per turn | Could add: "occasional 'एक मिनट…' / 'सोचने दीजिए…' while thinking" |
| Reflective listening | Present (v2 examples) | Present | Done |
| Energy matching | Not present | Match caller pace | Could add: short rule |
| Few-shot examples | A few sprinkled | One full ideal-turn transcript | Could add 1 |
| `waitSeconds` | 0.4 | 0.6 – 0.8 healthcare | **Bump → 0.6** |
| `backoffSeconds` | 1.0 | 2.0 healthcare | **Bump → 1.5** (split the diff — rural calls aren't always slow) |
| `voiceSeconds` | 0.3 | 0.3 non-English | OK |
| `numWordsToInterruptAssistant` | 2 | 2-3 | OK |
| `silenceTimeoutSeconds` | 45 | 45+ | OK |
| TTS `stability` | 0.6 | 0.50 – 0.55 | **Drop → 0.55** for more natural variation |
| TTS `speed` | 0.9 | 0.85 – 0.95 | OK (CLAUDE.md says 0.85 for urgent path; 0.9 for normal is fine) |
| Transcriber | nova-3 multi | nova-3 multi | Done |
| Spoken-form numbers | Have for 108, 14416 | Have | Done |

## Sources

- [VAPI · Voice AI Prompting Guide](https://docs.vapi.ai/prompting-guide) — 6-section structure, disfluency, anti-patterns
- [VAPI · Voice Pipeline Configuration](https://docs.vapi.ai/customization/voice-pipeline-configuration) — endpointing, startSpeakingPlan, stopSpeakingPlan deep dive
- [VAPI · Speech Latency Solutions](https://vapi.ai/blog/speech-latency) — sub-500ms latency techniques
- [AssemblyAI · How to build the lowest-latency Vapi voice agent](https://www.assemblyai.com/blog/how-to-build-lowest-latency-voice-agent-vapi) — 465ms end-to-end
- [VoiceInfra · Voice AI Prompt Engineering — Complete Guide](https://voiceinfra.ai/blog/voice-ai-prompt-engineering-complete-guide) — disfluency budget, brevity, monitoring metrics
- [ElevenLabs · Turbo v2.5 launch](https://elevenlabs.io/blog/introducing-turbo-v25) — 300ms generation, 32-language including Hindi
- [Best Settings for ElevenLabs AI Voice Quality 2026 (NeuraPlusAI)](https://neuraplus-ai.github.io/blog/best-settings-for-elevenlabs-ai-voice-quality-improvement-2026.html) — stability 0.50-0.55 for natural variation
- [Voice AI Wrapper · Vapi Performance Tips 2026](https://voiceaiwrapper.com/insights/vapi-voice-ai-optimization-performance-guide-voiceaiwrapper) — turn-detection costs +1.5s if defaults left in place
