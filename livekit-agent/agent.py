#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Vaani-AI · LiveKit Agents voice worker (VAPI-replacement path)           ║
# ║                                                                          ║
# ║  This worker reproduces the exact live VAPI pipeline using LiveKit       ║
# ║  Agents 1.x. The single most important design decision:                  ║
# ║                                                                          ║
# ║      THE LLM IS ROUTED THROUGH VAANI'S EXISTING SAFETY PROXY,            ║
# ║      *NOT* DIRECTLY TO ANTHROPIC.                                         ║
# ║                                                                          ║
# ║  The proxy at  ${SUPABASE_URL}/functions/v1/vapi-custom-llm  is          ║
# ║  OpenAI Chat-Completions compatible. On every turn it:                   ║
# ║    1. runs hardcoded statutory refusal checks (PCPNDT / MHCA / POCSO /   ║
# ║       drug-Rx attempts) BEFORE any model sees the text, returning a      ║
# ║       verbatim language-appropriate refusal script when matched;         ║
# ║    2. PII-redacts every non-system message (name / phone / ABHA /        ║
# ║       Aadhaar / address) and writes the cross-border-transfer audit row; ║
# ║    3. calls Claude (Anthropic) with cache_control on the system block;   ║
# ║    4. streams the answer back as OpenAI SSE.                             ║
# ║                                                                          ║
# ║  By pointing livekit.plugins.openai.LLM at that base_url we keep the     ║
# ║  ENTIRE safety + compliance layer (DPDP §16, PCPNDT s.22, MHCA s.18,     ║
# ║  ABDM HDM ¶7.6) intact — exactly as the VAPI custom-llm path did.        ║
# ║  Do NOT "optimise" this into a direct anthropic.LLM() call.              ║
# ║                                                                          ║
# ║  Pipeline (mirrors CLAUDE.md "Voice Pipeline"):                          ║
# ║    STT  → Sarvam Saarika v2.x (Indic, HI/TA/EN code-switch)              ║
# ║    LLM  → Vaani safety proxy (vapi-custom-llm) → Claude                  ║
# ║    TTS  → Sarvam Bulbul v3                                               ║
# ║    VAD  → Silero                                                         ║
# ║    Turn → LiveKit multilingual turn detector                            ║
# ║    Tools→ capture_consent · escalate_to_doctor · end_call               ║
# ╚══════════════════════════════════════════════════════════════════════════╝

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import aiohttp
from dotenv import load_dotenv

from livekit import agents, api
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.plugins import openai, silero

# The multilingual turn detector ships in livekit-plugins-turn-detector.
# It is optional: if the package/weights are unavailable we fall back to
# pure-VAD turn detection so the worker still boots.
try:
    from livekit.plugins.turn_detector.multilingual import MultilingualModel

    _HAS_TURN_DETECTOR = True
except Exception:  # pragma: no cover - import guard only
    MultilingualModel = None  # type: ignore[assignment]
    _HAS_TURN_DETECTOR = False

# Sarvam is the production STT+TTS (Saarika + Bulbul). A maintained LiveKit
# plugin exists: `livekit-plugins-sarvam`. We import it defensively so that, if
# it is ever missing at runtime, STT can fall back to Deepgram (see below).
try:
    from livekit.plugins import sarvam

    _HAS_SARVAM = True
except Exception:  # pragma: no cover - import guard only
    sarvam = None  # type: ignore[assignment]
    _HAS_SARVAM = False

# Deepgram is ONLY the STT fallback when the Sarvam plugin is unavailable.
# TODO(sarvam): keep STT on Sarvam Saarika in production — Deepgram is a
# break-glass path so the worker can still start without the Sarvam plugin.
try:
    from livekit.plugins import deepgram

    _HAS_DEEPGRAM = True
except Exception:  # pragma: no cover - import guard only
    deepgram = None  # type: ignore[assignment]
    _HAS_DEEPGRAM = False


load_dotenv()  # loads .env (local dev); on LiveKit Cloud, env comes from secrets
logger = logging.getLogger("vaani-livekit")
logging.basicConfig(level=logging.INFO)


# ─────────────────────────────────────────────────────────────────────────────
# Config — every knob comes from the environment (see .env.example)
# ─────────────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
WEBHOOK_MASTER_KEY = os.environ.get("WEBHOOK_MASTER_KEY", "")

# The Vaani safety proxy: OpenAI-compatible, bearer = WEBHOOK_MASTER_KEY.
LLM_BASE_URL = f"{SUPABASE_URL}/functions/v1/vapi-custom-llm"
# The proxy ignores/normalises the model id, but we send a stable label.
LLM_MODEL = os.environ.get("LLM_MODEL", "claude")

# Sarvam voice stack
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "")
SARVAM_TTS_MODEL = os.environ.get("SARVAM_TTS_MODEL", "bulbul:v3")
SARVAM_TTS_SPEAKER = os.environ.get("SARVAM_TTS_SPEAKER", "anushka")
# Saarika handles HI/TA/EN code-switching; v2.5 is current.
SARVAM_STT_MODEL = os.environ.get("SARVAM_STT_MODEL", "saarika:v2.5")

DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY", "")

# Language switch (hi | ta). Drives the prompt file, the greeting and the
# Sarvam language codes. The handoff target placeholder respects CLAUDE.md.
LANG = os.environ.get("LANG_CODE", os.environ.get("LANG", "hi")).lower()
if LANG not in ("hi", "ta"):
    LANG = "hi"

# BCP-47 codes Sarvam expects.
_SARVAM_LANG = {"hi": "hi-IN", "ta": "ta-IN"}[LANG]

# Aanya §13: "urgent" path renders at a calmer pace. 0.85 mirrors the
# sarvam-tts-bridge default; we keep the human-paced 1.0 for normal screening
# and let the proxy/red-flag layer own urgency.
SARVAM_TTS_PACE = float(os.environ.get("SARVAM_TTS_PACE", "1.0"))

# RMP placeholder (CLAUDE.md): until RMP_NAME / RMP_MCI_REG are filled, every
# patient-facing surface uses "डॉक्टर साहब".
RMP_NAME = os.environ.get("RMP_NAME", "डॉक्टर साहब")
RMP_MCI_REG = os.environ.get("RMP_MCI_REG", "")

# Prompt files live in the repo's docs/prompts. Allow override via env so the
# worker is portable when copied out of the monorepo.
_DEFAULT_PROMPT_DIR = Path(__file__).resolve().parent.parent / "docs" / "prompts"
PROMPT_DIR = Path(os.environ.get("VAANI_PROMPT_DIR", str(_DEFAULT_PROMPT_DIR)))
_PROMPT_FILE = {"hi": "vaani-hi-v3.md", "ta": "vaani-ta-v3.md"}


def _load_instructions() -> str:
    """Read the Vaani system prompt for the active language.

    Hindi (vaani-hi-v3.md) is the source of truth. If a Tamil file does not
    yet exist we fall back to the Hindi prompt so the worker still runs.
    """
    path = PROMPT_DIR / _PROMPT_FILE[LANG]
    if not path.exists() and LANG != "hi":
        logger.warning("prompt %s missing; falling back to Hindi prompt", path)
        path = PROMPT_DIR / _PROMPT_FILE["hi"]
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.error("Vaani prompt not found at %s — using minimal fallback", path)
        return (
            "You are वाणी, a warm clinic worker (NOT a doctor) screening a "
            "caller in simple Hindi. Capture chief complaint, onset, severity, "
            "one danger-sign question and age. On any red flag call "
            "escalate_to_doctor. Never diagnose, never name a drug. End with "
            "end_call. One short question per turn."
        )
    # Light runtime-placeholder substitution (the prompt §14 lists these).
    return (
        text.replace("{{doctor_name}}", RMP_NAME)
        .replace("{{mci_reg}}", RMP_MCI_REG or "—")
        .replace("{{lang}}", LANG)
    )


# Stage-0 firstMessage — spoken on enter, verbatim from the prompt §4/§15.
# (LANG=ta should be replaced with the Tamil greeting once the TA prompt lands.)
FIRST_MESSAGE = {
    "hi": (
        "नमस्ते जी, मैं वाणी हूँ, क्लिनिक से। यह कॉल रिकॉर्ड हो रही है ताकि "
        "डॉक्टर साहब बाद में सुन सकें। दो मिनट बात कर सकते हैं?"
    ),
    # TODO(ta): replace with the reviewed Tamil greeting from vaani-ta-v3.md.
    "ta": (
        "வணக்கம், நான் வாணி, கிளினிக்கிலிருந்து பேசுகிறேன். இந்த அழைப்பு "
        "பதிவாகிறது, மருத்துவர் பின்னர் கேட்பதற்காக. இரண்டு நிமிடம் பேசலாமா?"
    ),
}[LANG]


# ─────────────────────────────────────────────────────────────────────────────
# Supabase helper — POST a webhook with the WEBHOOK_MASTER_KEY bearer
# ─────────────────────────────────────────────────────────────────────────────
async def _post_supabase(path: str, payload: dict) -> dict | None:
    """Fire-and-confirm POST to a Supabase Edge Function.

    `path` is the function name (e.g. "consent-capture"). Auth mirrors the rest
    of the platform: Bearer WEBHOOK_MASTER_KEY, constant-time-compared server
    side. Failures are logged, never raised — a tool must not crash the call.
    """
    if not SUPABASE_URL:
        logger.warning("SUPABASE_URL unset; skipping POST to %s", path)
        return None
    url = f"{SUPABASE_URL}/functions/v1/{path}"
    headers = {
        "Authorization": f"Bearer {WEBHOOK_MASTER_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with aiohttp.ClientSession() as http:
            async with http.post(
                url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=8)
            ) as resp:
                body = await resp.text()
                if resp.status >= 400:
                    logger.error("POST %s -> %s %s", path, resp.status, body[:300])
                    return None
                try:
                    return json.loads(body) if body else {}
                except json.JSONDecodeError:
                    return {"raw": body}
    except Exception as exc:  # network/timeout — never bubble into the call
        logger.error("POST %s failed: %s", path, exc)
        return None


def _collect_turns(session) -> list[dict]:
    """Extract (role, text) pairs from the session chat history.

    Defensive across livekit-agents minor versions: history items expose
    `.role` and either `.text_content` or `.content` (str or list of parts).
    """
    out: list[dict] = []
    try:
        history = session.history
        items = getattr(history, "items", None) or getattr(history, "messages", None) or []
        for item in items:
            role = getattr(item, "role", None)
            if role not in ("user", "assistant"):
                continue
            text = getattr(item, "text_content", None)
            if not text:
                content = getattr(item, "content", None)
                if isinstance(content, str):
                    text = content
                elif isinstance(content, (list, tuple)):
                    text = " ".join(c for c in content if isinstance(c, str))
            if text and str(text).strip():
                out.append({"role": role, "text": str(text).strip()})
    except Exception as exc:
        logger.error("collect_turns failed: %s", exc)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# The Agent — instructions from the prompt file + the three VAPI tools
# ─────────────────────────────────────────────────────────────────────────────
class VaaniAgent(Agent):
    """वाणी — the screening front-door agent.

    Tools mirror the VAPI assistant exactly: capture_consent,
    escalate_to_doctor, end_call. They are SILENT (the prompt §11 forbids
    naming or narrating a tool) and, where they touch Supabase, authenticate
    with WEBHOOK_MASTER_KEY.
    """

    def __init__(self, session_meta: dict) -> None:
        super().__init__(instructions=_load_instructions())
        # Correlation id for audit rows (the LiveKit room name == call id).
        self._session_meta = session_meta
        self._consent_granted: bool | None = None
        self._escalated: bool = False

    async def on_enter(self) -> None:
        """Speak Stage-0 firstMessage the moment the agent joins.

        We use `say` (not generate_reply) so the greeting is the EXACT,
        reviewed, compliance-checked script — never an LLM paraphrase.
        """
        await self.session.say(FIRST_MESSAGE, allow_interruptions=True)

    # ── Tool 1: capture_consent ────────────────────────────────────────────
    @function_tool
    async def capture_consent(
        self,
        ctx: RunContext,
        granted: bool,
        utterance_transcript: str = "",
        language: str = LANG,
        reason: str = "",
    ) -> str:
        """Record the caller's recording/processing consent decision.

        Call this the instant consent is clearly given OR refused/withdrawn.
        Do NOT pause the conversation for it — it is silent.

        Args:
            granted: True if the caller agreed to be recorded/processed.
            utterance_transcript: the caller's own words granting/declining.
            language: 'hi' or 'ta'.
            reason: when not granted — 'declined' or 'withdrawn'.
        """
        self._consent_granted = granted
        logger.info("capture_consent granted=%s reason=%s", granted, reason)
        await _post_supabase(
            "consent-capture",
            {
                "call_id": self._session_meta.get("room"),
                "granted": granted,
                "language": language,
                "reason": reason or None,
                "utterance_transcript": utterance_transcript or None,
                "source": "livekit-agent",
            },
        )
        # Return value is for the model's working memory only; never spoken.
        return "consent_recorded"

    # ── Tool 2: escalate_to_doctor ─────────────────────────────────────────
    @function_tool
    async def escalate_to_doctor(
        self,
        ctx: RunContext,
        category: str,
        summary: str = "",
    ) -> str:
        """Fire the cockpit RED card for the on-call RMP on a red flag.

        Call this within the SAME turn a danger sign turns positive (prompt
        §12). Categories: cardiac, respiratory, stroke_befast, neuro,
        obstetric, burns, peds, mental_health, envenomation, trauma_major,
        sepsis, anaphylaxis, peds_safeguarding, audio_unclear.

        Args:
            category: the red-flag category above.
            summary: one-line reason for the doctor (PII handling happens
                server-side — keep it clinical, not identifying).
        """
        self._escalated = True
        logger.warning("escalate_to_doctor category=%s", category)
        # TODO(escalation-endpoint): the cockpit RED card is produced by the
        # post-call triage pipeline (process-call-records → triage-score). The
        # platform does not yet expose a *live* mid-call escalation function;
        # we log + best-effort notify the webhook so the queue is aware. When a
        # dedicated live endpoint lands, point this POST at it.
        await _post_supabase(
            "vapi-webhook",
            {
                "type": "live-escalation",
                "call_id": self._session_meta.get("room"),
                "category": category,
                "summary": summary or None,
                "source": "livekit-agent",
            },
        )
        return "escalation_fired"

    # ── Tool 3: end_call ───────────────────────────────────────────────────
    @function_tool
    async def end_call(self, ctx: RunContext, reason: str = "completed") -> str:
        """Hang up after a closing line has been spoken.

        MANDATORY after every close (prompt §13). ALWAYS speak the closing
        line FIRST, then call this. We let any in-flight speech finish, then
        delete the room so the caller is actually disconnected (an ended
        session alone leaves the caller hearing silence).

        Args:
            reason: 'completed' | 'declined' | 'withdrawn' | 'emergency' |
                'audio_unclear'.
        """
        logger.info("end_call reason=%s", reason)
        # Drain the current utterance so the goodbye is not cut off.
        try:
            await ctx.session.drain()  # waits for queued/active speech to play out
        except Exception:
            pass
        # Disconnect everyone by deleting the room via the LiveKit server API.
        try:
            job_ctx = agents.get_job_context()
            await job_ctx.api.room.delete_room(
                api.DeleteRoomRequest(room=job_ctx.room.name)
            )
        except Exception as exc:
            logger.error("delete_room failed: %s", exc)
            # Fallback: at least close the agent session.
            try:
                await ctx.session.aclose()
            except Exception:
                pass
        return "call_ended"


# ─────────────────────────────────────────────────────────────────────────────
# Plugin builders — Sarvam first, documented fallbacks behind it
# ─────────────────────────────────────────────────────────────────────────────
def _build_stt():
    """Sarvam Saarika STT (Indic, HI/TA/EN code-switch).

    Falls back to Deepgram (language='multi') ONLY if the Sarvam plugin is not
    installed — clearly a break-glass path, not the intended production STT.
    """
    if _HAS_SARVAM and SARVAM_API_KEY:
        # api_key defaults to SARVAM_API_KEY; passed explicitly for clarity.
        return sarvam.STT(
            model=SARVAM_STT_MODEL,
            language=_SARVAM_LANG,
            api_key=SARVAM_API_KEY,
        )
    if _HAS_DEEPGRAM and DEEPGRAM_API_KEY:
        logger.warning(
            "Sarvam STT unavailable — FALLING BACK TO DEEPGRAM. "
            "TODO: install livekit-plugins-sarvam and swap back to Saarika."
        )
        # nova-3 with multi-language to approximate code-switching.
        return deepgram.STT(model="nova-3", language="multi", api_key=DEEPGRAM_API_KEY)
    raise RuntimeError(
        "No STT available: set SARVAM_API_KEY (preferred) or DEEPGRAM_API_KEY."
    )


def _build_tts():
    """Sarvam Bulbul v3 TTS via the maintained LiveKit Sarvam plugin.

    If the plugin is missing we raise — there is no acceptable English-TTS
    fallback for an Indic patient-facing voice. (A custom REST adapter against
    https://api.sarvam.ai/text-to-speech could be added here if ever needed;
    documented in README.)
    """
    if _HAS_SARVAM and SARVAM_API_KEY:
        return sarvam.TTS(
            model=SARVAM_TTS_MODEL,
            speaker=SARVAM_TTS_SPEAKER,
            target_language_code=_SARVAM_LANG,
            pace=SARVAM_TTS_PACE,
            api_key=SARVAM_API_KEY,
        )
    raise RuntimeError(
        "Sarvam TTS unavailable: install livekit-plugins-sarvam and set "
        "SARVAM_API_KEY (the patient-facing voice must be Indic)."
    )


def _build_llm():
    """LLM via the Vaani SAFETY PROXY — never direct to Anthropic.

    OpenAI-compatible base_url = ${SUPABASE_URL}/functions/v1/vapi-custom-llm,
    bearer = WEBHOOK_MASTER_KEY. This preserves hardcoded statutory refusals +
    PII redaction + Claude + cache_control, identical to the VAPI custom-llm
    path. See the banner at the top of this file.
    """
    if not SUPABASE_URL or not WEBHOOK_MASTER_KEY:
        raise RuntimeError(
            "LLM proxy misconfigured: set SUPABASE_URL and WEBHOOK_MASTER_KEY."
        )
    return openai.LLM(
        model=LLM_MODEL,
        base_url=LLM_BASE_URL,
        api_key=WEBHOOK_MASTER_KEY,  # forwarded as the Bearer token
        # The proxy owns sampling on the Anthropic side; keep client minimal.
        temperature=0.7,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Worker plumbing
# ─────────────────────────────────────────────────────────────────────────────
def prewarm(proc: JobProcess) -> None:
    """Load the Silero VAD once per worker process (reused across jobs)."""
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext) -> None:
    """One LiveKit job == one call. Wire the session and greet."""
    # Connect to the room the dispatcher assigned this worker to.
    await ctx.connect()
    logger.info("vaani worker joined room=%s lang=%s", ctx.room.name, LANG)

    # Reuse the prewarmed VAD if present; otherwise load on demand.
    vad = ctx.proc.userdata.get("vad") or silero.VAD.load()

    # Multilingual turn detector (semantic end-of-turn) if available, else VAD.
    turn_detection = MultilingualModel() if _HAS_TURN_DETECTOR else "vad"

    session = AgentSession(
        stt=_build_stt(),
        llm=_build_llm(),
        tts=_build_tts(),
        vad=vad,
        turn_detection=turn_detection,
    )

    # On call end — whether the agent hangs up or the caller drops — persist the
    # transcript and fire the post-call pipeline. This is what turns a LiveKit
    # *conversation* into a real cockpit card → SOAP → shadow → the "doctor has
    # seen you" callback. Without it a LiveKit call leaves no clinical record.
    async def _persist_call() -> None:
        turns = _collect_turns(session)
        if not turns:
            logger.info("livekit-ingest: no turns to persist")
            return
        room_name = ctx.room.name or ""
        lang = "ta" if "-ta-" in room_name else "hi"
        res = await _post_supabase(
            "livekit-ingest",
            {"room": room_name, "lang": lang, "turns": turns},
        )
        logger.info("livekit-ingest persisted %d turns -> %s", len(turns), res)

    ctx.add_shutdown_callback(_persist_call)

    await session.start(
        agent=VaaniAgent(session_meta={"room": ctx.room.name}),
        room=ctx.room,
    )
    # on_enter() speaks the Stage-0 firstMessage automatically.


if __name__ == "__main__":
    # `python agent.py dev`   → local dev (hot-reload)
    # `python agent.py start` → production
    # `python agent.py download-files` → bake Silero + turn-detector weights
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        )
    )
