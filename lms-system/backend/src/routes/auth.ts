import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const DISCORD_API = 'https://discord.com/api/v10';

interface DiscordUser {
  id: string;
  username: string;
  avatar: string;
  email: string;
}

const generateTokens = async (userId: bigint) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });

  if (!user) throw new AppError(404, 'User not found');

  const roles = user.roles.map(ur => ur.role.name);

  const accessToken = jwt.sign(
    { id: user.id.toString(), discordId: user.discordId, roles },
    process.env.JWT_SECRET || 'default-secret',
    { expiresIn: process.env.JWT_EXPIRY || '15m' }
  );

  const refreshToken = jwt.sign(
    { id: user.id.toString(), discordId: user.discordId },
    process.env.JWT_REFRESH_SECRET || 'default-secret',
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );

  // Store refresh token
  const hashedToken = Buffer.from(refreshToken).toString('base64');
  await prisma.session.create({
    data: {
      userId: userId,
      refreshTokenHash: hashedToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  return { accessToken, refreshToken, user };
};

// Discord OAuth Callback
router.post('/discord/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;

    if (!code) {
      throw new AppError(400, 'Authorization code required');
    }

    // Exchange code for access token
    const tokenResponse = await axios.post(`${DISCORD_API}/oauth2/token`, null, {
      params: {
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token } = tokenResponse.data;

    // Get user info from Discord
    const userResponse = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const discordUser: DiscordUser = userResponse.data;

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { discordId: discordUser.id }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          discordId: discordUser.id,
          username: discordUser.username,
          email: discordUser.email,
          avatarUrl: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}?size=1024`
        }
      });

      // Assign student role by default
      const studentRole = await prisma.role.findUnique({
        where: { name: 'student' }
      });

      if (studentRole) {
        await prisma.userRole.create({
          data: {
            userId: user.id,
            roleId: studentRole.id
          }
        });
      }
    }

    const { accessToken, refreshToken } = await generateTokens(user.id);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id.toString(),
        discordId: user.discordId,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (error) {
    next(error);
  }
});

// Login with Discord
router.get('/discord/login', (req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID || '',
    redirect_uri: process.env.DISCORD_REDIRECT_URI || '',
    response_type: 'code',
    scope: 'identify email'
  });

  const loginUrl = `https://discord.com/api/oauth2/authorize?${params}`;
  res.json({ loginUrl });
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError(400, 'Refresh token required');
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'default-secret'
    ) as any;

    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(
      BigInt(decoded.id)
    );

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    await prisma.session.updateMany({
      where: { userId: BigInt(req.user.id) },
      data: { revokedAt: new Date() }
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.user.id) },
      include: {
        roles: { include: { role: true } }
      }
    });

    if (!user) throw new AppError(404, 'User not found');

    res.json({
      id: user.id.toString(),
      discordId: user.discordId,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      status: user.status,
      roles: user.roles.map(ur => ur.role.name)
    });
  } catch (error) {
    next(error);
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const { username, email } = req.body;

    const user = await prisma.user.update({
      where: { id: BigInt(req.user.id) },
      data: {
        ...(username && { username }),
        ...(email && { email })
      }
    });

    res.json({
      id: user.id.toString(),
      discordId: user.discordId,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl
    });
  } catch (error) {
    next(error);
  }
});

export { router as authRoutes };
