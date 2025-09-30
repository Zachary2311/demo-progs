from __future__ import annotations

import asyncio
import contextlib
import os
import re
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import aiohttp

BLUESKY_POST_REGEX = re.compile(
    r"https?://bsky\.app/profile/(?P<handle>[^/]+)/post/(?P<rkey>[A-Za-z0-9_-]+)(?:\?[^\s]*)?",
    re.IGNORECASE,
)

PUBLIC_API_BASE = "https://public.api.bsky.app/xrpc"
CDN_BASE = "https://cdn.bsky.app/blob"


class BlueskyError(Exception):
    """Base error raised for Bluesky download issues."""


@dataclass
class BlueskyVideo:
    uri: str
    cid: str
    mime_type: str
    size: int | None
    filename: str


class BlueskyClient:
    """Utility class for fetching video data from Bluesky posts."""

    def __init__(self, session: aiohttp.ClientSession) -> None:
        self._session = session

    @staticmethod
    def extract_links(content: str) -> Iterable[re.Match[str]]:
        return BLUESKY_POST_REGEX.finditer(content)

    async def resolve_post(self, handle: str, rkey: str) -> BlueskyVideo:
        did = await self._resolve_handle(handle)
        uri = f"at://{did}/app.bsky.feed.post/{rkey}"
        post = await self._get_post(uri)
        embed = post.get("embed")
        if not embed:
            raise BlueskyError("Post does not contain any media embed")

        video_info = self._find_video_embed(embed)
        if video_info is None:
            raise BlueskyError("No downloadable video was found in the post")

        ref = video_info.get("ref", {})
        cid = ref.get("$link")
        if not cid:
            raise BlueskyError("Unable to locate the video blob reference for this post")
        mime_type = video_info.get("mimeType", "application/octet-stream")
        size = video_info.get("size")
        filename = self._guess_filename(post, mime_type)

        return BlueskyVideo(uri=uri, cid=cid, mime_type=mime_type, size=size, filename=filename)

    async def download_video(self, video: BlueskyVideo, destination_dir: Path) -> Path:
        destination_dir.mkdir(parents=True, exist_ok=True)
        timestamp = int(time.time())
        safe_name = re.sub(r"[^A-Za-z0-9_.-]", "_", video.filename)
        target_path = destination_dir / f"{timestamp}_{safe_name}"

        url = f"{CDN_BASE}/{video.cid}"
        async with self._session.get(url) as response:
            if response.status != 200:
                raise BlueskyError(f"Failed to download video (HTTP {response.status})")

            tmp_fd, tmp_path = tempfile.mkstemp(dir=destination_dir, suffix=".part")
            os.close(tmp_fd)

            try:
                with open(tmp_path, "wb") as file:
                    async for chunk in response.content.iter_chunked(1 << 14):
                        if not chunk:
                            continue
                        await asyncio.to_thread(file.write, chunk)
                os.replace(tmp_path, target_path)
            except Exception:
                with contextlib.suppress(FileNotFoundError):
                    os.remove(tmp_path)
                raise

        return target_path

    async def _resolve_handle(self, handle: str) -> str:
        params = {"handle": handle}
        async with self._session.get(f"{PUBLIC_API_BASE}/com.atproto.identity.resolveHandle", params=params) as resp:
            if resp.status != 200:
                raise BlueskyError(f"Failed to resolve handle '{handle}' (HTTP {resp.status})")
            data = await resp.json()
            return data["did"]

    async def _get_post(self, uri: str) -> dict:
        params = {"uri": uri}
        async with self._session.get(f"{PUBLIC_API_BASE}/app.bsky.feed.getPostThread", params=params) as resp:
            if resp.status != 200:
                raise BlueskyError(f"Failed to fetch post (HTTP {resp.status})")
            data = await resp.json()

        thread = data.get("thread")
        if not thread:
            raise BlueskyError("Unexpected response from Bluesky API")
        post = thread.get("post") or thread
        return post

    def _find_video_embed(self, embed: dict) -> dict | None:
        embed_type = embed.get("$type")
        if embed_type == "app.bsky.embed.recordWithMedia#view":
            media = embed.get("media") or {}
            return self._find_video_embed(media)  # type: ignore[return-value]
        if embed_type in {"app.bsky.embed.video#view", "app.bsky.embed.video"}:
            video = embed.get("video") or {}
            if "ref" in video and "$link" in video["ref"]:
                return video
        if embed_type == "app.bsky.embed.record#view":
            record = embed.get("record") or {}
            media = record.get("embeds")
            if isinstance(media, list):
                for child in media:
                    found = self._find_video_embed(child)
                    if found:
                        return found
        return None

    def _guess_filename(self, post: dict, mime_type: str) -> str:
        base = "bluesky-video"
        author = post.get("author", {}).get("handle")
        if author:
            base = f"{author}-video"
        extension = self._mime_to_extension(mime_type)
        return f"{base}{extension}"

    @staticmethod
    def _mime_to_extension(mime_type: str) -> str:
        if mime_type == "video/mp4":
            return ".mp4"
        if mime_type == "video/webm":
            return ".webm"
        if mime_type == "video/quicktime":
            return ".mov"
        return ""
