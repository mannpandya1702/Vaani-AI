# Vaani-AI LiveKit Agents voice worker
# Generic container image — runs on LiveKit Cloud Agents, Render, Fly, Railway,
# Cloud Run, or any Docker host. The worker dials out to LIVEKIT_URL and joins
# rooms it is dispatched to; no inbound ports are required.

FROM python:3.11-slim

# System deps: certs for TLS to Supabase/Sarvam/LiveKit; build tools for any
# wheels that compile (onnxruntime used by Silero/turn-detector ships wheels,
# so this stays light). curl is handy for healthchecks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install Python deps first for better layer caching.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the worker.
COPY agent.py ./

# Bake model weights into the image so cold starts don't download Silero VAD
# and the multilingual turn-detector at runtime. (This is the LiveKit-
# recommended step for containerised agents.)
RUN python agent.py download-files

# Start the worker in production mode. It registers with LiveKit and waits for
# job dispatch. Use `dev` instead of `start` for local hot-reload (see README).
CMD ["python", "agent.py", "start"]
