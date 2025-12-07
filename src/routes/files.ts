import { Hono } from 'hono';
import type { Env, AuthPayload, FileRecord } from '../types';
import { uploadFile, getFile, deleteFile, listUserFiles } from '../lib/storage';

export const fileRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthPayload } }>();

// Upload file
fileRoutes.post('/upload', async (c) => {
  const user = c.get('user');

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const messageId = formData.get('messageId') as string | null;

  if (!file) {
    return c.json({ success: false, error: 'No file provided' }, 400);
  }

  const data = await file.arrayBuffer();
  const result = await uploadFile(
    c.env,
    user.userId,
    file.name,
    file.type,
    data,
    messageId || undefined
  );

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }

  return c.json({
    success: true,
    data: result.file,
  });
});

// Get file
fileRoutes.get('/*', async (c) => {
  const path = c.req.path.replace('/api/files/', '');
  
  if (!path) {
    return c.json({ success: false, error: 'File path required' }, 400);
  }

  const object = await getFile(c.env, path);
  
  if (!object) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000');

  return new Response(object.body, { headers });
});

// List user files
fileRoutes.get('/', async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const files = await listUserFiles(c.env, user.userId, limit, offset);

  return c.json({
    success: true,
    data: files,
  });
});

// Delete file
fileRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const fileId = c.req.param('id');

  const success = await deleteFile(c.env, fileId, user.userId);

  if (!success) {
    return c.json({ success: false, error: 'File not found or access denied' }, 404);
  }

  return c.json({ success: true });
});
