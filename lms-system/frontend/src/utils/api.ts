import axios, { AxiosInstance, AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add token to requests
    this.client.interceptors.request.use((config) => {
      const { accessToken } = useAuthStore.getState();
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    });

    // Handle token refresh on 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest: any = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          const { refreshToken } = useAuthStore.getState();

          if (refreshToken) {
            try {
              const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                refreshToken,
              });

              const { accessToken: newAccessToken } = response.data;
              useAuthStore.setState({ accessToken: newAccessToken });

              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              return this.client(originalRequest);
            } catch (refreshError) {
              useAuthStore.getState().logout();
            }
          } else {
            useAuthStore.getState().logout();
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  getLoginUrl = async () => {
    const { data } = await this.client.get('/auth/discord/login');
    return data.loginUrl;
  };

  discordCallback = async (code: string) => {
    const { data } = await this.client.post('/auth/discord/callback', { code });
    return data;
  };

  getCurrentUser = async () => {
    const { data } = await this.client.get('/auth/me');
    return data;
  };

  updateProfile = async (username: string, email: string) => {
    const { data } = await this.client.put('/auth/profile', { username, email });
    return data;
  };

  logout = async () => {
    await this.client.post('/auth/logout');
  };

  // Courses
  getCourses = async (page = 1, limit = 10, filters?: any) => {
    const { data } = await this.client.get('/courses', {
      params: { page, limit, ...filters },
    });
    return data;
  };

  getCourse = async (id: string) => {
    const { data } = await this.client.get(`/courses/${id}`);
    return data;
  };

  createCourse = async (course: any) => {
    const { data } = await this.client.post('/courses', course);
    return data;
  };

  updateCourse = async (id: string, course: any) => {
    const { data } = await this.client.put(`/courses/${id}`, course);
    return data;
  };

  enrollCourse = async (courseId: string) => {
    const { data } = await this.client.post(`/courses/${courseId}/enroll`);
    return data;
  };

  getCourseAnalytics = async (courseId: string) => {
    const { data } = await this.client.get(`/courses/${courseId}/analytics`);
    return data;
  };

  // Lessons
  getLesson = async (id: string) => {
    const { data } = await this.client.get(`/lessons/${id}`);
    return data;
  };

  createLesson = async (lesson: any) => {
    const { data } = await this.client.post('/lessons', lesson);
    return data;
  };

  updateLesson = async (id: string, lesson: any) => {
    const { data } = await this.client.put(`/lessons/${id}`, lesson);
    return data;
  };

  completeLesson = async (lessonId: string) => {
    const { data } = await this.client.post(`/lessons/${lessonId}/complete`);
    return data;
  };

  getLessonCompletion = async (lessonId: string) => {
    const { data } = await this.client.get(`/lessons/${lessonId}/completion`);
    return data;
  };

  // Quizzes
  getQuiz = async (id: string) => {
    const { data } = await this.client.get(`/quizzes/${id}`);
    return data;
  };

  createQuiz = async (quiz: any) => {
    const { data } = await this.client.post('/quizzes', quiz);
    return data;
  };

  addQuizQuestion = async (quizId: string, question: any) => {
    const { data } = await this.client.post(`/quizzes/${quizId}/questions`, question);
    return data;
  };

  startQuizAttempt = async (quizId: string) => {
    const { data } = await this.client.post(`/quizzes/${quizId}/attempts`);
    return data;
  };

  submitQuizAnswer = async (attemptId: string, answer: any) => {
    const { data } = await this.client.post(`/quizzes/${attemptId}/answers`, answer);
    return data;
  };

  submitQuizAttempt = async (attemptId: string) => {
    const { data } = await this.client.post(`/quizzes/${attemptId}/submit`);
    return data;
  };

  getMyQuizAttempts = async (quizId: string) => {
    const { data } = await this.client.get(`/quizzes/${quizId}/my-attempts`);
    return data;
  };

  // Assignments
  createAssignment = async (assignment: any) => {
    const { data } = await this.client.post('/assignments', assignment);
    return data;
  };

  getAssignment = async (id: string) => {
    const { data } = await this.client.get(`/assignments/${id}`);
    return data;
  };

  getSubmissions = async (assignmentId: string) => {
    const { data } = await this.client.get(`/assignments/${assignmentId}/submissions`);
    return data;
  };

  submitAssignment = async (assignmentId: string, submission: any) => {
    const { data } = await this.client.post(`/assignments/${assignmentId}/submit`, submission);
    return data;
  };

  gradeSubmission = async (submissionId: string, grading: any) => {
    const { data } = await this.client.post(`/assignments/${submissionId}/grade`, grading);
    return data;
  };

  getMySubmission = async (assignmentId: string) => {
    const { data } = await this.client.get(`/assignments/${assignmentId}/my-submission`);
    return data;
  };

  // Grades
  getCourseGrades = async (courseId: string) => {
    const { data } = await this.client.get(`/grades/course/${courseId}`);
    return data;
  };

  getGradebook = async (courseId: string) => {
    const { data } = await this.client.get(`/grades/course/${courseId}/gradebook`);
    return data;
  };

  exportGradebook = async (courseId: string) => {
    const { data } = await this.client.get(`/grades/${courseId}/export-csv`);
    return data;
  };

  // Users
  getAllUsers = async (page = 1, limit = 10, filters?: any) => {
    const { data } = await this.client.get('/users', {
      params: { page, limit, ...filters },
    });
    return data;
  };

  getUser = async (id: string) => {
    const { data } = await this.client.get(`/users/${id}`);
    return data;
  };

  assignRole = async (userId: string, roleId: string) => {
    const { data } = await this.client.post(`/users/${userId}/roles/${roleId}`);
    return data;
  };

  removeRole = async (userId: string, roleId: string) => {
    const { data } = await this.client.delete(`/users/${userId}/roles/${roleId}`);
    return data;
  };

  updateUserStatus = async (userId: string, status: string) => {
    const { data } = await this.client.patch(`/users/${userId}/status`, { status });
    return data;
  };

  getUserCourses = async (userId: string) => {
    const { data } = await this.client.get(`/users/${userId}/courses`);
    return data;
  };

  // Analytics
  logEvent = async (eventType: string, eventData?: any) => {
    const { data } = await this.client.post('/analytics/events', {
      eventType,
      eventData,
    });
    return data;
  };

  getCourseAnalyticsData = async (courseId: string) => {
    const { data } = await this.client.get(`/analytics/course/${courseId}`);
    return data;
  };

  getStudentAnalytics = async () => {
    const { data } = await this.client.get('/analytics/student/me');
    return data;
  };

  getAdminDashboard = async () => {
    const { data } = await this.client.get('/analytics/admin/dashboard');
    return data;
  };
}

export const apiClient = new ApiClient();
