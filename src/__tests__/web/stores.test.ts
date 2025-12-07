import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore, useChatStore, useToastStore } from '../../web/store';

describe('Zustand stores', () => {
  describe('useAuthStore', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    });

    it('initializes with default values', () => {
      const state = useAuthStore.getState();
      
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('setAuth updates state correctly', () => {
      const { setAuth } = useAuthStore.getState();
      
      setAuth(
        { id: '1', email: 'test@test.com', name: 'Test', isAdmin: false },
        'test-token'
      );
      
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.email).toBe('test@test.com');
      expect(state.token).toBe('test-token');
    });

    it('clearAuth resets state', () => {
      const { setAuth, clearAuth } = useAuthStore.getState();
      
      setAuth(
        { id: '1', email: 'test@test.com', name: 'Test', isAdmin: false },
        'test-token'
      );
      clearAuth();
      
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
    });
  });

  describe('useChatStore', () => {
    beforeEach(() => {
      useChatStore.setState({
        conversations: [],
        currentConversation: null,
        messages: [],
        isLoading: false,
        settings: { enableImageGeneration: true, enableDeepThinking: true },
      });
    });

    it('initializes with default values', () => {
      const state = useChatStore.getState();
      
      expect(state.conversations).toEqual([]);
      expect(state.currentConversation).toBeNull();
      expect(state.messages).toEqual([]);
      expect(state.isLoading).toBe(false);
    });

    it('setConversations updates conversations', () => {
      const { setConversations } = useChatStore.getState();
      const conversations = [
        { id: '1', title: 'Test', created_at: 123, updated_at: 123 },
      ];
      
      setConversations(conversations);
      
      expect(useChatStore.getState().conversations).toEqual(conversations);
    });

    it('addMessage appends to messages', () => {
      const { addMessage } = useChatStore.getState();
      
      addMessage({ id: '1', role: 'user', content: 'Hello', created_at: 123 });
      addMessage({ id: '2', role: 'assistant', content: 'Hi!', created_at: 124 });
      
      const state = useChatStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0].content).toBe('Hello');
      expect(state.messages[1].content).toBe('Hi!');
    });

    it('updateMessage modifies specific message', () => {
      const { addMessage, updateMessage } = useChatStore.getState();
      
      addMessage({ id: '1', role: 'assistant', content: 'Initial', isStreaming: true, created_at: 123 });
      updateMessage('1', 'Updated content');
      
      const state = useChatStore.getState();
      expect(state.messages[0].content).toBe('Updated content');
      expect(state.messages[0].isStreaming).toBe(false);
    });
  });

  describe('useToastStore', () => {
    beforeEach(() => {
      useToastStore.setState({ toasts: [] });
    });

    it('addToast adds a toast', () => {
      const { addToast } = useToastStore.getState();
      
      addToast('Test message', 'success');
      
      const state = useToastStore.getState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].message).toBe('Test message');
      expect(state.toasts[0].type).toBe('success');
    });

    it('removeToast removes specific toast', () => {
      const { addToast, removeToast } = useToastStore.getState();
      
      addToast('Toast 1', 'info');
      addToast('Toast 2', 'error');
      
      const toasts = useToastStore.getState().toasts;
      removeToast(toasts[0].id);
      
      const state = useToastStore.getState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].message).toBe('Toast 2');
    });
  });
});
