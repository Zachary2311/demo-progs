import { Pool } from 'pg';
import { config } from './config.js';

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_MAX_CLIENTS ?? 10),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
});

export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      listen_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      silent_mode BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `ALTER TABLE guild_settings
       ADD COLUMN IF NOT EXISTS silent_mode BOOLEAN NOT NULL DEFAULT FALSE`
  );
}

export async function getGuildSettings(guildId) {
  const result = await pool.query(
    `SELECT listen_enabled, silent_mode FROM guild_settings WHERE guild_id = $1`,
    [guildId]
  );
  if (result.rowCount === 0) {
    return { listenEnabled: false, silentMode: false };
  }
  const row = result.rows[0];
  return {
    listenEnabled: Boolean(row.listen_enabled),
    silentMode: Boolean(row.silent_mode),
  };
}

export async function saveGuildSettings(guildId, updates) {
  const current = await getGuildSettings(guildId);
  const next = {
    listenEnabled: updates.listenEnabled ?? current.listenEnabled ?? false,
    silentMode: updates.silentMode ?? current.silentMode ?? false,
  };

  await pool.query(
    `INSERT INTO guild_settings (guild_id, listen_enabled, silent_mode, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (guild_id)
     DO UPDATE SET listen_enabled = EXCLUDED.listen_enabled,
                   silent_mode = EXCLUDED.silent_mode,
                   updated_at = NOW();`,
    [guildId, next.listenEnabled, next.silentMode]
  );

  return next;
}

export async function shutdownDatabase() {
  await pool.end();
}
