import { useAuthStore } from '../store';

const API_BASE = '/api';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = useAuthStore.getState().token;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    const data = await response.json() as ApiResponse<T>;

    if (!response.ok) {
      return { success: false, error: data.error || 'Request failed' };
    }

    return data;
  } catch (error) {
    console.error('API error:', error);
    return { success: false, error: 'Network error' };
  }
}

// Auth API
export const authApi = {
  signup: (email: string, password: string, name: string) =>
    fetchApi('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    fetchApi<{ token: string; user: { id: string; email: string; name: string; isAdmin: boolean } }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    ),

  logout: () =>
    fetchApi('/auth/logout', { method: 'POST' }),

  forgotPassword: (email: string) =>
    fetchApi('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    fetchApi('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  me: () =>
    fetchApi<{ id: string; email: string; name: string; isAdmin: boolean }>('/auth/me'),
};

// Chat API
export const chatApi = {
  getConversations: () =>
    fetchApi<Array<{ id: string; title: string; created_at: number; updated_at: number }>>(
      '/chat/conversations'
    ),

  getConversation: (id: string) =>
    fetchApi<{
      conversation: { id: string; title: string; created_at: number; updated_at: number };
      messages: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; model?: string; created_at: number }>;
    }>(`/chat/conversations/${id}`),

  createConversation: (title?: string) =>
    fetchApi<{ id: string; title: string; created_at: number; updated_at: number }>(
      '/chat/conversations',
      {
        method: 'POST',
        body: JSON.stringify({ title }),
      }
    ),

  deleteConversation: (id: string) =>
    fetchApi(`/chat/conversations/${id}`, { method: 'DELETE' }),

  sendMessage: async (
    message: string,
    model: 'default' | 'deep-thinking' = 'default',
    conversationId?: string,
    onChunk?: (chunk: string) => void
  ): Promise<{ success: boolean; error?: string }> => {
    const token = useAuthStore.getState().token;

    try {
      const response = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message, model, conversationId }),
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        return { success: false, error: data.error || 'Failed to send message' };
      }

      if (!response.body) {
        return { success: false, error: 'No response body' };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        onChunk?.(chunk);
      }

      return { success: true };
    } catch (error) {
      console.error('Message error:', error);
      return { success: false, error: 'Network error' };
    }
  },

  generateImage: (prompt: string, conversationId?: string) =>
    fetchApi<{ id: string; url: string }>('/chat/image', {
      method: 'POST',
      body: JSON.stringify({ prompt, conversationId }),
    }),

  textToSpeech: async (text: string): Promise<ArrayBuffer | null> => {
    const token = useAuthStore.getState().token;

    try {
      const response = await fetch(`${API_BASE}/chat/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
        credentials: 'include',
      });

      if (!response.ok) {
        return null;
      }

      return response.arrayBuffer();
    } catch {
      return null;
    }
  },

  getSettings: () =>
    fetchApi<{ enableImageGeneration: boolean; enableDeepThinking: boolean }>('/chat/settings'),
};

// Files API
export const filesApi = {
  upload: async (file: File): Promise<ApiResponse<{ id: string; filename: string; url: string }>> => {
    const token = useAuthStore.getState().token;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        credentials: 'include',
      });

      return response.json();
    } catch {
      return { success: false, error: 'Upload failed' };
    }
  },

  list: () => fetchApi<Array<{ id: string; filename: string; size: number; created_at: number }>>('/files'),

  delete: (id: string) => fetchApi(`/files/${id}`, { method: 'DELETE' }),
};

// Admin API
export const adminApi = {
  getStats: () =>
    fetchApi<{
      totalUsers: number;
      totalConversations: number;
      totalMessages: number;
      totalFiles: number;
      usageByDay: Array<{ date: string; count: number }>;
      topUsers: Array<{ userId: string; email: string; count: number }>;
    }>('/admin/stats'),

  getUsers: (limit = 50, offset = 0) =>
    fetchApi<Array<{ id: string; email: string; name: string; is_admin: number; created_at: number }>>(
      `/admin/users?limit=${limit}&offset=${offset}`
    ),

  getUser: (id: string) => fetchApi(`/admin/users/${id}`),

  updateUserAdmin: (id: string, isAdmin: boolean) =>
    fetchApi(`/admin/users/${id}/admin`, {
      method: 'PUT',
      body: JSON.stringify({ isAdmin }),
    }),

  resetUserRateLimit: (id: string) =>
    fetchApi(`/admin/users/${id}/reset-rate-limit`, { method: 'POST' }),

  getSettings: () =>
    fetchApi<{
      enable_image_generation: boolean;
      enable_deep_thinking: boolean;
      model_temperature: number;
      max_tokens: number;
      rate_limit_per_day: number;
    }>('/admin/settings'),

  updateSettings: (settings: Record<string, unknown>) =>
    fetchApi('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  getFiles: (limit = 50, offset = 0) =>
    fetchApi<{
      files: Array<{ id: string; filename: string; size: number; user_id: string; created_at: number }>;
      total: number;
    }>(`/admin/files?limit=${limit}&offset=${offset}`),

  deleteFile: (id: string) => fetchApi(`/admin/files/${id}`, { method: 'DELETE' }),

  getUsageLogs: (limit = 100, offset = 0, userId?: string) =>
    fetchApi(
      `/admin/usage?limit=${limit}&offset=${offset}${userId ? `&userId=${userId}` : ''}`
    ),
};
