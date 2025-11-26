import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        textAlign: 'center',
      }}
    >
      <Typography variant="h1" sx={{ fontWeight: 'bold', mb: 2 }}>
        404
      </Typography>
      <Typography variant="h5" sx={{ mb: 3, color: 'text.secondary' }}>
        Page Not Found
      </Typography>
      <Button variant="contained" onClick={() => navigate('/')}>
        Go Back Home
      </Button>
    </Box>
  );
};

export default NotFoundPage;
