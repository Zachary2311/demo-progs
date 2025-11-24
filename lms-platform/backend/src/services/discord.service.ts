import fetch from 'node-fetch';
import { DiscordUser, DiscordTokenResponse } from '../types';
import logger from '../utils/logger';

const DISCORD_API_URL = 'https://discord.com/api/v10';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;

export class DiscordService {
  static async exchangeCode(code: string): Promise<DiscordTokenResponse> {
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    });

    const response = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Discord token exchange failed:', error);
      throw new Error('Failed to exchange Discord code');
    }

    return response.json() as Promise<DiscordTokenResponse>;
  }

  static async getUser(accessToken: string): Promise<DiscordUser> {
    const response = await fetch(`${DISCORD_API_URL}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Failed to fetch Discord user:', error);
      throw new Error('Failed to fetch Discord user');
    }

    return response.json() as Promise<DiscordUser>;
  }

  static getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify email',
    });

    return `${DISCORD_API_URL}/oauth2/authorize?${params.toString()}`;
  }
}
