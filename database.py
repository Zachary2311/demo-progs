from __future__ import annotations

import asyncpg

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id BIGINT PRIMARY KEY,
    listen_for_links BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
"""

UPSERT_SQL = """
INSERT INTO guild_settings (guild_id, listen_for_links, updated_at)
VALUES ($1, $2, NOW())
ON CONFLICT (guild_id)
DO UPDATE SET listen_for_links = EXCLUDED.listen_for_links, updated_at = NOW();
"""

SELECT_SQL = "SELECT listen_for_links FROM guild_settings WHERE guild_id = $1;"


class GuildSettingsRepository:
    def __init__(self, pool: asyncpg.pool.Pool) -> None:
        self._pool = pool

    @classmethod
    async def create(cls, dsn: str) -> "GuildSettingsRepository":
        pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
        repo = cls(pool)
        await repo._setup()
        return repo

    async def close(self) -> None:
        await self._pool.close()

    async def _setup(self) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(CREATE_TABLE_SQL)

    async def set_listening(self, guild_id: int, listen: bool) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(UPSERT_SQL, guild_id, listen)

    async def get_listening(self, guild_id: int) -> bool:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(SELECT_SQL, guild_id)
        if row is None:
            return False
        return bool(row["listen_for_links"])
