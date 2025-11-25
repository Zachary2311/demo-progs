import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import { DiscordService } from '../services/discord.service';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt';
import logger from '../utils/logger';

export class AuthController {
  static async discordLogin(req: Request, res: Response) {
    try {
      const authUrl = DiscordService.getAuthorizationUrl();
      res.json({ url: authUrl });
    } catch (error) {
      logger.error('Discord login error:', error);
      res.status(500).json({ error: 'Failed to generate Discord login URL' });
    }
  }

  static async discordCallback(req: Request, res: Response) {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Invalid authorization code' });
      }

      // Exchange code for token
      const tokenResponse = await DiscordService.exchangeCode(code);

      // Get Discord user info
      const discordUser = await DiscordService.getUser(tokenResponse.access_token);

      // CONCURRENCY FIX: Use upsert to prevent race conditions on concurrent logins
      const user = await prisma.user.upsert({
        where: { discordId: discordUser.id },
        update: {
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          email: discordUser.email,
          avatar: discordUser.avatar,
        },
        create: {
          discordId: discordUser.id,
          username: discordUser.username,
          discriminator: discordUser.discriminator,
          email: discordUser.email,
          avatar: discordUser.avatar,
          roles: {
            create: {
              role: {
                connectOrCreate: {
                  where: { name: 'student' },
                  create: {
                    name: 'student',
                    description: 'Student role',
                  },
                },
              },
            },
          },
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      logger.info(`User authenticated: ${user.username} (${user.id})`);

      // Generate JWT tokens
      const roles = user.roles.map(ur => ur.role.name);
      const tokens = generateTokenPair({
        userId: user.id,
        discordId: user.discordId,
        roles,
      });

      // Save refresh token
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken },
      });

      // SECURITY FIX: Use secure HTTP-only cookies instead of URL parameters
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      res.cookie('accessToken', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
        path: '/',
      });

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      // Redirect without tokens in URL
      res.redirect(`${frontendUrl}/auth/callback`);
    } catch (error) {
      logger.error('Discord callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/error`);
    }
  }

  static async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      // Verify refresh token
      const payload = verifyRefreshToken(refreshToken);

      // Check if refresh token exists in database
      const user = await prisma.user.findFirst({
        where: {
          id: payload.userId,
          refreshToken,
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      // Generate new tokens
      const roles = user.roles.map(ur => ur.role.name);
      const tokens = generateTokenPair({
        userId: user.id,
        discordId: user.discordId,
        roles,
      });

      // Update refresh token
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken },
      });

      res.json(tokens);
    } catch (error) {
      logger.error('Refresh token error:', error);
      res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  }

  static async logout(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Clear refresh token
      await prisma.user.update({
        where: { id: req.user.userId },
        data: { refreshToken: null },
      });

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({ error: 'Failed to logout' });
    }
  }

  static async getProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: {
          id: true,
          discordId: true,
          username: true,
          discriminator: true,
          email: true,
          avatar: true,
          createdAt: true,
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        ...user,
        roles: user.roles.map(ur => ur.role.name),
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }

  static async updateProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { email } = req.body;

      const user = await prisma.user.update({
        where: { id: req.user.userId },
        data: { email },
        select: {
          id: true,
          discordId: true,
          username: true,
          email: true,
          avatar: true,
        },
      });

      res.json(user);
    } catch (error) {
      logger.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
}
