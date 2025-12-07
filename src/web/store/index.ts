import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  created_at?: number;
  isStreaming?: boolean;
}

interface AppSettings {
  enableImageGeneration: boolean;
  enableDeepThinking: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  settings: AppSettings;
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversation: (conversation: Conversation | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  setIsLoading: (loading: boolean) => void;
  setSettings: (settings: AppSettings) => void;
}

interface ToastState {
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

// Auth store with persistence
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token) => set({ user, token, isAuthenticated: true }),
      clearAuth: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
    }
  )
);

// Chat store
export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  isLoading: false,
  settings: {
    enableImageGeneration: true,
    enableDeepThinking: true,
  },
  setConversations: (conversations) => set({ conversations }),
  setCurrentConversation: (conversation) => set({ currentConversation: conversation }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content, isStreaming: false } : m
      ),
    })),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setSettings: (settings) => set({ settings }),
}));

// Toast store
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    // Auto-remove after 5 seconds
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
