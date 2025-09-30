import { getGuildSettings } from './database.js';

class GuildSettingsCache {
  constructor({ ttlMs = 60_000 } = {}) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  async get(guildId) {
    const existing = this.cache.get(guildId);
    const now = Date.now();
    if (existing && existing.expiresAt > now) {
      return existing.value;
    }
    const value = await getGuildSettings(guildId);
    this.cache.set(guildId, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  set(guildId, value) {
    this.cache.set(guildId, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

export const guildSettingsCache = new GuildSettingsCache({
  ttlMs: Number(process.env.SETTINGS_CACHE_TTL_MS ?? 60_000),
});
