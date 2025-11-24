import api from './api';
import { Quiz, QuizAttempt } from '../types';

export const quizService = {
  createQuiz: async (data: any): Promise<Quiz> => {
    const response = await api.post('/quizzes', data);
    return response.data;
  },

  getQuiz: async (id: string): Promise<Quiz> => {
    const response = await api.get(`/quizzes/${id}`);
    return response.data;
  },

  startQuiz: async (id: string): Promise<QuizAttempt> => {
    const response = await api.post(`/quizzes/${id}/start`);
    return response.data;
  },

  submitQuiz: async (id: string, data: { attemptId: string; answers: any[] }): Promise<QuizAttempt> => {
    const response = await api.post(`/quizzes/${id}/submit`, data);
    return response.data;
  },

  getQuizAttempts: async (id: string): Promise<QuizAttempt[]> => {
    const response = await api.get(`/quizzes/${id}/attempts`);
    return response.data;
  },
};
