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

const requiredR2Env = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
];

for (const key of requiredR2Env) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function normalizeBaseUrl(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function normalizePrefix(prefix) {
  if (!prefix) return '';
  const trimmed = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? `${trimmed}/` : '';
}

export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  databaseUrl: process.env.DATABASE_URL,
  downloadRoot: process.env.BOT_DATA_DIR || defaultDataDir,
  commandGuildIds: process.env.DEV_GUILD_IDS ? process.env.DEV_GUILD_IDS.split(',').map((id) => id.trim()).filter(Boolean) : null,
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024),
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    endpoint:
      process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    publicBaseUrl: normalizeBaseUrl(process.env.R2_PUBLIC_BASE_URL),
    objectPrefix: normalizePrefix(process.env.R2_OBJECT_PREFIX),
  },
};
