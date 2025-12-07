import { Hono } from 'hono';
import type { Env } from '../types';
import { verifyToken } from '../lib/auth';

export const wsRoutes = new Hono<{ Bindings: Env }>();

// WebSocket connection handler
wsRoutes.get('/chat/:roomId', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.json({ success: false, error: 'Expected WebSocket' }, 400);
  }

  // Verify auth token from query param
  const token = c.req.query('token');
  if (!token) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  const user = await verifyToken(token, c.env);
  if (!user) {
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }

  const roomId = c.req.param('roomId');
  
  // Get or create Durable Object for this room
  const id = c.env.CHAT_ROOM.idFromName(roomId);
  const stub = c.env.CHAT_ROOM.get(id);

  // Forward request to Durable Object
  const url = new URL(c.req.url);
  url.pathname = '/websocket';
  url.searchParams.set('userId', user.userId);

  return stub.fetch(new Request(url.toString(), {
    headers: c.req.raw.headers,
  }));
});

// List active rooms (for admin)
wsRoutes.get('/rooms', async (c) => {
  // This would require storing room metadata in D1
  // For now, return a placeholder
  return c.json({
    success: true,
    data: {
      message: 'Room listing not implemented - rooms are created on demand',
    },
  });
});
