import { Hono } from 'hono';
import type { Env, AuthPayload, User } from '../types';
import { getAppSettings, updateAppSettings } from '../lib/settings';
import { listAllFiles, getFileCount } from '../lib/storage';
import { resetRateLimit } from '../lib/rateLimit';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthPayload } }>();

// Get admin dashboard stats
adminRoutes.get('/stats', async (c) => {
  const [
    userCount,
    conversationCount,
    messageCount,
    fileCount,
    usageByDay,
    topUsers,
  ] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM conversations').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM messages').first<{ count: number }>(),
    getFileCount(c.env),
    c.env.DB.prepare(`
      SELECT date(created_at, 'unixepoch') as date, COUNT(*) as count 
      FROM usage_logs 
      WHERE created_at > ? 
      GROUP BY date 
      ORDER BY date DESC 
      LIMIT 30
    `).bind(Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60).all<{ date: string; count: number }>(),
    c.env.DB.prepare(`
      SELECT u.id as userId, u.email, COUNT(l.id) as count 
      FROM users u 
      LEFT JOIN usage_logs l ON u.id = l.user_id 
      GROUP BY u.id 
      ORDER BY count DESC 
      LIMIT 10
    `).all<{ userId: string; email: string; count: number }>(),
  ]);

  return c.json({
    success: true,
    data: {
      totalUsers: userCount?.count || 0,
      totalConversations: conversationCount?.count || 0,
      totalMessages: messageCount?.count || 0,
      totalFiles: fileCount,
      usageByDay: usageByDay.results || [],
      topUsers: topUsers.results || [],
    },
  });
});

// Get all users
adminRoutes.get('/users', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const users = await c.env.DB.prepare(
    `SELECT id, email, name, is_admin, email_verified, created_at 
     FROM users 
     ORDER BY created_at DESC 
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all<Pick<User, 'id' | 'email' | 'name' | 'is_admin' | 'email_verified' | 'created_at'>>();

  return c.json({
    success: true,
    data: users.results || [],
  });
});

// Get single user
adminRoutes.get('/users/:id', async (c) => {
  const userId = c.req.param('id');

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, is_admin, email_verified, created_at FROM users WHERE id = ?'
  ).bind(userId).first<Pick<User, 'id' | 'email' | 'name' | 'is_admin' | 'email_verified' | 'created_at'>>();

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  // Get user stats
  const [conversationCount, messageCount, fileCount] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM conversations WHERE user_id = ?').bind(userId).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.user_id = ?').bind(userId).first<{ count: number }>(),
    getFileCount(c.env, userId),
  ]);

  return c.json({
    success: true,
    data: {
      ...user,
      stats: {
        conversations: conversationCount?.count || 0,
        messages: messageCount?.count || 0,
        files: fileCount,
      },
    },
  });
});

// Update user admin status
adminRoutes.put('/users/:id/admin', async (c) => {
  const user = c.get('user');
  const userId = c.req.param('id');
  const { isAdmin } = await c.req.json<{ isAdmin: boolean }>();

  // Prevent self-demotion
  if (userId === user.userId) {
    return c.json({ success: false, error: 'Cannot modify your own admin status' }, 400);
  }

  await c.env.DB.prepare(
    'UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?'
  ).bind(isAdmin ? 1 : 0, Math.floor(Date.now() / 1000), userId).run();

  return c.json({ success: true });
});

// Reset user rate limit
adminRoutes.post('/users/:id/reset-rate-limit', async (c) => {
  const userId = c.req.param('id');
  await resetRateLimit(c.env, userId);
  return c.json({ success: true });
});

// Get app settings
adminRoutes.get('/settings', async (c) => {
  const settings = await getAppSettings(c.env);
  return c.json({ success: true, data: settings });
});

// Update app settings
adminRoutes.put('/settings', async (c) => {
  const updates = await c.req.json();
  await updateAppSettings(c.env, updates);
  const settings = await getAppSettings(c.env);
  return c.json({ success: true, data: settings });
});

// List all files (R2 browser)
adminRoutes.get('/files', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const files = await listAllFiles(c.env, limit, offset);
  const totalCount = await getFileCount(c.env);

  return c.json({
    success: true,
    data: {
      files,
      total: totalCount,
    },
  });
});

// Delete any file (admin only)
adminRoutes.delete('/files/:id', async (c) => {
  const fileId = c.req.param('id');

  // Get file record
  const file = await c.env.DB.prepare(
    'SELECT r2_key FROM files WHERE id = ?'
  ).bind(fileId).first<{ r2_key: string }>();

  if (!file) {
    return c.json({ success: false, error: 'File not found' }, 404);
  }

  // Delete from R2
  await c.env.R2.delete(file.r2_key);

  // Delete from D1
  await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileId).run();

  return c.json({ success: true });
});

// Get usage logs
adminRoutes.get('/usage', async (c) => {
  const limit = parseInt(c.req.query('limit') || '100', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const userId = c.req.query('userId');

  let query = `
    SELECT l.*, u.email 
    FROM usage_logs l 
    LEFT JOIN users u ON l.user_id = u.id
  `;
  
  const params: (string | number)[] = [];
  
  if (userId) {
    query += ' WHERE l.user_id = ?';
    params.push(userId);
  }
  
  query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const logs = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: logs.results || [],
  });
});
