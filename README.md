# Bluesky Discord Downloader Bot

A Discord bot that watches for Bluesky post links, downloads their video content, and reposts the video inside your server. The bot supports slash commands, PostgreSQL-backed guild preferences, and streams downloads to avoid excessive memory usage.

## Features

- Slash commands for toggling automatic Bluesky monitoring and on-demand downloads.
- PostgreSQL storage for per-guild listener preferences.
- Streams HLS segments directly to disk inside the bot's data directory until uploads complete.
- Uploads finished downloads to Cloudflare R2 for consistent Discord playback.
- Optional silent mode that posts only the video URL, with embeds available when desired.
- Optional guild-specific command registration for faster iteration during development.
- Preserves the original container type (fragmented MP4 vs. MPEG-TS) so re-hosted files keep working previews.

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
   | `MAX_UPLOAD_BYTES` | *(Optional)* Maximum download size in bytes (defaults to 8 MiB). |
   | `R2_ACCOUNT_ID` | Cloudflare account ID for the R2 bucket. |
   | `R2_ACCESS_KEY_ID` | Cloudflare R2 access key ID. |
   | `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret access key. |
   | `R2_BUCKET_NAME` | Cloudflare R2 bucket used to store uploaded videos. |
   | `R2_PUBLIC_BASE_URL` | Public base URL that serves files from the R2 bucket. |
   | `R2_ENDPOINT` | *(Optional)* Override the R2 S3-compatible endpoint. |
   | `R2_OBJECT_PREFIX` | *(Optional)* Prefix to apply to every uploaded object key. |

3. Ensure your database is reachable with the provided URL. The bot will create the `guild_settings` table on startup if it does not already exist.

4. Start the bot:

   ```bash
   npm start
   ```

## Usage

### Slash Commands

- `/bluesky-listener enabled:<true|false> silent:<true|false>` – Toggle automatic downloads when Bluesky links appear in the guild and whether reposts should be silent.
- `/bluesky-download url:<post-url> silent:<true|false>` – Fetch a specific Bluesky post immediately, optionally returning only the video URL.

### Automatic Downloads

When the listener is enabled for a guild, every new message containing a Bluesky post URL triggers a download. The bot streams the video to a temporary file within the data directory, uploads it to Cloudflare R2, and cleans up the file afterwards. The reposted message includes the hosted video URL and, unless silent mode is enabled, an informative embed.

HLS variants that use MPEG-TS segments are saved with a `.ts` extension and served with the correct MIME type. Fragmented MP4 variants prepend the required initialization segment before their media segments so the resulting `.mp4` files play inline in Discord.

## Deployment Tips

- Grant the bot the `Read Message History`, `Read Messages/View Channels`, `Send Messages`, and `Attach Files` permissions in each guild where it should operate.
- The default download directory is `./data`; ensure the process has write permissions. For Docker deployments, mount a volume and set `BOT_DATA_DIR` accordingly.
- Consider setting `PG_MAX_CLIENTS` or `PG_IDLE_TIMEOUT_MS` environment variables to fine-tune PostgreSQL connection pooling.

## License

MIT
