import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Container,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../utils/api';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser, setTokens } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Handle Discord OAuth callback
    const code = searchParams.get('code');
    if (code) {
      handleDiscordCallback(code);
    }
  }, [searchParams]);

  const handleDiscordCallback = async (code: string) => {
    try {
      setLoading(true);
      const { accessToken, refreshToken, user } = await apiClient.discordCallback(code);
      setTokens(accessToken, refreshToken);
      setUser(user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscordLogin = async () => {
    try {
      const loginUrl = await apiClient.getLoginUrl();
      window.location.href = loginUrl;
    } catch (err) {
      setError('Failed to get login URL');
    }
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Card sx={{ p: 4, width: '100%', textAlign: 'center' }}>
          <Typography variant="h3" sx={{ mb: 2, fontWeight: 'bold', color: 'primary.main' }}>
            LMS
          </Typography>
          <Typography variant="h5" sx={{ mb: 4, color: 'text.secondary' }}>
            Learning Management System
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {!loading && (
            <>
              <Typography variant="body1" sx={{ mb: 4, color: 'text.secondary' }}>
                Sign in with your Discord account to continue
              </Typography>
              <Button
                variant="contained"
                size="large"
                fullWidth
                onClick={handleDiscordLogin}
                sx={{
                  background: '#5865F2',
                  '&:hover': {
                    background: '#4752C4',
                  },
                }}
              >
                Continue with Discord
              </Button>
            </>
          )}

          <Box sx={{ mt: 4, pt: 2, borderTop: '1px solid #e0e0e0' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              By signing in, you agree to our Terms of Service and Privacy Policy
            </Typography>
          </Box>
        </Card>
      </Box>
    </Container>
  );
};

export default LoginPage;
