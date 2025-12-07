import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useToastStore } from '../store';
import { authApi } from '../api';

export default function ForgotPassword() {
  const { addToast } = useToastStore();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await authApi.forgotPassword(email);

    if (result.success) {
      setSent(true);
      addToast('If an account exists, a reset email has been sent.', 'success');
    } else {
      addToast(result.error || 'Request failed', 'error');
    }

    setLoading(false);
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chat-bg px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-gray-400 mb-6">
            We&apos;ve sent a password reset link to <strong>{email}</strong>
          </p>
          <Link to="/login" className="text-primary-400 hover:text-primary-300">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-chat-bg px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Reset password</h1>
          <p className="text-gray-400 mt-2">
            Enter your email and we&apos;ll send you a reset link
          </p>
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

          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        <p className="text-center text-gray-400 mt-6">
          Remember your password?{' '}
          <Link to="/login" className="text-primary-400 hover:text-primary-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
