import api from './api';
import { Course, Module, Lesson, PaginatedResponse } from '../types';

export const courseService = {
  getCourses: async (params?: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
    published?: boolean;
  }): Promise<PaginatedResponse<Course>> => {
    const response = await api.get('/courses', { params });
    return response.data;
  },

  getCourse: async (id: string): Promise<Course> => {
    const response = await api.get(`/courses/${id}`);
    return response.data;
  },

  createCourse: async (data: Partial<Course>): Promise<Course> => {
    const response = await api.post('/courses', data);
    return response.data;
  },

  updateCourse: async (id: string, data: Partial<Course>): Promise<Course> => {
    const response = await api.put(`/courses/${id}`, data);
    return response.data;
  },

  deleteCourse: async (id: string): Promise<void> => {
    await api.delete(`/courses/${id}`);
  },

  enrollCourse: async (id: string) => {
    const response = await api.post(`/courses/${id}/enroll`);
    return response.data;
  },

  unenrollCourse: async (id: string) => {
    await api.delete(`/courses/${id}/enroll`);
  },

  getEnrolledCourses: async (params?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Course>> => {
    const response = await api.get('/courses/enrolled', { params });
    return response.data;
  },

  // Module operations
  createModule: async (data: Partial<Module>): Promise<Module> => {
    const response = await api.post('/courses/modules', data);
    return response.data;
  },

  updateModule: async (id: string, data: Partial<Module>): Promise<Module> => {
    const response = await api.put(`/courses/modules/${id}`, data);
    return response.data;
  },

  deleteModule: async (id: string): Promise<void> => {
    await api.delete(`/courses/modules/${id}`);
  },

  // Lesson operations
  createLesson: async (data: Partial<Lesson>): Promise<Lesson> => {
    const response = await api.post('/courses/lessons', data);
    return response.data;
  },

  getLesson: async (id: string): Promise<Lesson> => {
    const response = await api.get(`/courses/lessons/${id}`);
    return response.data;
  },

  updateLesson: async (id: string, data: Partial<Lesson>): Promise<Lesson> => {
    const response = await api.put(`/courses/lessons/${id}`, data);
    return response.data;
  },

  deleteLesson: async (id: string): Promise<void> => {
    await api.delete(`/courses/lessons/${id}`);
  },

  markLessonComplete: async (id: string) => {
    const response = await api.post(`/courses/lessons/${id}/complete`);
    return response.data;
  },
};
