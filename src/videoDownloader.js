import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { config, ensureDataDir, hasTwitterUserAuth } from './config.js';
import { logger } from './logger.js';
import { uploadToR2 } from './r2Client.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';

const GRAPHQL_TWEET_RESULT_QUERY_ID = 'WvlrBJ2bz8AuwoszWyie8A';
const GRAPHQL_TWEET_RESULT_FEATURES = {
  creator_subscriptions_tweet_preview_api_enabled: true,
  premium_content_api_read_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: true,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  creator_subscriptions_quote_tweet_preview_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  payments_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_enhance_cards_enabled: true,
};

const GRAPHQL_TWEET_RESULT_FIELD_TOGGLES = {
  withArticleRichContentState: true,
  withArticlePlainText: true,
  withGrokAnalyze: true,
  withDisallowedReplyControls: true,
  withAuxiliaryUserLabels: true,
};

let cachedGuestToken = null;
let cachedGuestTokenExpiry = 0;

function isGatedTombstone(reasonType, reasonText) {
  const normalizedType = reasonType ? String(reasonType).toLowerCase() : '';
  if (normalizedType.includes('agegate') || normalizedType.includes('age_gated')) {
    return true;
  }
  if (normalizedType.includes('protected') || normalizedType.includes('restricted')) {
    return true;
  }

  const normalizedText = reasonText ? reasonText.toLowerCase() : '';
  return [
    'age-restricted',
    'log in to view',
    'login to view',
    'view this media',
    'isn\'t available to people under',
  ].some((phrase) => normalizedText.includes(phrase));
}

function extractTombstoneMessage(result) {
  const candidates = [
    result.tombstone?.text?.text,
    result.reason?.text?.text,
    result.reason?.message,
    result.reason?.text,
    result.reason?.subtitle?.text,
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (typeof value === 'string') return value;
    if (typeof value?.text === 'string') return value.text;
  }
  return 'Tweet is unavailable (possibly age-restricted or deleted)';
}

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

async function getGuestToken() {
  const now = Date.now();
  if (cachedGuestToken && cachedGuestTokenExpiry > now) {
    return cachedGuestToken;
  }

  const response = await fetch('https://api.twitter.com/1.1/guest/activate.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.twitterBearerToken}`,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to activate guest token (${response.status})`);
  }

  const payload = await response.json();
  if (!payload?.guest_token) {
    throw new Error('Guest token response did not include a token');
  }

  cachedGuestToken = payload.guest_token;
  cachedGuestTokenExpiry = now + 10 * 60 * 1000; // 10 minutes cache window
  return cachedGuestToken;
}

function unwrapTweetNode(node) {
  let current = node;
  const visited = new Set();
  while (current && !current.legacy) {
    if (visited.has(current)) break;
    visited.add(current);
    if (current.result) {
      current = current.result;
      continue;
    }
    if (current.tweet) {
      current = current.tweet;
      continue;
    }
    if (current.tweet_results?.result) {
      current = current.tweet_results.result;
      continue;
    }
    break;
  }
  return current;
}

function unwrapUserNode(node) {
  let current = node;
  const visited = new Set();
  while (current && !current.legacy) {
    if (visited.has(current)) break;
    visited.add(current);
    if (current.result) {
      current = current.result;
      continue;
    }
    if (current.user_results?.result) {
      current = current.user_results.result;
      continue;
    }
    break;
  }
  return current;
}

function normalizeLegacyTweet(legacyTweet, userInfo) {
  if (!legacyTweet) {
    return null;
  }

  const mediaItems = legacyTweet.extended_entities?.media || [];
  const normalizedMedia = mediaItems.map((media) => ({
    type: media.type,
    variants:
      media.video_info?.variants
        ?.filter((variant) => Boolean(variant.url))
        .map((variant) => ({
          src: variant.url,
          bitrate: variant.bitrate,
          content_type: variant.content_type,
          type: variant.content_type,
        })) || [],
  }));

  const variants = normalizedMedia.flatMap((media) => media.variants);

  return {
    id: legacyTweet.id_str,
    title: legacyTweet.full_text || legacyTweet.text,
    author: {
      name: userInfo?.name,
      screenName: userInfo?.screen_name,
    },
    videoVariants: variants,
    mediaDetails: normalizedMedia,
    extended_entities: {
      media: mediaItems.map((media, index) => ({
        type: media.type,
        video_info: media.video_info,
        variants: normalizedMedia[index]?.variants,
      })),
    },
  };
}

function normalizeGraphqlTweet(tweetResult) {
  const tweetNode = unwrapTweetNode(tweetResult);
  if (!tweetNode?.legacy) {
    return null;
  }

  const userNode = unwrapUserNode(tweetNode.core?.user_results?.result);
  return normalizeLegacyTweet(tweetNode.legacy, userNode?.legacy || userNode);
}

async function fetchTweetViaGraphql(tweetId, { useUserAuth = false, allowRetryWithUserAuth = true } = {}) {
  if (!config.twitterBearerToken) {
    throw new Error('Twitter bearer token is not configured');
  }

  const searchParams = new URLSearchParams({
    variables: JSON.stringify({
      tweetId,
      withCommunity: true,
      includePromotedContent: false,
      withVoice: true,
    }),
    features: JSON.stringify(GRAPHQL_TWEET_RESULT_FEATURES),
    fieldToggles: JSON.stringify(GRAPHQL_TWEET_RESULT_FIELD_TOGGLES),
  });

  const url = `https://twitter.com/i/api/graphql/${GRAPHQL_TWEET_RESULT_QUERY_ID}/TweetResultByRestId?${searchParams.toString()}`;
  const headers = {
    Authorization: `Bearer ${config.twitterBearerToken}`,
    'User-Agent': USER_AGENT,
    'x-twitter-client-language': 'en',
    'x-twitter-active-user': 'yes',
    Accept: 'application/json',
    Referer: 'https://twitter.com/',
  };

  if (useUserAuth) {
    if (!hasTwitterUserAuth()) {
      throw new Error('Twitter user authentication is not configured');
    }
    headers.Cookie = `auth_token=${config.twitterAuthToken}; ct0=${config.twitterCsrfToken}`;
    headers['x-csrf-token'] = config.twitterCsrfToken;
  } else {
    try {
      const guestToken = await getGuestToken();
      headers['x-guest-token'] = guestToken;
    } catch (error) {
      if (allowRetryWithUserAuth && hasTwitterUserAuth()) {
        logger.info(
          `Guest token activation failed (${error.message}); retrying GraphQL with user authentication for tweet ${tweetId}`,
        );
        return fetchTweetViaGraphql(tweetId, { useUserAuth: true, allowRetryWithUserAuth: false });
      }
      throw error;
    }
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (!useUserAuth && allowRetryWithUserAuth && response.status === 403 && hasTwitterUserAuth()) {
      logger.info(
        `GraphQL guest request blocked with status ${response.status}; retrying with user authentication for tweet ${tweetId}`,
      );
      return fetchTweetViaGraphql(tweetId, { useUserAuth: true, allowRetryWithUserAuth: false });
    }
    throw new Error(`GraphQL tweet lookup failed (${response.status})`);
  }

  const payload = await response.json();
  const result = payload?.data?.tweetResult?.result;
  if (!result) {
    throw new Error('Tweet metadata not returned from GraphQL');
  }

  if (result.__typename && result.__typename.includes('Tombstone')) {
    const reasonType = result.reason?.__typename || result.tombstone?.text?.__typename || '';
    const message = extractTombstoneMessage(result);
    if (!useUserAuth && allowRetryWithUserAuth && hasTwitterUserAuth() && isGatedTombstone(reasonType, message)) {
      logger.info(
        `GraphQL metadata indicates gated content (${reasonType || 'unknown reason'}); retrying with user authentication for tweet ${tweetId}`,
      );
      return fetchTweetViaGraphql(tweetId, { useUserAuth: true, allowRetryWithUserAuth: false });
    }
    throw new Error(message);
  }

  const normalized = normalizeGraphqlTweet(result);
  if (!normalized || !Array.isArray(normalized.videoVariants) || !normalized.videoVariants.length) {
    throw new Error('Tweet does not contain downloadable media');
  }

  return normalized;
}

async function fetchTweetViaRestApi(tweetId) {
  if (!hasTwitterUserAuth()) {
    throw new Error('Twitter user authentication is not configured');
  }

  if (!config.twitterBearerToken) {
    throw new Error('Twitter bearer token is not configured');
  }

  const params = new URLSearchParams({
    id: tweetId,
    tweet_mode: 'extended',
    include_entities: 'true',
    include_ext_alt_text: 'true',
  });

  const url = `https://twitter.com/i/api/1.1/statuses/show.json?${params.toString()}`;
  const headers = {
    Authorization: `Bearer ${config.twitterBearerToken}`,
    'User-Agent': USER_AGENT,
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en',
    Cookie: `auth_token=${config.twitterAuthToken}; ct0=${config.twitterCsrfToken}`,
    'x-csrf-token': config.twitterCsrfToken,
    Accept: 'application/json',
    Referer: 'https://twitter.com/',
  };

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Authenticated REST tweet lookup failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload?.errors?.length) {
    const [firstError] = payload.errors;
    throw new Error(firstError?.message || 'Twitter API returned an unknown error');
  }

  const normalized = normalizeLegacyTweet(payload, payload?.user);
  if (!normalized || !Array.isArray(normalized.videoVariants) || !normalized.videoVariants.length) {
    throw new Error('Tweet does not contain downloadable media');
  }

  return normalized;
}

async function fetchJson(url, { parser = (res) => res.json(), headers = {} } = {}) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      Referer: 'https://platform.twitter.com/',
      'Accept-Language': 'en-US,en;q=0.9',
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch JSON (${response.status})`);
  }
  return parser(response);
}

async function fetchTweetMetadata(tweetId) {
  const endpoints = [
    {
      url: `https://cdn.syndication.twimg.com/widgets/tweet?id=${tweetId}&lang=en`,
      parser: (res) => res.json(),
    },
    {
      url: `https://r.jina.ai/https://cdn.syndication.twimg.com/widgets/tweet?id=${tweetId}&lang=en`,
      parser: async (res) => JSON.parse(await res.text()),
    },
    {
      url: `https://r.jina.ai/https://cdn.syndication.twimg.com/tweet?id=${tweetId}&lang=en`,
      parser: async (res) => JSON.parse(await res.text()),
    },
  ];

  let lastError;
  const hasVariants = (payload) =>
    Array.isArray(payload?.videoVariants) ||
    Array.isArray(payload?.mediaDetails) ||
    Array.isArray(payload?.extended_entities?.media);

  for (const endpoint of endpoints) {
    try {
      const data = await fetchJson(endpoint.url, { parser: endpoint.parser });
      if (data && hasVariants(data)) {
        return data;
      }
      lastError = new Error('No video variants found in response payload');
      logger.warn(`No video variants present in response from ${endpoint.url}`);
    } catch (error) {
      lastError = error;
      logger.warn(`Failed to load tweet metadata from ${endpoint.url}: ${error.message}`);
    }
  }

  try {
    logger.info(`Falling back to GraphQL metadata for tweet ${tweetId}`);
    return await fetchTweetViaGraphql(tweetId);
  } catch (error) {
    lastError = error;
    logger.warn(`GraphQL metadata fallback failed: ${error.message}`);
    if (hasTwitterUserAuth()) {
      try {
        logger.info(`Attempting authenticated REST metadata for tweet ${tweetId}`);
        return await fetchTweetViaRestApi(tweetId);
      } catch (restError) {
        lastError = restError;
        logger.warn(`Authenticated REST metadata fallback failed: ${restError.message}`);
      }
    }
  }

  const reason = lastError?.message || 'No video variants found in tweet metadata';
  if (isGatedTombstone('', reason) && !hasTwitterUserAuth()) {
    throw new Error(
      `Unable to retrieve tweet metadata: ${reason}. Provide TWITTER_AUTH_TOKEN and TWITTER_CT0 to allow the bot to access gated tweets.`,
    );
  }
  throw new Error(`Unable to retrieve tweet metadata: ${reason}`);
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
  const data = await fetchTweetMetadata(id);
  let variants = Array.isArray(data.videoVariants) ? data.videoVariants : null;
  if (!variants && Array.isArray(data.mediaDetails)) {
    const videoDetail = data.mediaDetails.find((detail) => Array.isArray(detail.variants));
    if (videoDetail) {
      variants = videoDetail.variants;
    }
  }
  if (!variants && Array.isArray(data.extended_entities?.media)) {
    const media = data.extended_entities.media.find((item) => item.type === 'video' || item.type === 'animated_gif');
    if (media?.video_info?.variants) {
      variants = media.video_info.variants.map((variant) => ({
        content_type: variant.content_type,
        bitrate: variant.bitrate,
        src: variant.url,
        type: variant.content_type,
      }));
    }
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('Tweet does not contain downloadable video');
  }

  const variant = selectVariant(variants);
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
