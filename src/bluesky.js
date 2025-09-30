import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import { finished } from 'stream/promises';
import { once } from 'node:events';
import { AtpAgent } from '@atproto/api';
import { Parser as M3U8Parser } from 'm3u8-parser';
import { config } from './config.js';

const BSKY_SERVICE = 'https://public.api.bsky.app';
const agent = new AtpAgent({ service: BSKY_SERVICE });

const BLUESKY_POST_REGEX = /https?:\/\/(?:www\.)?bsky\.app\/profile\/([^\s/]+)\/post\/([A-Za-z0-9]+)/gi;

export function extractBlueskyPostLinks(text) {
  const matches = [];
  if (!text) {
    return matches;
  }
  let match;
  while ((match = BLUESKY_POST_REGEX.exec(text)) !== null) {
    const rawUrl = match[0].replace(/[)>.,!?]+$/, '');
    matches.push({
      url: rawUrl,
      handle: match[1],
      rkey: match[2],
    });
  }
  return matches;
}

async function resolvePost(handle, rkey) {
  const { data: identity } = await agent.resolveHandle({ handle });
  const did = identity?.did;
  if (!did) {
    throw new Error(`Unable to resolve handle ${handle}`);
  }
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const { data } = await agent.api.app.bsky.feed.getPostThread({ uri });
  if (!data?.thread?.post) {
    throw new Error('Post not found or unavailable');
  }
  const post = data.thread.post;
  const embed = post.embed ?? post.record?.embed;
  const videoInfo = extractVideoInfo(embed, post.record?.embed);
  if (!videoInfo) {
    throw new Error('Post does not contain a downloadable video');
  }
  return {
    post,
    videoInfo,
    uri,
    author: post.author,
    record: post.record,
  };
}

function extractVideoInfo(viewEmbed, recordEmbed) {
  const viewInfo = extractVideoFromEmbed(viewEmbed);
  const recordInfo = extractVideoFromEmbed(recordEmbed);
  if (viewInfo && recordInfo) {
    return { ...recordInfo, ...viewInfo };
  }
  return viewInfo ?? recordInfo ?? null;
}

function extractVideoFromEmbed(embed) {
  if (!embed) return null;
  if (embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media) {
    return extractVideoFromEmbed(embed.media);
  }
  if (embed.$type === 'app.bsky.embed.video#view') {
    return {
      playlistUrl: embed.playlist,
      cid: embed.cid,
      aspectRatio: embed.aspectRatio,
      thumbnail: embed.thumbnail,
    };
  }
  if (embed.$type === 'app.bsky.embed.video' && embed.video?.ref?.$link) {
    return {
      blobCid: embed.video.ref.$link,
      mimeType: embed.video.mimeType,
      size: embed.video.size,
    };
  }
  if (embed.video) {
    return extractVideoFromEmbed(embed.video);
  }
  return null;
}

export async function fetchBlueskyVideo(postUrlOrMatch) {
  const { handle, rkey } = typeof postUrlOrMatch === 'string'
    ? parseBlueskyPostUrl(postUrlOrMatch)
    : postUrlOrMatch;
  if (!handle || !rkey) {
    throw new Error('Invalid Bluesky post URL');
  }
  const { post, videoInfo, author, record } = await resolvePost(handle, rkey);
  if (videoInfo?.size && videoInfo.size > config.maxUploadBytes) {
    throw new Error(
      `Video file is ${formatBytes(videoInfo.size)}, which exceeds the configured upload limit of ${formatBytes(config.maxUploadBytes)}.`
    );
  }
  let downloadResult;
  if (videoInfo?.playlistUrl) {
    downloadResult = await downloadFromPlaylist(videoInfo.playlistUrl);
  } else if (videoInfo?.blobCid) {
    downloadResult = await downloadFromBlob(author?.did ?? record?.author?.did, videoInfo);
  } else {
    throw new Error('No downloadable source located for this video');
  }
  return {
    ...downloadResult,
    post,
    author,
    videoInfo,
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function parseBlueskyPostUrl(url) {
  const cleaned = url.trim().replace(/[)>.,!?]+$/, '');
  const match = /^https?:\/\/(?:www\.)?bsky\.app\/profile\/([^\s/]+)\/post\/([A-Za-z0-9]+)/i.exec(cleaned);
  if (!match) {
    return {};
  }
  return { handle: match[1], rkey: match[2], url: cleaned };
}

async function downloadFromPlaylist(playlistUrl) {
  const masterContent = await fetchText(playlistUrl);
  const masterParser = new M3U8Parser();
  masterParser.push(masterContent);
  masterParser.end();
  const master = masterParser.manifest;
  if (!master.playlists?.length) {
    throw new Error('Playlist does not contain any variants');
  }
  const sorted = [...master.playlists].sort((a, b) => (b.attributes?.BANDWIDTH ?? 0) - (a.attributes?.BANDWIDTH ?? 0));
  const selected = sorted[0];
  const variantUrl = new URL(selected.uri, playlistUrl).toString();
  const variantContent = await fetchText(variantUrl);
  const variantParser = new M3U8Parser();
  variantParser.push(variantContent);
  variantParser.end();
  const { segments } = variantParser.manifest;
  if (!segments?.length) {
    throw new Error('Variant playlist is empty');
  }
  const tempDir = await prepareTempDir();
  const filePath = path.join(tempDir, 'video.mp4');
  const fileStream = createWriteStream(filePath);
  const writtenMaps = new Set();
  try {
    for (const segment of segments) {
      if (segment.map?.uri && !writtenMaps.has(segment.map.uri)) {
        const initUrl = new URL(segment.map.uri, variantUrl).toString();
        await appendRemoteFile(initUrl, fileStream, `initialization segment ${segment.map.uri}`);
        writtenMaps.add(segment.map.uri);
      }

      const segmentUrl = new URL(segment.uri, variantUrl).toString();
      await appendRemoteFile(segmentUrl, fileStream, `segment ${segment.uri}`);
    }
  } catch (error) {
    fileStream.destroy(error);
    throw error;
  }
  fileStream.end();
  await finished(fileStream);
  return { filePath, fileName: 'video.mp4', cleanupDir: tempDir };
}

async function downloadFromBlob(did, videoInfo) {
  if (!did || !videoInfo?.blobCid) {
    throw new Error('Missing blob download information');
  }
  const blobUrl = `${BSKY_SERVICE}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(videoInfo.blobCid)}`;
  const response = await fetch(blobUrl);
  if (!response.ok || !response.body) {
    throw new Error('Failed to download video blob');
  }
  const tempDir = await prepareTempDir();
  const extension = getExtensionFromMime(videoInfo.mimeType) ?? 'mp4';
  const fileName = `video.${extension}`;
  const filePath = path.join(tempDir, fileName);
  const fileStream = createWriteStream(filePath);
  try {
    for await (const chunk of response.body) {
      if (!fileStream.write(chunk)) {
        await once(fileStream, 'drain');
      }
    }
  } catch (error) {
    fileStream.destroy(error);
    throw error;
  }
  fileStream.end();
  await finished(fileStream);
  return { filePath, fileName, cleanupDir: tempDir };
}

async function appendRemoteFile(url, writable, label) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${label}`);
  }

  for await (const chunk of response.body) {
    if (!writable.write(chunk)) {
      await once(writable, 'drain');
    }
  }
}

function getExtensionFromMime(mimeType) {
  if (!mimeType) return null;
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('webm')) return 'webm';
  return null;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.text();
}

async function prepareTempDir() {
  await fs.mkdir(config.downloadRoot, { recursive: true });
  return fs.mkdtemp(path.join(config.downloadRoot, 'bsky-'));
}

export async function cleanupDownload(tempDir) {
  if (!tempDir) return;
  await fs.rm(tempDir, { recursive: true, force: true });
}
