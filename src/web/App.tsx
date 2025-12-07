import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore, useChatStore, useToastStore } from './store';
import { authApi, chatApi } from './api';
import Layout from './components/Layout';
import Chat from './pages/Chat';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Admin from './pages/Admin';
import Toast from './components/Toast';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!user?.isAdmin) return <Navigate to="/" />;
  
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, setAuth, clearAuth } = useAuthStore();
  const { setSettings } = useChatStore();
  const { addToast } = useToastStore();

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (isAuthenticated) {
        const result = await authApi.me();
        if (result.success && result.data) {
          // Token is still valid
        } else {
          // Token expired
          clearAuth();
        }
      }
    };

    checkAuth();
  }, [isAuthenticated, clearAuth]);

  // Fetch settings when authenticated
  useEffect(() => {
    const fetchSettings = async () => {
      if (isAuthenticated) {
        const result = await chatApi.getSettings();
        if (result.success && result.data) {
          setSettings(result.data);
        }
      }
    };

    fetchSettings();
  }, [isAuthenticated, setSettings]);

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout>
                <Chat />
              </Layout>
            </PrivateRoute>
          }
        />
        
        <Route
          path="/chat/:conversationId?"
          element={
            <PrivateRoute>
              <Layout>
                <Chat />
              </Layout>
            </PrivateRoute>
          }
        />
        
        <Route
          path="/admin/*"
          element={
            <AdminRoute>
              <Layout>
                <Admin />
              </Layout>
            </AdminRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      
      <Toast />
    </>
  );
}
