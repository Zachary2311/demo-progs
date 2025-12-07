import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { adminApi } from '../api';
import { useToastStore } from '../store';
import {
  ChartBarIcon,
  UsersIcon,
  Cog6ToothIcon,
  DocumentIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface Stats {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalFiles: number;
  usageByDay: Array<{ date: string; count: number }>;
  topUsers: Array<{ userId: string; email: string; count: number }>;
}

interface Settings {
  enable_image_generation: boolean;
  enable_deep_thinking: boolean;
  model_temperature: number;
  max_tokens: number;
  rate_limit_per_day: number;
}

interface User {
  id: string;
  email: string;
  name: string;
  is_admin: number;
  created_at: number;
}

interface File {
  id: string;
  filename: string;
  size: number;
  user_id: string;
  created_at: number;
}

export default function Admin() {
  const location = useLocation();

  const navItems = [
    { path: '/admin', label: 'Overview', icon: ChartBarIcon },
    { path: '/admin/users', label: 'Users', icon: UsersIcon },
    { path: '/admin/settings', label: 'Settings', icon: Cog6ToothIcon },
    { path: '/admin/files', label: 'Files', icon: DocumentIcon },
  ];

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Admin sidebar */}
      <nav className="w-48 bg-chat-sidebar border-r border-chat-border p-4">
        <h2 className="text-lg font-semibold mb-4">Admin</h2>
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  location.pathname === item.path
                    ? 'bg-primary-500 text-white'
                    : 'hover:bg-white/10'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/files" element={<FilesPage />} />
        </Routes>
      </div>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const result = await adminApi.getStats();
      if (result.success && result.data) {
        setStats(result.data);
      }
      setLoading(false);
    };

    fetchStats();
  }, []);

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!stats) {
    return <div className="text-center py-12">Failed to load stats</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard Overview</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Users" value={stats.totalUsers} />
        <StatCard title="Conversations" value={stats.totalConversations} />
        <StatCard title="Messages" value={stats.totalMessages} />
        <StatCard title="Files" value={stats.totalFiles} />
      </div>

      {/* Usage chart */}
      <div className="bg-chat-sidebar rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Usage (Last 30 Days)</h2>
        <div className="h-48 flex items-end gap-1">
          {stats.usageByDay.slice(0, 30).reverse().map((day, i) => {
            const maxCount = Math.max(...stats.usageByDay.map((d) => d.count), 1);
            const height = (day.count / maxCount) * 100;
            return (
              <div
                key={i}
                className="flex-1 bg-primary-500 rounded-t transition-all hover:bg-primary-400"
                style={{ height: `${height}%` }}
                title={`${day.date}: ${day.count} requests`}
              />
            );
          })}
        </div>
      </div>

      {/* Top users */}
      <div className="bg-chat-sidebar rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Top Users</h2>
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-400 text-sm">
              <th className="pb-3">Email</th>
              <th className="pb-3">Requests</th>
            </tr>
          </thead>
          <tbody>
            {stats.topUsers.map((user) => (
              <tr key={user.userId} className="border-t border-chat-border">
                <td className="py-3">{user.email}</td>
                <td className="py-3">{user.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-chat-sidebar rounded-lg p-6">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
    </div>
  );
}

function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToastStore();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const result = await adminApi.getUsers();
    if (result.success && result.data) {
      setUsers(result.data);
    }
    setLoading(false);
  };

  const handleToggleAdmin = async (user: User) => {
    const result = await adminApi.updateUserAdmin(user.id, user.is_admin === 0);
    if (result.success) {
      addToast(`Updated ${user.email}`, 'success');
      fetchUsers();
    } else {
      addToast('Failed to update user', 'error');
    }
  };

  const handleResetRateLimit = async (userId: string) => {
    const result = await adminApi.resetUserRateLimit(userId);
    if (result.success) {
      addToast('Rate limit reset', 'success');
    } else {
      addToast('Failed to reset rate limit', 'error');
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Users</h1>

      <div className="bg-chat-sidebar rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-400 text-sm bg-black/20">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-chat-border">
                <td className="px-4 py-3">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleAdmin(user)}
                    className={`px-2 py-1 rounded text-xs ${
                      user.is_admin ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                  >
                    {user.is_admin ? 'Yes' : 'No'}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-400 text-sm">
                  {new Date(user.created_at * 1000).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleResetRateLimit(user.id)}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
                    title="Reset rate limit"
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                    Reset limit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToastStore();

  useEffect(() => {
    const fetchSettings = async () => {
      const result = await adminApi.getSettings();
      if (result.success && result.data) {
        setSettings(result.data);
      }
      setLoading(false);
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    const result = await adminApi.updateSettings(settings);
    
    if (result.success) {
      addToast('Settings saved', 'success');
    } else {
      addToast('Failed to save settings', 'error');
    }
    
    setSaving(false);
  };

  if (loading || !settings) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="bg-chat-sidebar rounded-lg p-6 space-y-6 max-w-lg">
        {/* Toggle settings */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Enable Image Generation</p>
            <p className="text-sm text-gray-400">Allow users to generate images</p>
          </div>
          <button
            onClick={() =>
              setSettings({ ...settings, enable_image_generation: !settings.enable_image_generation })
            }
            className={`w-12 h-6 rounded-full transition-colors ${
              settings.enable_image_generation ? 'bg-primary-500' : 'bg-gray-600'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full transition-transform ${
                settings.enable_image_generation ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Enable Deep Thinking</p>
            <p className="text-sm text-gray-400">Allow access to advanced model</p>
          </div>
          <button
            onClick={() =>
              setSettings({ ...settings, enable_deep_thinking: !settings.enable_deep_thinking })
            }
            className={`w-12 h-6 rounded-full transition-colors ${
              settings.enable_deep_thinking ? 'bg-primary-500' : 'bg-gray-600'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full transition-transform ${
                settings.enable_deep_thinking ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Number settings */}
        <div>
          <label className="block font-medium mb-2">Model Temperature</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.model_temperature}
            onChange={(e) =>
              setSettings({ ...settings, model_temperature: parseFloat(e.target.value) })
            }
            className="w-full"
          />
          <p className="text-sm text-gray-400 mt-1">{settings.model_temperature}</p>
        </div>

        <div>
          <label className="block font-medium mb-2">Max Tokens</label>
          <input
            type="number"
            value={settings.max_tokens}
            onChange={(e) =>
              setSettings({ ...settings, max_tokens: parseInt(e.target.value, 10) })
            }
            className="input"
            min="256"
            max="8192"
          />
        </div>

        <div>
          <label className="block font-medium mb-2">Rate Limit (requests/day)</label>
          <input
            type="number"
            value={settings.rate_limit_per_day}
            onChange={(e) =>
              setSettings({ ...settings, rate_limit_per_day: parseInt(e.target.value, 10) })
            }
            className="input"
            min="1"
            max="10000"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary w-full"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function FilesPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToastStore();

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    const result = await adminApi.getFiles();
    if (result.success && result.data) {
      setFiles(result.data.files);
      setTotal(result.data.total);
    }
    setLoading(false);
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    const result = await adminApi.deleteFile(fileId);
    if (result.success) {
      addToast('File deleted', 'success');
      fetchFiles();
    } else {
      addToast('Failed to delete file', 'error');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Files</h1>
        <p className="text-gray-400">{total} total files</p>
      </div>

      <div className="bg-chat-sidebar rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-400 text-sm bg-black/20">
              <th className="px-4 py-3">Filename</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id} className="border-t border-chat-border">
                <td className="px-4 py-3 max-w-xs truncate">{file.filename}</td>
                <td className="px-4 py-3 text-gray-400">{formatSize(file.size)}</td>
                <td className="px-4 py-3 text-gray-400 text-sm">{file.user_id.slice(0, 8)}...</td>
                <td className="px-4 py-3 text-gray-400 text-sm">
                  {new Date(file.created_at * 1000).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
