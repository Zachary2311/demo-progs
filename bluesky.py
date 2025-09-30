from __future__ import annotations

import asyncio
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import aiohttp
import m3u8

BLUESKY_POST_RE = re.compile(
    r"https?://(?:www\.)?bsky\.app/profile/(?P<handle>[^/]+)/post/(?P<rkey>[A-Za-z0-9]+)",
    re.IGNORECASE,
)

logger = logging.getLogger(__name__)


@dataclass
class BlueskyPost:
    uri: str
    handle: str
    display_name: Optional[str]
    text: str
    playlist_url: str
    thumbnail_url: Optional[str]


class BlueskyDownloadError(Exception):
    """Raised when we cannot download video content from a Bluesky post."""


class BlueskyDownloader:
    def __init__(self, session: aiohttp.ClientSession, data_dir: Path, *, concurrency: int = 1) -> None:
        self._session = session
        self._data_dir = data_dir
        self._semaphore = asyncio.Semaphore(concurrency)
        self._data_dir.mkdir(parents=True, exist_ok=True)

    async def resolve_post(self, url: str) -> BlueskyPost:
        match = BLUESKY_POST_RE.search(url)
        if not match:
            raise BlueskyDownloadError("The provided link does not look like a Bluesky post URL.")

        handle = match.group("handle")
        rkey = match.group("rkey")

        did = await self._fetch_did(handle)
        post_payload = await self._fetch_post(did, rkey)

        embed = post_payload.get("embed") or {}
        embed_type = embed.get("$type")
        if embed_type not in {"app.bsky.embed.video#view", "app.bsky.embed.video"}:
            raise BlueskyDownloadError("The post does not contain downloadable video content.")

        playlist = embed.get("playlist")
        if not playlist:
            raise BlueskyDownloadError("The video embed does not expose a playlist URL.")

        author = post_payload.get("author") or {}
        display_name = author.get("displayName")
        text = (post_payload.get("record") or {}).get("text", "")
        uri = post_payload.get("uri", "")

        return BlueskyPost(
            uri=uri,
            handle=author.get("handle") or handle,
            display_name=display_name,
            text=text,
            playlist_url=playlist,
            thumbnail_url=embed.get("thumbnail"),
        )

    async def download_post_video(self, post: BlueskyPost) -> Path:
        """Download the video's highest-quality stream to the data directory."""

        async with self._semaphore:
            target_dir = self._data_dir / self._safe_stem(post)
            target_dir.mkdir(parents=True, exist_ok=True)
            temp_path = target_dir / "video.ts"
            final_path = target_dir / "video.mp4"

            logger.debug("Downloading playlist %s", post.playlist_url)
            master_playlist = await self._load_m3u8(post.playlist_url)
            playlist_url = self._choose_variant(master_playlist, post.playlist_url)

            await self._download_hls_stream(playlist_url, temp_path)

            # Many Discord clients accept TS containers when labelled mp4.
            if temp_path.exists():
                temp_path.rename(final_path)

            return final_path

    async def _fetch_did(self, handle: str) -> str:
        url = "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile"
        params = {"actor": handle}
        async with self._session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=20)) as resp:
            if resp.status != 200:
                raise BlueskyDownloadError(f"Failed to resolve handle '{handle}' (status {resp.status}).")
            payload = await resp.json()
            did = payload.get("did")
            if not did:
                raise BlueskyDownloadError("Profile lookup response did not contain a DID.")
            return did

    async def _fetch_post(self, did: str, rkey: str) -> dict:
        uri = f"at://{did}/app.bsky.feed.post/{rkey}"
        url = "https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts"
        params = {"uris": uri}
        async with self._session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=20)) as resp:
            if resp.status != 200:
                raise BlueskyDownloadError(f"Failed to fetch post data (status {resp.status}).")
            payload = await resp.json()
            posts = payload.get("posts") or []
            if not posts:
                raise BlueskyDownloadError("The requested post could not be found.")
            return posts[0]

    async def _load_m3u8(self, playlist_url: str) -> m3u8.M3U8:
        async with self._session.get(playlist_url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                raise BlueskyDownloadError(f"Unable to fetch playlist (status {resp.status}).")
            text = await resp.text()
        return m3u8.loads(text)

    def _choose_variant(self, playlist: m3u8.M3U8, base_url: str) -> str:
        if playlist.is_variant:
            # Choose the highest bandwidth variant
            best = max(playlist.playlists, key=lambda p: p.stream_info.bandwidth or 0)
            uri = best.uri
        else:
            uri = playlist.uri or base_url

        if uri.startswith("http://") or uri.startswith("https://"):
            return uri

        # Build absolute URL
        from urllib.parse import urljoin

        return urljoin(base_url, uri)

    async def _download_hls_stream(self, playlist_url: str, target_file: Path) -> None:
        playlist = await self._load_m3u8(playlist_url)
        if not playlist.segments:
            raise BlueskyDownloadError("The variant playlist did not contain any segments.")

        logger.debug("Writing %s", target_file)
        with target_file.open("wb") as file_handle:
            for segment in playlist.segments:
                segment_url = self._absolute_segment_url(segment.uri, playlist_url)
                await self._stream_segment(self._session, segment_url, file_handle)

    async def _stream_segment(self, session: aiohttp.ClientSession, segment_url: str, file_handle) -> None:
        async with session.get(segment_url) as resp:
            if resp.status != 200:
                raise BlueskyDownloadError(f"Failed to fetch segment: {segment_url}")
            async for chunk in resp.content.iter_chunked(1024 * 128):
                file_handle.write(chunk)
                await asyncio.sleep(0)

    def _absolute_segment_url(self, segment_uri: str, base_url: str) -> str:
        from urllib.parse import urljoin

        return urljoin(base_url, segment_uri)

    def _safe_stem(self, post: BlueskyPost) -> str:
        stem = f"{post.handle}-{abs(hash(post.uri))}"
        return re.sub(r"[^A-Za-z0-9_.-]", "_", stem)


def get_data_directory() -> Path:
    override = os.getenv("BOT_DATA_DIR")
    base = Path(override) if override else Path("data")
    base.mkdir(parents=True, exist_ok=True)
    return base
