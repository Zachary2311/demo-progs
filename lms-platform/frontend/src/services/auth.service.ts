import api from './api';
import { User } from '../types';

export const authService = {
  getDiscordLoginUrl: async () => {
    const response = await api.get('/auth/discord/login');
    return response.data.url;
  },

  logout: async () => {
    await api.post('/auth/logout');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },

  getProfile: async (): Promise<User> => {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  updateProfile: async (data: { email: string }): Promise<User> => {
    const response = await api.put('/auth/profile', data);
    return response.data;
  },
};
