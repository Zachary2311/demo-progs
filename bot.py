from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path
from typing import Optional

import aiohttp
import discord
from discord import app_commands
from discord.ext import commands
from dotenv import load_dotenv

from bluesky import (
    BLUESKY_POST_RE,
    BlueskyDownloadError,
    BlueskyDownloader,
    BlueskyPost,
    get_data_directory,
)
from database import GuildSettingsRepository

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_DISCORD_UPLOAD = 25 * 1024 * 1024  # 25 MB for most bots

_group_channel_type = getattr(discord, "GroupChannel", None)
DESTINATION_TYPES: tuple[type, ...] = (
    discord.TextChannel,
    discord.Thread,
    discord.DMChannel,
) + ((_group_channel_type,) if _group_channel_type else ())


class BlueskyBot(commands.Bot):
    def __init__(self, database_url: str) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix=commands.when_mentioned_or("!"), intents=intents)

        self.database_url = database_url
        self.http_session: Optional[aiohttp.ClientSession] = None
        self.downloader: Optional[BlueskyDownloader] = None
        self.guild_repo: Optional[GuildSettingsRepository] = None
        self.data_dir: Path = get_data_directory()

    async def setup_hook(self) -> None:
        timeout = aiohttp.ClientTimeout(total=None, connect=10)
        connector = aiohttp.TCPConnector(limit=10)
        self.http_session = aiohttp.ClientSession(timeout=timeout, connector=connector)
        self.downloader = BlueskyDownloader(self.http_session, self.data_dir)
        self.guild_repo = await GuildSettingsRepository.create(self.database_url)
        self.tree.add_command(bluesky_group)
        await self.tree.sync()

    async def on_ready(self) -> None:
        logger.info("Logged in as %s (ID: %s)", self.user, self.user and self.user.id)

    async def close(self) -> None:
        if self.downloader:
            self.downloader = None
        if self.http_session and not self.http_session.closed:
            await self.http_session.close()
        if self.guild_repo:
            await self.guild_repo.close()
        await super().close()

    async def on_message(self, message: discord.Message) -> None:
        await self.process_commands(message)

        if message.author.bot or not message.guild:
            return

        if not self.guild_repo or not self.downloader:
            return

        if not await self.guild_repo.get_listening(message.guild.id):
            return

        urls = [match.group(0) for match in BLUESKY_POST_RE.finditer(message.content or "")]
        if not urls:
            return

        await self._handle_links(message.channel, urls[:1])  # limit to first link per message

    async def _handle_links(self, channel: discord.abc.Messageable, urls: list[str]) -> None:
        if not self.downloader:
            return

        for url in urls:
            try:
                post = await self.downloader.resolve_post(url)
                video_path = await self.downloader.download_post_video(post)
                await self._send_video(channel, post, video_path)
            except BlueskyDownloadError as exc:
                await channel.send(f"⚠️ Unable to download video: {exc}")
            except Exception:
                logger.exception("Unexpected failure while processing Bluesky link")
                await channel.send("⚠️ Something went wrong while downloading that Bluesky video.")

    async def _send_video(
        self,
        destination: discord.abc.Messageable,
        post: BlueskyPost,
        video_path: Path,
    ) -> bool:
        if not isinstance(destination, DESTINATION_TYPES):
            await self._cleanup(video_path)
            return False

        guild_limit = (
            getattr(destination.guild, "filesize_limit", MAX_DISCORD_UPLOAD)
            if getattr(destination, "guild", None)
            else MAX_DISCORD_UPLOAD
        )
        limit = min(MAX_DISCORD_UPLOAD, guild_limit)

        size = video_path.stat().st_size
        if size > limit:
            await destination.send(
                "⚠️ The downloaded video is larger than this server allows for bot uploads."
            )
            await self._cleanup(video_path)
            return False

        filename = video_path.name
        embed = discord.Embed(title="Bluesky Video", colour=discord.Colour.blue())
        embed.description = post.text or "(no caption)"
        author_line = f"{post.display_name} (@{post.handle})" if post.display_name else f"@{post.handle}"
        embed.set_author(name=author_line)
        if post.uri:
            rkey = post.uri.rsplit("/", 1)[-1]
            embed.url = f"https://bsky.app/profile/{post.handle}/post/{rkey}"
        if post.thumbnail_url:
            embed.set_thumbnail(url=post.thumbnail_url)

        file = discord.File(video_path, filename=filename)
        try:
            await destination.send(embed=embed, file=file)
            return True
        finally:
            await self._cleanup(video_path)

    async def _cleanup(self, video_path: Path) -> None:
        try:
            await asyncio.to_thread(shutil.rmtree, video_path.parent)
        except FileNotFoundError:
            pass
        except Exception:
            logger.warning("Failed to clean up %s", video_path, exc_info=True)


bluesky_group = app_commands.Group(name="bluesky", description="Bluesky video tools")


@bluesky_group.command(name="fetch", description="Download and upload a Bluesky video")
@app_commands.describe(url="Link to a Bluesky post containing a video")
async def fetch_command(interaction: discord.Interaction, url: str) -> None:
    bot = interaction.client
    if not isinstance(bot, BlueskyBot) or not bot.downloader:
        await interaction.response.send_message("Bot is still starting up.", ephemeral=True)
        return

    await interaction.response.defer(thinking=True)
    try:
        post = await bot.downloader.resolve_post(url)
        video_path = await bot.downloader.download_post_video(post)
    except BlueskyDownloadError as exc:
        await interaction.followup.send(f"⚠️ Unable to download video: {exc}", ephemeral=True)
        return
    except Exception:
        logger.exception("Unexpected failure in /bluesky fetch")
        await interaction.followup.send("⚠️ Something went wrong while downloading that Bluesky video.", ephemeral=True)
        return

    destination = interaction.channel
    if destination is None:
        await interaction.followup.send("⚠️ Cannot determine the target channel for the upload.", ephemeral=True)
        await bot._cleanup(video_path)
        return

    success = await bot._send_video(destination, post, video_path)
    if success:
        await interaction.followup.send("✅ Uploaded the Bluesky video.", ephemeral=True)
    else:
        await interaction.followup.send(
            "⚠️ Unable to upload the video in this channel.", ephemeral=True
        )


@bluesky_group.command(name="listen", description="Enable or disable automatic Bluesky link handling")
@app_commands.describe(enabled="Whether to auto-download Bluesky links in this server")
async def listen_command(interaction: discord.Interaction, enabled: bool) -> None:
    bot = interaction.client
    if not isinstance(bot, BlueskyBot) or not bot.guild_repo:
        await interaction.response.send_message("Bot is still starting up.", ephemeral=True)
        return

    if not interaction.guild:
        await interaction.response.send_message("This command can only be used in a server.", ephemeral=True)
        return

    await bot.guild_repo.set_listening(interaction.guild.id, enabled)
    status = "enabled" if enabled else "disabled"
    await interaction.response.send_message(
        f"✅ Auto-download of Bluesky links has been {status} for this server.", ephemeral=True
    )


def main() -> None:
    load_dotenv()

    token = os.getenv("DISCORD_TOKEN")
    database_url = os.getenv("DATABASE_URL")

    if not token:
        raise RuntimeError("DISCORD_TOKEN is required in the environment.")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required in the environment.")

    bot = BlueskyBot(database_url)
    bot.run(token)


if __name__ == "__main__":
    main()
