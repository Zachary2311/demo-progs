import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import { finished } from 'stream/promises';
import { once } from 'node:events';
import { createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
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

function detectPlaylistContainer(manifest) {
  const hasInitSegments = manifest.segments?.some((segment) => segment.map?.uri);
  if (hasInitSegments) {
    return { type: 'fmp4', extension: 'mp4', mimeType: 'video/mp4' };
  }
  return { type: 'ts', extension: 'ts', mimeType: 'video/mp2t' };
}

function buildInitSegmentKey(map, resolvedRange) {
  if (!map?.uri) {
    return null;
  }
  if (!resolvedRange) {
    return map.uri;
  }
  const offsetPart = resolvedRange.offset !== undefined ? resolvedRange.offset : '';
  return `${map.uri}#${resolvedRange.length}@${offsetPart}`;
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
  const container = detectPlaylistContainer(variantParser.manifest);
  const fileName = `video.${container.extension}`;
  const filePath = path.join(tempDir, fileName);
  const fileStream = createWriteStream(filePath);
  let activeInitKey = null;
  const keyCache = new Map();
  const byteRangeState = new Map();
  const mapByteRangeState = new Map();
  const baseSequence = variantParser.manifest.mediaSequence ?? 0;
  try {
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment.discontinuity) {
        activeInitKey = null;
        byteRangeState.clear();
        mapByteRangeState.clear();
      }

      if (segment.map?.uri) {
        const initRange = resolveByteRange(segment.map.byterange, segment.map.uri, mapByteRangeState);
        const mapKey = buildInitSegmentKey(segment.map, initRange);
        if (activeInitKey !== mapKey) {
          const initUrl = new URL(segment.map.uri, variantUrl).toString();
          const initBuffer = await fetchBuffer(initUrl, `initialization segment ${segment.map.uri}`, initRange);
          await writeBufferToStream(fileStream, initBuffer);
          activeInitKey = mapKey;
        }
      }

      const segmentUrl = new URL(segment.uri, variantUrl).toString();
      const range = resolveByteRange(segment.byterange, segment.uri, byteRangeState);
      let segmentBuffer = await fetchBuffer(segmentUrl, `segment ${segment.uri}`, range);
      const keyInfo = segment.key ?? null;
      if (keyInfo && keyInfo.method && keyInfo.method !== 'NONE') {
        const method = keyInfo.method.toUpperCase();
        if (method !== 'AES-128') {
          throw new Error(`Unsupported HLS encryption method: ${keyInfo.method}`);
        }

        if (!keyInfo.uri) {
          throw new Error('HLS encryption key is missing a URI');
        }

        const keyUrl = new URL(keyInfo.uri, variantUrl).toString();
        let keyBuffer = keyCache.get(keyUrl);
        if (!keyBuffer) {
          keyBuffer = await fetchBuffer(keyUrl, `encryption key ${keyInfo.uri}`);
          if (keyBuffer.length !== 16) {
            throw new Error(`Unexpected HLS encryption key length for ${keyInfo.uri}`);
          }
          keyCache.set(keyUrl, keyBuffer);
        }

        const sequenceNumber = segment.mediaSequenceNumber ?? baseSequence + index;
        const iv = deriveInitializationVector(keyInfo.iv, sequenceNumber);
        const decipher = createDecipheriv('aes-128-cbc', keyBuffer, iv);
        segmentBuffer = Buffer.concat([decipher.update(segmentBuffer), decipher.final()]);
      }

      await writeBufferToStream(fileStream, segmentBuffer);
    }
  } catch (error) {
    fileStream.destroy(error);
    throw error;
  }
  fileStream.end();
  await finished(fileStream);
  let finalFilePath = filePath;
  let finalFileName = fileName;
  let finalMimeType = container.mimeType;

  if (container.type === 'ts') {
    const remuxed = await remuxTransportStream(tempDir, filePath, fileName);
    finalFilePath = remuxed.filePath;
    finalFileName = remuxed.fileName;
    finalMimeType = remuxed.mimeType;
  }

  return {
    filePath: finalFilePath,
    fileName: finalFileName,
    cleanupDir: tempDir,
    mimeType: finalMimeType,
  };
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
  return {
    filePath,
    fileName,
    cleanupDir: tempDir,
    mimeType: videoInfo.mimeType ?? getMimeTypeFromExtension(extension),
  };
}

function getExtensionFromMime(mimeType) {
  if (!mimeType) return null;
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('webm')) return 'webm';
  return null;
}

function getMimeTypeFromExtension(extension) {
  switch (extension) {
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'ts':
      return 'video/mp2t';
    default:
      return undefined;
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.text();
}

async function fetchBuffer(url, label, range) {
  const headers = {};
  if (range) {
    const start = range.offset ?? 0;
    const end = start + range.length - 1;
    headers.Range = `bytes=${start}-${end}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download ${label ?? url} (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function resolveByteRange(range, uri, state) {
  if (!range) {
    if (state && uri) {
      state.delete(uri);
    }
    return null;
  }

  const parsed = parseByteRange(range, uri);
  if (parsed.offset === undefined) {
    const previous = state?.get(uri) ?? 0;
    parsed.offset = previous;
  }

  if (state && uri) {
    state.set(uri, parsed.offset + parsed.length);
  }

  return parsed;
}

function parseByteRange(range, uri) {
  if (typeof range === 'string') {
    const [lengthString, offsetString] = range.split('@');
    const length = Number(lengthString);
    const offset = offsetString !== undefined ? Number(offsetString) : undefined;
    validateByteRange(length, offset, uri);
    return { length, offset };
  }

  const length = Number(range.length);
  const offset = range.offset !== undefined ? Number(range.offset) : undefined;
  validateByteRange(length, offset, uri);
  return { length, offset };
}

function validateByteRange(length, offset, uri) {
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`Invalid byte range length for ${uri ?? 'segment'}`);
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    throw new Error(`Invalid byte range offset for ${uri ?? 'segment'}`);
  }
}

async function writeBufferToStream(stream, buffer) {
  if (!stream.write(buffer)) {
    await once(stream, 'drain');
  }
}

async function remuxTransportStream(tempDir, inputFilePath, inputFileName) {
  const outputFileName = `${path.parse(inputFileName).name}.mp4`;
  const outputFilePath = path.join(tempDir, outputFileName);
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputFilePath,
    '-c',
    'copy',
    outputFilePath,
  ];

  try {
    await runFfmpeg(args);
  } catch (error) {
    await fs.rm(outputFilePath, { force: true }).catch(() => {});
    throw new Error(`Failed to convert transport stream to MP4: ${error.message}`, { cause: error });
  }

  await fs.rm(inputFilePath, { force: true }).catch(() => {});

  return {
    filePath: outputFilePath,
    fileName: outputFileName,
    mimeType: 'video/mp4',
  };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.once('error', (error) => {
      reject(error);
    });

    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = new Error(`ffmpeg exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`);
        reject(error);
      }
    });
  });
}

function deriveInitializationVector(ivString, sequenceNumber) {
  if (ivString) {
    const normalized = ivString.startsWith('0x') ? ivString.slice(2) : ivString;
    return Buffer.from(normalized.padStart(32, '0'), 'hex');
  }

  const iv = Buffer.alloc(16);
  // Use the media sequence number as the IV when none is provided, per HLS AES-128 spec.
  const normalizedSequence = Number.isFinite(sequenceNumber)
    ? Math.max(0, Math.floor(sequenceNumber))
    : 0;
  let value = BigInt(normalizedSequence);
  for (let index = 15; index >= 0 && value > 0n; index -= 1) {
    iv[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return iv;
}

async function prepareTempDir() {
  await fs.mkdir(config.downloadRoot, { recursive: true });
  return fs.mkdtemp(path.join(config.downloadRoot, 'bsky-'));
}

export async function cleanupDownload(tempDir) {
  if (!tempDir) return;
  await fs.rm(tempDir, { recursive: true, force: true });
}
