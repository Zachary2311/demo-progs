from __future__ import annotations
from pathlib import Path
from typing import Any

import aiohttp
import discord
from discord import app_commands
from discord.ext import commands

from .bluesky import BlueskyClient, BlueskyError
from .config import Settings
from .database import Database

MAX_UPLOAD_SIZE = 24 * 1024 * 1024  # 24 MiB default Discord limit for most guilds


class BlueskyCog(commands.Cog):
    """Cog responsible for reacting to Bluesky links and slash commands."""

    def __init__(
        self,
        bot: commands.Bot,
        settings: Settings,
        database: Database,
        session: aiohttp.ClientSession,
    ) -> None:
        self.bot = bot
        self.settings = settings
        self.database = database
        self._guild_cache: dict[int, bool] = {}
        self._session = session
        self._client = BlueskyClient(self._session)
        self._download_dir = Path(self.settings.data_directory) / "downloads"
        self._download_dir.mkdir(parents=True, exist_ok=True)

    async def _is_enabled(self, guild_id: int) -> bool:
        if guild_id in self._guild_cache:
            return self._guild_cache[guild_id]
        enabled = await self.database.get_guild_setting(guild_id)
        self._guild_cache[guild_id] = enabled
        return enabled

    async def _set_enabled(self, guild_id: int, enabled: bool) -> None:
        await self.database.set_guild_setting(guild_id, enabled)
        self._guild_cache[guild_id] = enabled

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot or message.guild is None:
            return
        if not await self._is_enabled(message.guild.id):
            return
        if not message.content:
            return

        matches = list(self._client.extract_links(message.content))
        if not matches:
            return

        for match in matches:
            await self._handle_download(message.channel, match.group("handle"), match.group("rkey"), reference=message)

    async def _handle_download(
        self,
        channel: discord.abc.Messageable,
        handle: str,
        rkey: str,
        *,
        reference: discord.Message | None = None,
    ) -> None:
        embed = discord.Embed(title="Bluesky Video Downloader", colour=discord.Color.blurple())
        embed.add_field(name="Status", value="Resolving post…", inline=False)
        embed.set_footer(text=f"@{handle}")
        message = await channel.send(embed=embed, reference=reference)  # type: ignore[arg-type]

        try:
            video = await self._client.resolve_post(handle, rkey)
            embed.set_field_at(0, name="Status", value="Downloading video…", inline=False)
            if video.size:
                embed.add_field(name="Size", value=f"{video.size / (1024 * 1024):.2f} MiB", inline=True)
            embed.add_field(name="MIME", value=video.mime_type, inline=True)
            await message.edit(embed=embed)

            if video.size and video.size > MAX_UPLOAD_SIZE:
                embed.set_field_at(0, name="Status", value="Video is too large to upload to Discord.", inline=False)
                await message.edit(embed=embed)
                return

            file_path = await self._client.download_video(video, self._download_dir)
            actual_size = file_path.stat().st_size
            if actual_size > MAX_UPLOAD_SIZE:
                embed.set_field_at(
                    0,
                    name="Status",
                    value="Downloaded video exceeds the Discord upload limit.",
                    inline=False,
                )
                await message.edit(embed=embed)
                return

            embed.set_field_at(0, name="Status", value="Upload in progress…", inline=False)
            await message.edit(embed=embed)

            try:
                discord_file = discord.File(str(file_path), filename=file_path.name)
                await channel.send(file=discord_file, reference=reference)  # type: ignore[arg-type]
                embed.set_field_at(0, name="Status", value="Completed", inline=False)
                await message.edit(embed=embed)
            finally:
                try:
                    file_path.unlink(missing_ok=True)
                except TypeError:  # Python < 3.8 compatibility guard (not expected)
                    if file_path.exists():
                        file_path.unlink()
        except BlueskyError as exc:
            embed.set_field_at(0, name="Status", value=f"Error: {exc}", inline=False)
            await message.edit(embed=embed)
        except discord.HTTPException as exc:
            embed.set_field_at(0, name="Status", value=f"Discord error: {exc}", inline=False)
            await message.edit(embed=embed)
        except Exception as exc:  # pragma: no cover - best effort safety net
            embed.set_field_at(0, name="Status", value=f"Unexpected error: {exc}", inline=False)
            await message.edit(embed=embed)

    @app_commands.command(name="bluesky_toggle", description="Enable or disable automatic Bluesky downloads for this server.")
    @app_commands.describe(enable="Set to true to enable or false to disable Bluesky link listening")
    async def bluesky_toggle(self, interaction: discord.Interaction, enable: bool) -> None:
        if interaction.guild_id is None:
            await interaction.response.send_message("This command can only be used in a server.", ephemeral=True)
            return
        await interaction.response.defer(thinking=True, ephemeral=True)
        await self._set_enabled(interaction.guild_id, enable)
        status = "enabled" if enable else "disabled"
        embed = discord.Embed(
            title="Bluesky Listener Updated",
            description=f"Automatic downloads are now **{status}** for this server.",
            colour=discord.Color.green() if enable else discord.Color.orange(),
        )
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="bluesky_download", description="Download a Bluesky video by URL.")
    @app_commands.describe(url="Full URL to the Bluesky post containing the video")
    async def bluesky_download(self, interaction: discord.Interaction, url: str) -> None:
        await interaction.response.defer(thinking=True)
        match = next(self._client.extract_links(url), None)
        if not match:
            embed = discord.Embed(
                title="Bluesky Download",
                description="No valid Bluesky post URL was detected.",
                colour=discord.Color.red(),
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

        channel = interaction.channel
        if channel is None:
            embed = discord.Embed(
                title="Bluesky Download",
                description="Unable to determine channel for upload.",
                colour=discord.Color.red(),
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            return

        await self._handle_download(channel, match.group("handle"), match.group("rkey"))
        embed = discord.Embed(
            title="Bluesky Download",
            description="Processing started. Check the channel for updates.",
            colour=discord.Color.blurple(),
        )
        await interaction.followup.send(embed=embed, ephemeral=True)


class BlueskyBot(commands.Bot):
    def __init__(self, settings: Settings, database: Database, **kwargs: Any) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix=commands.when_mentioned_or("!"), intents=intents, **kwargs)
        self.settings = settings
        self.database = database
        self._http_session: aiohttp.ClientSession | None = None

    async def setup_hook(self) -> None:
        await self.database.connect()
        timeout = aiohttp.ClientTimeout(total=180)
        self._http_session = aiohttp.ClientSession(timeout=timeout)
        await self.add_cog(BlueskyCog(self, self.settings, self.database, self._http_session))
        await self.tree.sync()

    async def close(self) -> None:
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()
        await self.database.close()
        await super().close()


def create_bot(settings: Settings, database: Database) -> BlueskyBot:
    return BlueskyBot(settings=settings, database=database)
