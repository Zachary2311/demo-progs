# Bluesky Discord Downloader Bot

A Discord bot that watches for Bluesky post links, downloads their video content, and reposts the video inside your server. The bot supports slash commands, PostgreSQL-backed guild preferences, and streams downloads to avoid excessive memory usage.

## Features

- Slash commands for toggling automatic Bluesky monitoring and on-demand downloads.
- PostgreSQL storage for per-guild listener preferences.
- Streams HLS segments directly to disk inside the bot's data directory until upload completes.
- Embeds with author, description, and thumbnails when available.
- Optional guild-specific command registration for faster iteration during development.

## Prerequisites

- Node.js 18 or newer.
- A running PostgreSQL database.
- A Discord application with a bot token and the `MESSAGE CONTENT INTENT` enabled.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   |----------|-------------|
   | `DISCORD_TOKEN` | Bot token from the Discord Developer Portal. |
   | `DISCORD_CLIENT_ID` | Application (client) ID. |
   | `DATABASE_URL` | PostgreSQL connection string. |
   | `DEV_GUILD_IDS` | *(Optional)* Comma-separated guild IDs for instant command registration. |
   | `BOT_DATA_DIR` | *(Optional)* Absolute path to the download directory (defaults to `./data`). |
   | `MAX_UPLOAD_BYTES` | *(Optional)* Maximum upload size in bytes (defaults to 8 MiB). |

3. Ensure your database is reachable with the provided URL. The bot will create the `guild_settings` table on startup if it does not already exist.

4. Start the bot:

   ```bash
   npm start
   ```

## Usage

### Slash Commands

- `/bluesky-listener enabled:<true|false>` – Toggle automatic downloads when Bluesky links appear in the guild.
- `/bluesky-download url:<post-url>` – Fetch a specific Bluesky post immediately.

### Automatic Downloads

When the listener is enabled for a guild, every new message containing a Bluesky post URL triggers a download. The bot streams the video to a temporary file within the data directory, uploads it as an attachment, and cleans up the file afterwards.

## Deployment Tips

- Grant the bot the `Read Message History`, `Read Messages/View Channels`, `Send Messages`, and `Attach Files` permissions in each guild where it should operate.
- The default download directory is `./data`; ensure the process has write permissions. For Docker deployments, mount a volume and set `BOT_DATA_DIR` accordingly.
- Consider setting `PG_MAX_CLIENTS` or `PG_IDLE_TIMEOUT_MS` environment variables to fine-tune PostgreSQL connection pooling.

## License

MIT
