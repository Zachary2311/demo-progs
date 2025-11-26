import React, { useState } from 'react';
import { Box, Button, Card, TextField, Typography, Alert } from '@mui/material';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../utils/api';

const ProfilePage: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    try {
      setSaving(true);
      const updated = await apiClient.updateProfile(username, email);
      setUser(updated);
      setMessage('Profile updated successfully');
    } catch (error) {
      setMessage('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        Profile Settings
      </Typography>

      <Card sx={{ p: 4, maxWidth: 600 }}>
        {message && <Alert severity={message.includes('successfully') ? 'success' : 'error'} sx={{ mb: 2 }}>{message}</Alert>}

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <img src={user?.avatarUrl} alt={user?.username} style={{ width: 80, height: 80, borderRadius: '50%' }} />
            <Box>
              <Typography variant="body2" color="textSecondary">Discord ID</Typography>
              <Typography>{user?.discordId}</Typography>
            </Box>
          </Box>
        </Box>

        <TextField
          fullWidth
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mb: 2 }}
        />

        <Box sx={{ mb: 3, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Box>
            <Typography variant="caption" color="textSecondary">Roles</Typography>
            <Typography>{user?.roles.join(', ')}</Typography>
          </Box>
        </Box>

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          fullWidth
        >
          Save Changes
        </Button>
      </Card>
    </Box>
  );
};

export default ProfilePage;
