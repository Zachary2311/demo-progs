import '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Mock crypto for tests
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => {
      // Generate a valid UUID v4 format
      const hex = '0123456789abcdef';
      let uuid = '';
      for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) {
          uuid += '-';
        } else if (i === 14) {
          uuid += '4'; // UUID v4
        } else if (i === 19) {
          uuid += hex[(Math.random() * 4 + 8) | 0]; // 8, 9, a, or b
        } else {
          uuid += hex[(Math.random() * 16) | 0];
        }
      }
      return uuid;
    },
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
