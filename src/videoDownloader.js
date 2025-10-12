import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { config, ensureDataDir } from './config.js';
import { logger } from './logger.js';
import { uploadToR2 } from './r2Client.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';

function resolveUrl(base, relative) {
  return new URL(relative, base).toString();
}

function parseByteRange(value, previousEnd = 0) {
  if (!value) return null;
  const [lengthPart, startPart] = value.split('@');
  const length = Number(lengthPart);
  if (Number.isNaN(length)) return null;
  let offset;
  if (startPart) {
    offset = Number(startPart);
  } else {
    offset = previousEnd;
  }
  return { length, offset, end: offset + length };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch JSON (${response.status})`);
  }
  return response.json();
}

function getTweetId(tweetUrl) {
  const match = tweetUrl.match(/status\/(\d+)/);
  if (!match) {
    throw new Error('Unable to determine tweet ID from URL');
  }
  return match[1];
}

function selectVariant(variants) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('No video variants found');
  }
  const sorted = [...variants].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const hlsVariant = sorted.find((variant) => variant.type?.includes('application/x-mpegURL'));
  if (hlsVariant) return hlsVariant;
  return sorted[0];
}

async function downloadFile(url, destination, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers } });
  if (!res.ok) {
    throw new Error(`Failed to download file (${res.status})`);
  }
  const fileStream = fs.createWriteStream(destination);
  await pipeline(Readable.fromWeb(res.body), fileStream);
  return destination;
}

async function appendSegmentToStream({ uri, byterange, headers = {} }, writeStream) {
  const requestHeaders = { 'User-Agent': USER_AGENT, ...headers };
  if (byterange) {
    const end = byterange.offset + byterange.length - 1;
    requestHeaders.Range = `bytes=${byterange.offset}-${end}`;
  }
  const res = await fetch(uri, { headers: requestHeaders });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Failed to download segment ${uri} (${res.status})`);
  }
  await pipeline(Readable.fromWeb(res.body), writeStream, { end: false });
}

async function downloadHlsPlaylist(playlistUrl, outBasePath) {
  logger.info(`Downloading HLS playlist: ${playlistUrl}`);
  const res = await fetch(playlistUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Failed to load playlist (${res.status})`);
  }
  const playlistText = await res.text();
  const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);

  if (/#EXT-X-STREAM-INF/.test(playlistText)) {
    let bestVariantUrl = null;
    let bestBandwidth = 0;
    const lines = playlistText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
        const bandwidth = bandwidthMatch ? Number(bandwidthMatch[1]) : 0;
        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith('#')) {
          const variantUrl = resolveUrl(baseUrl, nextLine.trim());
          if (bandwidth > bestBandwidth) {
            bestBandwidth = bandwidth;
            bestVariantUrl = variantUrl;
          }
        }
      }
    }
    if (!bestVariantUrl) {
      throw new Error('Unable to determine variant playlist');
    }
    return downloadHlsPlaylist(bestVariantUrl, outBasePath);
  }

  const tempFilePath = `${outBasePath}.tmp`;
  const writeStream = fs.createWriteStream(tempFilePath);

  let container = 'ts';
  let currentMap = null;
  let lastMapKey = null;
  let byterangeState = { nextOffset: 0 };
  const lines = playlistText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-MAP')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (!uriMatch) continue;
      const byterangeMatch = line.match(/BYTERANGE="([^"]+)"/);
      const mapUri = resolveUrl(baseUrl, uriMatch[1]);
      const mapRange = parseByteRange(byterangeMatch ? byterangeMatch[1] : null);
      currentMap = {
        uri: mapUri,
        byterange: mapRange,
        sequence: uuidv4(),
      };
      container = 'mp4';
      lastMapKey = null;
      byterangeState.nextOffset = mapRange ? mapRange.offset + mapRange.length : 0;
      continue;
    }

    if (line.startsWith('#EXT-X-DISCONTINUITY')) {
      lastMapKey = null;
      byterangeState.nextOffset = 0;
      continue;
    }

    if (line.startsWith('#EXT-X-BYTERANGE')) {
      const range = parseByteRange(line.split(':')[1], byterangeState.nextOffset);
      byterangeState.current = range;
      byterangeState.nextOffset = range ? range.offset + range.length : 0;
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    const segmentUri = resolveUrl(baseUrl, line);
    let segmentRange = null;
    if (byterangeState.current) {
      segmentRange = { ...byterangeState.current };
      byterangeState.current = null;
    } else {
      byterangeState.nextOffset = 0;
    }

    if (currentMap) {
      const mapKey = `${currentMap.uri}|${currentMap.byterange?.offset ?? 0}|${currentMap.byterange?.length ?? 0}|${currentMap.sequence}`;
      if (mapKey !== lastMapKey) {
        await appendSegmentToStream({ uri: currentMap.uri, byterange: currentMap.byterange }, writeStream);
        lastMapKey = mapKey;
      }
    }

    await appendSegmentToStream({ uri: segmentUri, byterange: segmentRange }, writeStream);
  }

  await new Promise((resolve, reject) => {
    writeStream.close((err) => (err ? reject(err) : resolve()));
  });

  let finalPath = tempFilePath;
  if (container === 'ts') {
    const tsPath = `${outBasePath}.ts`;
    await fs.promises.rename(tempFilePath, tsPath);
    const mp4Path = `${outBasePath}.mp4`;
    await convertTsToMp4(tsPath, mp4Path);
    await fs.promises.unlink(tsPath).catch(() => {});
    finalPath = mp4Path;
    container = 'mp4';
  } else {
    const mp4Path = `${outBasePath}.mp4`;
    await fs.promises.rename(tempFilePath, mp4Path);
    finalPath = mp4Path;
  }

  return { filePath: finalPath, container };
}

function convertTsToMp4(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', outputPath], {
      stdio: 'ignore',
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

async function downloadVariant(variant, tweetId) {
  ensureDataDir();
  const baseName = `${tweetId}-${Date.now()}`;
  const basePath = path.join(config.dataDir, baseName);

  if (variant.type?.includes('application/x-mpegURL')) {
    return downloadHlsPlaylist(variant.src, basePath);
  }

  const extension = variant.src.includes('.mp4') ? '.mp4' : path.extname(new URL(variant.src).pathname) || '.mp4';
  const filePath = `${basePath}${extension}`;
  await downloadFile(variant.src, filePath);
  return { filePath, container: extension.replace('.', '') };
}

export async function downloadTweetVideo(tweetUrl) {
  const id = getTweetId(tweetUrl);
  const data = await fetchJson(`https://cdn.syndication.twimg.com/widgets/tweet?id=${id}`);
  if (!data?.videoVariants) {
    throw new Error('Tweet does not contain downloadable video');
  }
  const variant = selectVariant(data.videoVariants);
  const download = await downloadVariant(variant, id);
  const stats = await fs.promises.stat(download.filePath);
  return {
    tweetId: id,
    title: data.title || `Tweet ${id}`,
    authorName: data.author?.name,
    authorScreenName: data.author?.screenName,
    videoUrl: variant.src,
    localPath: download.filePath,
    size: stats.size,
    container: download.container,
  };
}

export async function uploadVideoToR2(localPath, keyHint) {
  const key = `${keyHint}/${path.basename(localPath)}`;
  const fileStream = fs.createReadStream(localPath);
  const publicUrl = await uploadToR2(key, fileStream, 'video/mp4');
  return publicUrl;
}
