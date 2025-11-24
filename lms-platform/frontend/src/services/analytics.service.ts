import api from './api';
import { DashboardData } from '../types';

export const analyticsService = {
  getStudentDashboard: async (): Promise<DashboardData> => {
    const response = await api.get('/analytics/dashboard/student');
    return response.data;
  },

  getInstructorDashboard: async (): Promise<DashboardData> => {
    const response = await api.get('/analytics/dashboard/instructor');
    return response.data;
  },

  getAdminDashboard: async (): Promise<DashboardData> => {
    const response = await api.get('/analytics/dashboard/admin');
    return response.data;
  },

  getCourseAnalytics: async (courseId: string) => {
    const response = await api.get(`/analytics/course/${courseId}`);
    return response.data;
  },

  logEvent: async (data: { eventType: string; courseId?: string; metadata?: any }) => {
    const response = await api.post('/analytics/events', data);
    return response.data;
  },
};
