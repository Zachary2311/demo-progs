import { Hono } from 'hono';
import type { Env, User } from '../types';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  generateRandomToken,
  generateId,
  createAuthCookie,
  clearAuthCookie,
  getUserFromRequest,
} from '../lib/auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Signup
authRoutes.post('/signup', async (c) => {
  try {
    const { email, password, name } = await c.req.json<{
      email: string;
      password: string;
      name: string;
    }>();

    // Validate input
    if (!email || !password || !name) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }

    if (password.length < 8) {
      return c.json({ success: false, error: 'Password must be at least 8 characters' }, 400);
    }

    // Check if email exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existing) {
      return c.json({ success: false, error: 'Email already registered' }, 400);
    }

    // Check if this is the first user (will be admin)
    const userCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
    const isFirstUser = (userCount?.count || 0) === 0;

    // Create user
    const id = generateId();
    const passwordHash = await hashPassword(password);
    const verificationToken = generateRandomToken();
    const now = Math.floor(Date.now() / 1000);

    await c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, is_admin, email_verified, verification_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      email.toLowerCase(),
      passwordHash,
      name,
      isFirstUser ? 1 : 0,
      0,
      verificationToken,
      now,
      now
    ).run();

    // Send verification email
    await sendVerificationEmail(c.env, email, verificationToken, name);

    return c.json({
      success: true,
      data: {
        message: 'Account created. Please check your email to verify your account.',
        isAdmin: isFirstUser,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return c.json({ success: false, error: 'Failed to create account' }, 500);
  }
});

// Login
authRoutes.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{
      email: string;
      password: string;
    }>();

    if (!email || !password) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }

    // Find user
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first<User>();

    if (!user) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401);
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401);
    }

    // Check email verification
    if (!user.email_verified) {
      return c.json({ success: false, error: 'Please verify your email first' }, 401);
    }

    // Generate token
    const token = await generateToken(user, c.env);

    // Set cookie
    const cookie = createAuthCookie(token);

    return c.json(
      {
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.is_admin === 1,
          },
        },
      },
      200,
      { 'Set-Cookie': cookie }
    );
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ success: false, error: 'Login failed' }, 500);
  }
});

// Verify email
authRoutes.get('/verify', async (c) => {
  try {
    const token = c.req.query('token');

    if (!token) {
      return c.json({ success: false, error: 'Missing verification token' }, 400);
    }

    const user = await c.env.DB.prepare(
      'SELECT id FROM users WHERE verification_token = ?'
    ).bind(token).first<{ id: string }>();

    if (!user) {
      return c.json({ success: false, error: 'Invalid verification token' }, 400);
    }

    // Update user
    await c.env.DB.prepare(
      'UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = ? WHERE id = ?'
    ).bind(Math.floor(Date.now() / 1000), user.id).run();

    // Redirect to login
    return c.redirect('/login?verified=true');
  } catch (error) {
    console.error('Verification error:', error);
    return c.json({ success: false, error: 'Verification failed' }, 500);
  }
});

// Request password reset
authRoutes.post('/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>();

    if (!email) {
      return c.json({ success: false, error: 'Email is required' }, 400);
    }

    const user = await c.env.DB.prepare(
      'SELECT id, name FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first<{ id: string; name: string }>();

    // Always return success to prevent email enumeration
    if (!user) {
      return c.json({
        success: true,
        data: { message: 'If an account exists, a reset email has been sent.' },
      });
    }

    // Generate reset token
    const resetToken = generateRandomToken();
    const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    await c.env.DB.prepare(
      'UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = ? WHERE id = ?'
    ).bind(resetToken, expires, Math.floor(Date.now() / 1000), user.id).run();

    // Send reset email
    await sendPasswordResetEmail(c.env, email, resetToken, user.name);

    return c.json({
      success: true,
      data: { message: 'If an account exists, a reset email has been sent.' },
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return c.json({ success: false, error: 'Request failed' }, 500);
  }
});

// Reset password
authRoutes.post('/reset-password', async (c) => {
  try {
    const { token, password } = await c.req.json<{
      token: string;
      password: string;
    }>();

    if (!token || !password) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }

    if (password.length < 8) {
      return c.json({ success: false, error: 'Password must be at least 8 characters' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const user = await c.env.DB.prepare(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?'
    ).bind(token, now).first<{ id: string }>();

    if (!user) {
      return c.json({ success: false, error: 'Invalid or expired reset token' }, 400);
    }

    // Update password
    const passwordHash = await hashPassword(password);
    await c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ? WHERE id = ?'
    ).bind(passwordHash, now, user.id).run();

    return c.json({
      success: true,
      data: { message: 'Password reset successfully' },
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ success: false, error: 'Password reset failed' }, 500);
  }
});

// Logout
authRoutes.post('/logout', async (c) => {
  const cookie = clearAuthCookie();
  return c.json({ success: true }, 200, { 'Set-Cookie': cookie });
});

// Get current user
authRoutes.get('/me', async (c) => {
  const user = await getUserFromRequest(c.req.raw, c.env);
  
  if (!user) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const dbUser = await c.env.DB.prepare(
    'SELECT id, email, name, is_admin, created_at FROM users WHERE id = ?'
  ).bind(user.userId).first<Pick<User, 'id' | 'email' | 'name' | 'is_admin' | 'created_at'>>();

  if (!dbUser) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }

  return c.json({
    success: true,
    data: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      isAdmin: dbUser.is_admin === 1,
      createdAt: dbUser.created_at,
    },
  });
});
