import '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Mock crypto for tests
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 11),
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
});

// Mock handlers for API
export const handlers = [
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  }),

  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    if (body.email === 'test@example.com' && body.password === 'password123') {
      return HttpResponse.json({
        success: true,
        data: {
          token: 'test-token',
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            isAdmin: false,
          },
        },
      });
    }
    return HttpResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  }),

  http.post('/api/auth/signup', async ({ request }) => {
    const body = await request.json() as { email: string; password: string; name: string };
    if (body.email && body.password && body.name) {
      return HttpResponse.json({
        success: true,
        data: { message: 'Account created' },
      });
    }
    return HttpResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
  }),

  http.get('/api/auth/me', ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (auth === 'Bearer test-token') {
      return HttpResponse.json({
        success: true,
        data: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          isAdmin: false,
        },
      });
    }
    return HttpResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }),

  http.get('/api/chat/conversations', () => {
    return HttpResponse.json({
      success: true,
      data: [
        { id: 'conv-1', title: 'Test Conversation', created_at: Date.now() / 1000, updated_at: Date.now() / 1000 },
      ],
    });
  }),

  http.get('/api/chat/settings', () => {
    return HttpResponse.json({
      success: true,
      data: {
        enableImageGeneration: true,
        enableDeepThinking: true,
      },
    });
  }),

  http.get('/api/admin/stats', () => {
    return HttpResponse.json({
      success: true,
      data: {
        totalUsers: 100,
        totalConversations: 500,
        totalMessages: 10000,
        totalFiles: 50,
        usageByDay: [],
        topUsers: [],
      },
    });
  }),
];

// Setup MSW server
export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
