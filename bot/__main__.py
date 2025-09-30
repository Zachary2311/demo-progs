from __future__ import annotations

import asyncio

from .client import create_bot
from .config import load_settings
from .database import Database


async def run_bot() -> None:
    settings = load_settings()
    database = Database(settings.database_url)
    bot = create_bot(settings, database)
    try:
        await bot.start(settings.discord_token)
    finally:
        if not bot.is_closed():
            await bot.close()


def main() -> None:
    asyncio.run(run_bot())


if __name__ == "__main__":
    main()
