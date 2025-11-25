import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useAuthStore } from './store/authStore';
import { apiClient } from './utils/api';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CoursesPage from './pages/CoursesPage';
import CourseDetailPage from './pages/CourseDetailPage';
import LessonPage from './pages/LessonPage';
import QuizPage from './pages/QuizPage';
import AssignmentPage from './pages/AssignmentPage';
import GradeBookPage from './pages/GradeBookPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import ProfilePage from './pages/ProfilePage';
import InstructorDashboardPage from './pages/InstructorDashboardPage';
import NotFoundPage from './pages/NotFoundPage';

// Components
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';

const theme = createTheme({
  palette: {
    primary: {
      main: '#6366f1', // Indigo
    },
    secondary: {
      main: '#ec4899', // Pink
    },
    background: {
      default: '#f9fafb',
    },
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
  },
});

const App: React.FC = () => {
  const { setUser, setTokens } = useAuthStore();

  useEffect(() => {
    // Check if user is logged in
    const checkAuth = async () => {
      try {
        const { accessToken, refreshToken } = useAuthStore.getState();
        if (accessToken) {
          const user = await apiClient.getCurrentUser();
          setUser(user);
        }
      } catch (error) {
        // Not authenticated
      }
    };

    checkAuth();
  }, [setUser, setTokens]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/*"
            element={
              <PrivateRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/courses" element={<CoursesPage />} />
                    <Route path="/courses/:id" element={<CourseDetailPage />} />
                    <Route path="/lessons/:id" element={<LessonPage />} />
                    <Route path="/quizzes/:id" element={<QuizPage />} />
                    <Route path="/assignments/:id" element={<AssignmentPage />} />
                    <Route path="/gradebook/:courseId" element={<GradeBookPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/instructor" element={<InstructorDashboardPage />} />
                    <Route path="/admin" element={<AdminDashboardPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
