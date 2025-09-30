import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config.js';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

function buildObjectKey(fileName) {
  const baseName = path.basename(fileName).replace(/[^A-Za-z0-9._-]/g, '_');
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  return `${config.r2.objectPrefix}${unique}-${baseName}`;
}

function encodeKeyForUrl(key) {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function uploadToR2(filePath, { fileName, contentType } = {}) {
  const finalName = fileName ?? path.basename(filePath);
  const key = buildObjectKey(finalName);
  const bodyStream = createReadStream(filePath);
  const resolvedContentType = contentType ?? guessContentType(finalName) ?? 'video/mp4';
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
        Body: bodyStream,
        ContentType: resolvedContentType,
        ContentDisposition: `inline; filename="${finalName}"`,
      })
    );
  } catch (error) {
    bodyStream.destroy();
    throw error;
  }

  const publicUrl = `${config.r2.publicBaseUrl}/${encodeKeyForUrl(key)}`;
  return { key, publicUrl };
}

function guessContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    default:
      return null;
  }
}
