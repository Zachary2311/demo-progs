import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredEnv = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DATABASE_URL'];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const defaultDataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');

export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  databaseUrl: process.env.DATABASE_URL,
  downloadRoot: process.env.BOT_DATA_DIR || defaultDataDir,
  commandGuildIds: process.env.DEV_GUILD_IDS ? process.env.DEV_GUILD_IDS.split(',').map((id) => id.trim()).filter(Boolean) : null,
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024),
};
