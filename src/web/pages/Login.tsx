import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, useToastStore } from '../store';
import { authApi } from '../api';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();
  const { addToast } = useToastStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Check for verified query param - only run once
  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      addToast('Email verified! You can now log in.', 'success');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await authApi.login(email, password);

    if (result.success && result.data) {
      setAuth(result.data.user, result.data.token);
      addToast('Welcome back!', 'success');
      navigate('/');
    } else {
      addToast(result.error || 'Login failed', 'error');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-chat-bg px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="text-gray-400 mt-2">Sign in to your CF Chat account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <Link
              to="/forgot-password"
              className="text-sm text-primary-400 hover:text-primary-300"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-gray-400 mt-6">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="text-primary-400 hover:text-primary-300">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
