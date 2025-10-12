import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

const { Pool } = pg;

export const pool = new Pool({ connectionString: config.postgresConnectionString });

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      listen_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      silent_default BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getGuildSettings(guildId) {
  const { rows } = await pool.query('SELECT * FROM guild_settings WHERE guild_id = $1', [guildId]);
  if (rows.length === 0) {
    return { guild_id: guildId, listen_enabled: false, silent_default: false };
  }
  return rows[0];
}

export async function updateGuildSettings(guildId, updates) {
  const current = await getGuildSettings(guildId);
  const listen = updates.listen_enabled ?? current.listen_enabled;
  const silent = updates.silent_default ?? current.silent_default;
  await pool.query(
    `INSERT INTO guild_settings (guild_id, listen_enabled, silent_default, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (guild_id) DO UPDATE SET
      listen_enabled = EXCLUDED.listen_enabled,
      silent_default = EXCLUDED.silent_default,
      updated_at = NOW()`,
    [guildId, listen, silent]
  );
  const updated = await getGuildSettings(guildId);
  logger.info(`Updated settings for guild ${guildId}: listen=${updated.listen_enabled}, silent=${updated.silent_default}`);
  return updated;
}
