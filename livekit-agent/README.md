# Vaani-AI — LiveKit Agents voice worker

A drop-in **replacement for the VAPI voice orchestration**, built on
[LiveKit Agents](https://docs.livekit.io/agents/) (Python, 1.x). It reproduces
Vaani Didi's live screening pipeline — Indic STT, the same safety-gated LLM,
Indic TTS, VAD, and turn detection — and exposes the same three function tools
(`capture_consent`, `escalate_to_doctor`, `end_call`).

This worker is the **VAPI-replacement path**. It does not touch the existing
VAPI pipeline, the Supabase Edge Functions, or the cockpit. It is an alternate
front-end that joins a LiveKit room, talks to the caller, and calls back into
the *same* Supabase functions VAPI already uses.

---

## The one design decision that matters: LLM via the Vaani safety proxy

The agent's LLM is **not** a direct Anthropic client. It is
`livekit.plugins.openai.LLM` pointed at Vaani's existing OpenAI-compatible
safety proxy:

```
base_url = ${SUPABASE_URL}/functions/v1/vapi-custom-llm
api_key  = ${WEBHOOK_MASTER_KEY}     # sent as the Bearer token
model    = "claude"
```

That proxy (`supabase/functions/vapi-custom-llm/index.ts`) is the same one the
VAPI custom-LLM path uses. On **every turn** it:

1. **Hardcoded statutory refusals** — checks the latest user message for
   PCPNDT (sex determination), MHCA (active suicide intent), POCSO (under-18
   abuse), and drug-Rx attempts. On a match it returns the *verbatim*,
   language-appropriate refusal script and **bypasses Claude entirely**. The
   model can never improvise around a legally-mandated script.
2. **PII redaction** — name / phone / ABHA / Aadhaar / address are tokenised
   before anything leaves India-domiciled infra, and a `cross_border_transfers`
   audit row is written per turn (DPDP §16, ABDM HDM ¶7.6).
3. **Claude** — calls Anthropic `/v1/messages` with `cache_control: ephemeral`
   on the system block (~75% input-cost reduction in steady state).
4. **OpenAI SSE** — streams Claude's tokens back in OpenAI
   `chat.completion.chunk` format, which the LiveKit OpenAI plugin consumes
   natively.

**Because the proxy is OpenAI-compatible, LiveKit needs zero special
handling** — it just speaks Chat-Completions to it. The entire compliance layer
is preserved, byte-for-byte identical to the VAPI path.

> ⚠️ Do **not** "simplify" this into `anthropic.LLM(...)`. That would send raw
> caller PII to the US with no redaction and let the model improvise around
> hardcoded refusal scripts — the exact DPDP/PCPNDT/MHCA violations the proxy
> exists to close.

---

## Pipeline

```
Caller (web SDK or, in prod, SIP/PSTN)
        │  WebRTC audio
        ▼
   LiveKit room ──────────────► this worker (agent.py) auto-joins
        │
        ├─ STT   Sarvam Saarika v2.5    (livekit-plugins-sarvam) ── Indic, HI/TA/EN code-switch
        ├─ LLM   Vaani safety proxy → Claude   (livekit-plugins-openai, base_url override)
        ├─ TTS   Sarvam Bulbul v3       (livekit-plugins-sarvam)
        ├─ VAD   Silero                 (livekit-plugins-silero)
        └─ Turn  Multilingual detector  (livekit-plugins-turn-detector; VAD fallback)

   Function tools (silent; bearer = WEBHOOK_MASTER_KEY where they hit Supabase):
     • capture_consent      → POST /functions/v1/consent-capture
     • escalate_to_doctor   → POST /functions/v1/vapi-webhook   (see TODO below)
     • end_call             → drains speech, then deletes the LiveKit room
```

The **system prompt** is read at runtime from
`../docs/prompts/vaani-hi-v3.md` (or `vaani-ta-v3.md` when `LANG_CODE=ta`).
The **Stage-0 greeting** (`firstMessage`) is spoken verbatim on join via
`session.say(...)` so it is never an LLM paraphrase.

### Sarvam plugin status

A **real, maintained** LiveKit Sarvam plugin exists —
[`livekit-plugins-sarvam`](https://pypi.org/project/livekit-plugins-sarvam/)
(v1.6.x, in lock-step with `livekit-agents`). It provides both
`sarvam.STT` (Saarika) and `sarvam.TTS` (Bulbul v2/v3) and reads
`SARVAM_API_KEY` from the environment. **We use it for both STT and TTS** — no
custom adapter was needed.

- **STT fallback:** if (and only if) the Sarvam plugin is not installed,
  `agent.py` falls back to **Deepgram** (`nova-3`, `language="multi"`) using
  `DEEPGRAM_API_KEY`, with a logged `TODO` to swap back to Saarika. This is a
  break-glass path so the worker can still boot without the Sarvam plugin.
- **TTS fallback:** there is **no** acceptable English-TTS fallback for an
  Indic patient-facing voice, so TTS hard-requires Sarvam. If you ever need a
  zero-plugin path, implement a small custom `tts.TTS` adapter calling
  `https://api.sarvam.ai/text-to-speech` directly — the hook point is
  `_build_tts()` in `agent.py`.

---

## Local run

```bash
cd livekit-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# one-time: download Silero VAD + turn-detector weights
python agent.py download-files

# fill secrets
cp .env.example .env        # then edit; or `export $(grep -v '^#' ../.env.local | xargs)`

# run with hot-reload
python agent.py dev
```

`python agent.py dev` registers the worker with `LIVEKIT_URL` and waits for a
job. To actually hear it, open the LiveKit
[Agents Playground](https://agents-playground.livekit.io/) (or your own
frontend, below), connect to the same project, and join a room — the worker is
dispatched automatically and greets you in Hindi.

Other CLI modes (LiveKit standard):
- `python agent.py start` — production (no reload). This is the container `CMD`.
- `python agent.py download-files` — bake model weights (used in the Dockerfile).
- `python agent.py console` — terminal-only voice loop for quick local checks.

---

## Deploy

### A) LiveKit Cloud Agents (recommended)

LiveKit Cloud runs the worker for you; no servers to manage.

```bash
# install the LiveKit CLI and authenticate to your project
lk cloud auth

# from this directory (contains agent.py + Dockerfile + requirements.txt)
lk agent create        # first time — registers the agent, uploads, builds
lk agent deploy        # subsequent deploys
lk agent logs          # tail logs
```

Set the secrets from `.env.example` in the LiveKit Cloud dashboard (Agents →
your agent → Secrets), or pass `--secrets-file .env`. `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are injected by the platform.

### B) Generic container (Render / Fly / Railway / Cloud Run)

The provided `Dockerfile` is platform-agnostic. The worker only makes
**outbound** connections (to `LIVEKIT_URL`), so **no inbound port / health
port is required** — deploy it as a *background worker*, not a web service.

```bash
docker build -t vaani-livekit-agent .
docker run --env-file .env vaani-livekit-agent
```

- **Render:** New → *Background Worker* → Docker → set env vars from
  `.env.example`. (Not a Web Service — there's no HTTP port.)
- **Fly.io:** `fly launch --no-deploy`, remove the `[http_service]`/`[[services]]`
  block from `fly.toml` (no inbound ports), `fly secrets set ...`, `fly deploy`.
- **Railway:** new service from this Dockerfile, add variables, deploy.

Scale by running more replicas — LiveKit load-balances job dispatch across all
registered workers automatically.

---

## How the frontend connects

LiveKit is a rooms model: the **frontend** and the **worker** both join the
same room, and they find each other there.

1. **Token endpoint (you host this).** The browser must not hold
   `LIVEKIT_API_SECRET`. Issue a short-lived access token server-side — a tiny
   Supabase Edge Function (or any endpoint) that mints a JWT with
   `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` granting `roomJoin` for a room
   name (e.g. the call id) and the caller's identity.
2. **Browser joins.** The web app uses the
   [LiveKit JS SDK](https://docs.livekit.io/home/client/connect/) (or
   `@livekit/components-react`) to `room.connect(LIVEKIT_URL, token)` and
   publish the mic.
3. **Worker auto-joins.** When the room gets a participant, LiveKit dispatches
   a job to a registered worker; `entrypoint()` runs, joins the room, and
   `VaaniAgent.on_enter()` speaks the greeting. (For explicit control you can
   use [explicit agent dispatch](https://docs.livekit.io/agents/dispatch/) so
   the worker only joins rooms you name.)

So the existing React app would: call your token endpoint → connect to the
room → the Python worker joins and the screening starts. No VAPI web SDK
involved on this path.

### Telephony (production path)

For real callers, front the room with **LiveKit SIP**: an Exotel/PSTN trunk
bridges inbound calls into a LiveKit room via a SIP participant, and the same
worker joins it — identical agent code, no web SDK. See
[LiveKit SIP](https://docs.livekit.io/sip/). This mirrors the VAPI Exotel
toll-free path described in `CLAUDE.md`, and is where `escalate_to_doctor`
would also SIP-transfer the on-call RMP into the live call in production.

---

## Files

| File | Purpose |
|---|---|
| `agent.py` | The worker: `AgentSession` wiring + `VaaniAgent` with the 3 tools + entrypoint. |
| `requirements.txt` | Pinned `livekit-agents[openai,silero,deepgram,turn-detector]~=1.6` + `livekit-plugins-sarvam~=1.6` + `aiohttp` + `python-dotenv`. |
| `Dockerfile` | `python:3.11-slim`, installs deps, bakes model weights, `CMD python agent.py start`. |
| `.env.example` | Every env var the worker needs. |

---

## Open TODOs (carried into the code as comments)

- **Live escalation endpoint.** The platform produces the cockpit RED card via
  the *post-call* pipeline (`process-call-records` → `triage-score`). There is
  no dedicated *mid-call* escalation function yet, so `escalate_to_doctor`
  currently logs + best-effort notifies `vapi-webhook`. Point it at a real live
  endpoint when one exists. (`agent.py` → `escalate_to_doctor`.)
- **Tamil greeting + prompt.** `vaani-ta-v3.md` does not exist yet; `LANG_CODE=ta`
  falls back to the Hindi prompt, and the Tamil `firstMessage` is a placeholder.
- **Sarvam STT/TTS model strings** are env-overridable; confirm the exact
  Saarika/Bulbul versions and the gender-neutral speaker against the Sarvam
  console before demo (`SARVAM_STT_MODEL`, `SARVAM_TTS_MODEL`, `SARVAM_TTS_SPEAKER`).
