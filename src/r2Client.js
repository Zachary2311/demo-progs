import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config.js';

const client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

export async function uploadToR2(key, fileStream, contentType) {
  const command = new PutObjectCommand({
    Bucket: config.r2.bucket,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  });
  await client.send(command);
  return `${config.r2.publicBaseUrl}/${encodeURI(key)}`;
}
