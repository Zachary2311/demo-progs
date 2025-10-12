# syntax=docker/dockerfile:1

# Minimal, production-friendly Python base
FROM python:3.11-slim AS base

LABEL org.opencontainers.image.title="Discord Video Download Bot" \
      org.opencontainers.image.description="Container with Python, ffmpeg, and voice deps for discord.py + yt-dlp" \
      org.opencontainers.image.licenses="MIT"

# Sensible Python defaults
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System dependencies
# - ffmpeg: required for audio/video processing and discord voice
# - libopus0: runtime library for opus (discord voice)
# - libffi-dev, libsodium-dev, build-essential, gcc: build deps for PyNaCl and other native wheels
# - ca-certificates, git: common utilities
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      libopus0 \
      libffi-dev \
      libsodium-dev \
      build-essential \
      gcc \
      ca-certificates \
      git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps early to maximize layer caching.
# If a requirements.txt exists, install from it; otherwise install a safe default set
# commonly used for Discord bots that download/process media.
COPY requirements.txt* /app/
RUN --mount=type=cache,target=/root/.cache/pip bash -lc '
  python -m pip install --upgrade pip && \
  if [ -f requirements.txt ]; then \
    pip install -r requirements.txt; \
  else \
    echo "requirements.txt not found; installing sensible defaults (discord.py[voice], yt-dlp, python-dotenv)..." && \
    pip install "discord.py[voice]" yt-dlp python-dotenv; \
  fi'

# Copy the rest of the application source
COPY . /app



# By default, run main.py. If your entry is different (e.g., src/bot.py), override at runtime:
#   docker run ... image python src/bot.py
CMD ["python", "main.py"]
