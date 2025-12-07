import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, useChatStore, useToastStore } from '../store';
import { chatApi, authApi } from '../api';
import { PlusIcon, ChatBubbleLeftIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();
  const { conversations, setConversations, setCurrentConversation } = useChatStore();
  const { addToast } = useToastStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Fetch conversations
  useEffect(() => {
    const fetchConversations = async () => {
      const result = await chatApi.getConversations();
      if (result.success && result.data) {
        setConversations(result.data);
      }
    };

    fetchConversations();
  }, [setConversations]);

  const handleNewChat = () => {
    setCurrentConversation(null);
    navigate('/');
  };

  const handleLogout = async () => {
    await authApi.logout();
    clearAuth();
    navigate('/login');
    addToast('Logged out successfully', 'success');
  };

  const handleSelectConversation = (conversation: typeof conversations[0]) => {
    setCurrentConversation(conversation);
    navigate(`/chat/${conversation.id}`);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } bg-chat-sidebar flex flex-col transition-all duration-300 overflow-hidden`}
      >
        <div className="p-3 flex-shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-chat-border hover:bg-white/5 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            <span>New chat</span>
          </button>
        </div>

        {/* Conversations list */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={`sidebar-item w-full text-left truncate ${
                  location.pathname === `/chat/${conv.id}` ? 'active' : ''
                }`}
              >
                <ChatBubbleLeftIcon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{conv.title}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-chat-border">
          {user?.isAdmin && (
            <Link
              to="/admin"
              className="sidebar-item w-full mb-2"
            >
              <Cog6ToothIcon className="w-5 h-5" />
              <span>Admin Dashboard</span>
            </Link>
          )}
          
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-sm font-medium">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Logout"
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 p-4 border-b border-chat-border">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-white/10 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">CF Chat</h1>
        </header>

        {children}
      </main>
    </div>
  );
}
