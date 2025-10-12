import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');

export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  postgresConnectionString: process.env.POSTGRES_CONNECTION_STRING,
  r2: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT,
    bucket: process.env.R2_BUCKET,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, ''),
  },
  dataDir: path.resolve(process.env.BOT_DATA_DIR || path.join(rootDir, 'data')),
};

export function ensureDataDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

export function validateConfig() {
  const missing = [];
  if (!config.discordToken) missing.push('DISCORD_TOKEN');
  if (!config.discordClientId) missing.push('DISCORD_CLIENT_ID');
  if (!config.postgresConnectionString) missing.push('POSTGRES_CONNECTION_STRING');
  if (!config.r2.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!config.r2.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!config.r2.endpoint) missing.push('R2_ENDPOINT');
  if (!config.r2.bucket) missing.push('R2_BUCKET');
  if (!config.r2.publicBaseUrl) missing.push('R2_PUBLIC_BASE_URL');

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}
