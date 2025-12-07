import type { Env, FileRecord } from '../types';
import { generateId } from './auth';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
];

interface UploadResult {
  success: boolean;
  file?: FileRecord;
  error?: string;
}

// Validate file before upload
export function validateFile(file: { size: number; type: string }): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit` };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `File type ${file.type} is not allowed` };
  }

  return { valid: true };
}

// Upload file to R2
export async function uploadFile(
  env: Env,
  userId: string,
  filename: string,
  mimeType: string,
  data: ArrayBuffer,
  messageId?: string
): Promise<UploadResult> {
  const validation = validateFile({ size: data.byteLength, type: mimeType });
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const id = generateId();
  const timestamp = Date.now();
  const ext = filename.split('.').pop() || '';
  const r2Key = `uploads/${userId}/${timestamp}-${id}.${ext}`;

  try {
    // Upload to R2
    await env.R2.put(r2Key, data, {
      httpMetadata: {
        contentType: mimeType,
      },
      customMetadata: {
        userId,
        originalFilename: filename,
      },
    });

    // Save to D1
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO files (id, user_id, message_id, filename, mime_type, size, r2_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, messageId || null, filename, mimeType, data.byteLength, r2Key, now).run();

    const file: FileRecord = {
      id,
      user_id: userId,
      message_id: messageId || null,
      filename,
      mime_type: mimeType,
      size: data.byteLength,
      r2_key: r2Key,
      created_at: now,
    };

    return { success: true, file };
  } catch (error) {
    console.error('File upload error:', error);
    return { success: false, error: 'Failed to upload file' };
  }
}

// Get file from R2
export async function getFile(env: Env, r2Key: string): Promise<R2ObjectBody | null> {
  return env.R2.get(r2Key);
}

// Delete file from R2 and D1
export async function deleteFile(env: Env, fileId: string, userId: string): Promise<boolean> {
  try {
    // Get file record
    const file = await env.DB.prepare(
      'SELECT r2_key FROM files WHERE id = ? AND user_id = ?'
    ).bind(fileId, userId).first<{ r2_key: string }>();

    if (!file) {
      return false;
    }

    // Delete from R2
    await env.R2.delete(file.r2_key);

    // Delete from D1
    await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileId).run();

    return true;
  } catch (error) {
    console.error('File delete error:', error);
    return false;
  }
}

// List files for a user
export async function listUserFiles(
  env: Env,
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<FileRecord[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(userId, limit, offset).all<FileRecord>();

  return result.results || [];
}

// List all files (admin)
export async function listAllFiles(
  env: Env,
  limit: number = 50,
  offset: number = 0
): Promise<FileRecord[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM files ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all<FileRecord>();

  return result.results || [];
}

// Get file count
export async function getFileCount(env: Env, userId?: string): Promise<number> {
  const query = userId
    ? 'SELECT COUNT(*) as count FROM files WHERE user_id = ?'
    : 'SELECT COUNT(*) as count FROM files';
  
  const result = userId
    ? await env.DB.prepare(query).bind(userId).first<{ count: number }>()
    : await env.DB.prepare(query).first<{ count: number }>();

  return result?.count || 0;
}

// Generate presigned URL for file (using R2 public access)
export function getFileUrl(r2Key: string, baseUrl: string): string {
  return `${baseUrl}/api/files/${encodeURIComponent(r2Key)}`;
}
