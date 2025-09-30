from __future__ import annotations

import asyncpg


CREATE_GUILD_SETTINGS_TABLE = """
CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id BIGINT PRIMARY KEY,
    bluesky_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


class Database:
    """Lightweight database wrapper around :mod:`asyncpg`."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("Database pool has not been initialized yet")
        return self._pool

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(self._dsn)
        async with self.pool.acquire() as conn:
            await conn.execute(CREATE_GUILD_SETTINGS_TABLE)

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    async def get_guild_setting(self, guild_id: int) -> bool:
        query = "SELECT bluesky_enabled FROM guild_settings WHERE guild_id = $1"
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, guild_id)
        return True if row is None else bool(row["bluesky_enabled"])

    async def set_guild_setting(self, guild_id: int, enabled: bool) -> None:
        query = """
        INSERT INTO guild_settings (guild_id, bluesky_enabled, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (guild_id) DO UPDATE
        SET bluesky_enabled = EXCLUDED.bluesky_enabled,
            updated_at = EXCLUDED.updated_at;
        """
        async with self.pool.acquire() as conn:
            await conn.execute(query, guild_id, enabled)
