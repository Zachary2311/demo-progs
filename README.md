# X/Twitter Video Discord Bot

This project provides a Discord bot that downloads video content from X/Twitter posts, uploads the media to Cloudflare R2, and shares the resulting link inside Discord. It supports automatic message listeners, slash commands, silent responses, and bulk processing while keeping RAM usage low via streaming downloads.

## Features

- Slash commands for configuring the listener, downloading a single video, or handling comma-separated bulk downloads with status embeds.
- Optional per-guild listener that automatically reacts to X/Twitter links with a Cloudflare R2 video link.
- Toggleable silent mode (per guild and per command) to send only the video link without additional text.
- Streams HLS playlists with support for `EXT-X-MAP`, discontinuities, and byte range segments. TS output is remuxed to MP4 via `ffmpeg` to ensure compatibility.
- Videos are stored temporarily in the bot's data directory and removed after a successful upload to Cloudflare R2.
- Uploads assets to Cloudflare R2 instead of attaching media directly to Discord messages.
- Postgres-backed storage for guild configuration.

## Requirements

- Node.js 18+
- Postgres database accessible via connection string
- Cloudflare R2 bucket configured for public reads
- `ffmpeg` available on the host for remuxing transport stream segments

## Configuration

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the required values:

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   | --- | --- |
   | `DISCORD_TOKEN` | Bot token from the Discord developer portal |
   | `DISCORD_CLIENT_ID` | Application client ID used for command registration |
   | `POSTGRES_CONNECTION_STRING` | Connection string for the Postgres database |
   | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare R2 credentials |
   | `R2_ENDPOINT` | R2 S3-compatible endpoint |
   | `R2_BUCKET` | Bucket name for uploads |
| `R2_PUBLIC_BASE_URL` | Public base URL that serves uploaded files |
| `BOT_DATA_DIR` | Optional path for temporary downloads (defaults to `./data`) |
| `TWITTER_BEARER_TOKEN` | Optional override for the built-in guest bearer token used when falling back to X GraphQL APIs |
| `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` | Optional user cookies for accessing age-restricted or otherwise gated tweets |

3. Register slash commands (only needed after initial setup or when commands change):

   ```bash
   npm run register-commands
   ```

4. Start the bot:

   ```bash
   npm start
   ```

## Usage

- `/xlistener` &ndash; Enable/disable the automatic listener and configure silent mode for a guild.
- `/xdownload` &ndash; Download a single tweet video with an optional silent response.
- `/xdownloadbulk` &ndash; Download multiple tweet videos at once. The bot posts a progress embed, follows up with each result (respecting the silent option), and summarizes successes/errors.
- When the listener is enabled, the bot watches for X/Twitter links in guild channels and replies automatically. Silent mode causes replies to include only the Cloudflare R2 video URL.

## Development Notes

- The bot keeps downloads on disk only until the Cloudflare R2 upload completes. Failed uploads also clean up temporary files.
- HLS handling respects `EXT-X-MAP`, `EXT-X-BYTERANGE`, and discontinuities to avoid corrupt output. When transport stream segments are encountered, they are remuxed to MP4 before upload.
- Logging is provided through `winston`. Adjust `LOG_LEVEL` to control verbosity.
- Tweet metadata is first fetched from syndication endpoints; if those fail, the bot falls back to X's GraphQL TweetResult API using a guest bearer token. Provide `TWITTER_BEARER_TOKEN` if the baked-in token stops working. Configure `TWITTER_AUTH_TOKEN` and `TWITTER_CT0` (copied from an authenticated browser session) to allow the bot to resolve age-restricted or otherwise gated tweets when the guest flow is denied.
