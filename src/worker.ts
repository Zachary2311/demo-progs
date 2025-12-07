import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types';
import { authRoutes } from './routes/auth';
import { chatRoutes } from './routes/chat';
import { adminRoutes } from './routes/admin';
import { fileRoutes } from './routes/files';
import { wsRoutes } from './routes/websocket';
import { getUserFromRequest } from './lib/auth';

// Re-export Durable Objects
export { ChatRoom } from './durable-objects';

// Create Hono app with Env typing
const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.route('/api/auth', authRoutes);

// Protected routes middleware
app.use('/api/chat/*', async (c, next) => {
  const user = await getUserFromRequest(c.req.raw, c.env);
  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  c.set('user' as never, user);
  await next();
});

app.use('/api/files/*', async (c, next) => {
  const user = await getUserFromRequest(c.req.raw, c.env);
  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  c.set('user' as never, user);
  await next();
});

app.use('/api/admin/*', async (c, next) => {
  const user = await getUserFromRequest(c.req.raw, c.env);
  if (!user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }
  if (!user.isAdmin) {
    return c.json({ success: false, error: 'Admin access required' }, 403);
  }
  c.set('user' as never, user);
  await next();
});

// Chat routes
app.route('/api/chat', chatRoutes);

// File routes
app.route('/api/files', fileRoutes);

// Admin routes
app.route('/api/admin', adminRoutes);

// WebSocket routes
app.route('/ws', wsRoutes);

// Serve static files from built SPA
app.get('*', async (c) => {
  // In production, Workers Sites serves static files
  // This fallback serves index.html for SPA routing
  const url = new URL(c.req.url);
  
  // Check if it's an API route
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }

  // For SPA, return index.html
  // Note: Workers Sites handles this automatically in production
  return c.html(`<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CF Chat - AI Assistant</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/web/main.tsx"></script>
  </body>
</html>`);
});

// Export default fetch handler
export default {
  fetch: app.fetch,
};
