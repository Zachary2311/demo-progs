# demo-progs

## Bluesky Discord Bot

This project contains a Discord bot that watches for Bluesky links and uploads the attached video directly into your Discord channels. It supports slash commands, optional automatic link handling per server, and stores guild preferences in PostgreSQL.

### Features

- `/bluesky fetch <url>` slash command to download and upload a Bluesky video on demand.
- `/bluesky listen <enabled>` to toggle automatic handling for Bluesky links on a per-server basis.
- Streams video segments to disk to minimise memory usage and stores them in the local `data/` directory until the upload completes.
- Uses embeds with author, caption, and thumbnail details from the original post.
- Persists guild settings in PostgreSQL via `asyncpg`.

### Requirements

- Python 3.11+
- PostgreSQL database accessible via a connection string.
- Discord bot token with the `MESSAGE CONTENT INTENT` enabled.

### Setup

1. Create and populate a `.env` file using `.env.example` as a template.

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Run database migrations (the bot will automatically create the required table on startup).

4. Start the bot:

   ```bash
   python bot.py
   ```

### Environment Variables

- `DISCORD_TOKEN`: Your Discord bot token.
- `DATABASE_URL`: PostgreSQL DSN (e.g. `postgresql://user:password@localhost:5432/database`).
- `BOT_DATA_DIR` (optional): Override the directory used for temporary video downloads.

### Notes

- Discord enforces upload limits per server. If a downloaded video exceeds the configured limit, the bot will report the issue instead of uploading.
- The bot only retains downloaded files until after an upload attempt completes, then removes them from disk.
