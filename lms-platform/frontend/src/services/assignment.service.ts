import api from './api';
import { Assignment, AssignmentSubmission } from '../types';

export const assignmentService = {
  createAssignment: async (data: Partial<Assignment>): Promise<Assignment> => {
    const response = await api.post('/assignments', data);
    return response.data;
  },

  getAssignments: async (courseId: string): Promise<Assignment[]> => {
    const response = await api.get('/assignments', { params: { courseId } });
    return response.data;
  },

  getAssignment: async (id: string): Promise<Assignment> => {
    const response = await api.get(`/assignments/${id}`);
    return response.data;
  },

  submitAssignment: async (id: string, data: { content?: string; fileUrl?: string }): Promise<AssignmentSubmission> => {
    const response = await api.post(`/assignments/${id}/submit`, data);
    return response.data;
  },

  gradeSubmission: async (id: string, data: { score: number; feedback?: string }): Promise<AssignmentSubmission> => {
    const response = await api.post(`/assignments/submissions/${id}/grade`, data);
    return response.data;
  },

  getSubmissions: async (params?: { assignmentId?: string; courseId?: string }): Promise<AssignmentSubmission[]> => {
    const response = await api.get('/assignments/submissions', { params });
    return response.data;
  },
};
