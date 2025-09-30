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
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function setGuildListening(guildId, enabled) {
  await pool.query(
    `INSERT INTO guild_settings (guild_id, listen_enabled, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (guild_id)
     DO UPDATE SET listen_enabled = EXCLUDED.listen_enabled, updated_at = NOW();`,
    [guildId, enabled]
  );
}

export async function isGuildListening(guildId) {
  const result = await pool.query(`SELECT listen_enabled FROM guild_settings WHERE guild_id = $1`, [guildId]);
  if (result.rowCount === 0) {
    return false;
  }
  return result.rows[0].listen_enabled;
}

export async function shutdownDatabase() {
  await pool.end();
}
