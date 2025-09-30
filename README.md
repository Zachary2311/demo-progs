# Bluesky Video Discord Bot

A Discord bot that watches for Bluesky post links and mirrors attached videos directly into your server. It streams downloads to disk to keep memory usage low, stores guild preferences in PostgreSQL, and exposes slash commands for easy management.

## Features

- Automatic detection of Bluesky links in guild channels with opt-in/opt-out per server.
- Slash command to manually download a Bluesky video via URL.
- Streaming downloads into the bot's `data/` directory to minimise RAM usage.
- PostgreSQL-backed configuration using `psycopg` with connection pooling.
- Rich embed status messages for transparency while downloads and uploads run.

## Requirements

- Python 3.11+
- PostgreSQL 13+
- A Discord bot application with the **Message Content Intent** enabled.

## Setup

1. Install dependencies:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and fill in the values:

   ```env
   DISCORD_TOKEN=your-discord-bot-token
   DATABASE_URL=postgresql://user:password@localhost:5432/database
   DATA_DIRECTORY=./data
   ```

3. Ensure your PostgreSQL database is reachable and that the bot has permission to create tables.

4. Run the bot:

   ```bash
   python -m bot
   ```

The bot will create the `guild_settings` table on startup if it does not exist.

## Slash Commands

- `/bluesky_toggle enable:<true|false>` – Enables or disables automatic Bluesky downloads for the current server.
- `/bluesky_download url:<post url>` – Manually fetches and uploads the video from the supplied Bluesky post.

## Behaviour

- Videos are stored temporarily under `data/downloads/` while downloading and uploading. Files are deleted immediately after the upload finishes or on failure.
- If the bot cannot download or upload a file, it updates the embed with the error message instead of silently failing.
- The bot respects Discord's upload limits. When the Bluesky metadata reports a size above the default 24 MiB limit, the bot will stop before uploading.

## Environment Variables

- `DISCORD_TOKEN` – Bot token from the Discord developer portal.
- `DATABASE_URL` – PostgreSQL connection string.
- `DATA_DIRECTORY` – Optional path for persistent data (defaults to `./data`).

## Development Notes

- The Bluesky API used is public and does not require authentication, but the bot expects posts to expose downloadable video blobs.
- Ensure the bot has the `Send Messages`, `Embed Links`, and `Attach Files` permissions in any channels where it should respond.
