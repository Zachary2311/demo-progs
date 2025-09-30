from __future__ import annotations

from psycopg_pool import AsyncConnectionPool


CREATE_GUILD_SETTINGS_TABLE = """
CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id BIGINT PRIMARY KEY,
    bluesky_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


class Database:
    """Lightweight database wrapper around :mod:`psycopg`."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._pool: AsyncConnectionPool | None = None

    @property
    def pool(self) -> AsyncConnectionPool:
        if self._pool is None:
            raise RuntimeError("Database pool has not been initialized yet")
        return self._pool

    async def connect(self) -> None:
        self._pool = AsyncConnectionPool(
            conninfo=self._dsn,
            open=False,
            kwargs={"autocommit": True},
        )
        await self._pool.open(wait=True)
        async with self.pool.connection() as conn:
            await conn.execute(CREATE_GUILD_SETTINGS_TABLE)

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    async def get_guild_setting(self, guild_id: int) -> bool:
        query = "SELECT bluesky_enabled FROM guild_settings WHERE guild_id = %s"
        async with self.pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, (guild_id,))
                row = await cur.fetchone()
        return True if row is None else bool(row[0])

    async def set_guild_setting(self, guild_id: int, enabled: bool) -> None:
        query = """
        INSERT INTO guild_settings (guild_id, bluesky_enabled, updated_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (guild_id) DO UPDATE
        SET bluesky_enabled = EXCLUDED.bluesky_enabled,
            updated_at = EXCLUDED.updated_at;
        """
        async with self.pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, (guild_id, enabled))
