from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    """Application configuration sourced from environment variables."""

    discord_token: str
    database_url: str
    data_directory: str


def load_settings() -> Settings:
    """Load environment variables and return a :class:`Settings` instance."""

    load_dotenv()

    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise RuntimeError("DISCORD_TOKEN is not set in the environment")

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in the environment")

    data_directory = os.getenv("DATA_DIRECTORY", os.path.join(os.getcwd(), "data"))
    os.makedirs(data_directory, exist_ok=True)

    return Settings(
        discord_token=token,
        database_url=database_url,
        data_directory=data_directory,
    )
