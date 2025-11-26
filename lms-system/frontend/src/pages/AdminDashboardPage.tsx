import React, { useEffect, useState } from 'react';
import { Box, Card, CircularProgress, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { apiClient } from '../utils/api';

const AdminDashboardPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const data = await apiClient.getAdminDashboard();
        setDashboard(data);
      } catch (error) {
        console.error('Failed to fetch dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 4 }}>
        Admin Dashboard
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography color="textSecondary" gutterBottom>Total Users</Typography>
            <Typography variant="h5">{dashboard?.users?.total || 0}</Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography color="textSecondary" gutterBottom>Total Courses</Typography>
            <Typography variant="h5">{dashboard?.courses?.total || 0}</Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography color="textSecondary" gutterBottom>Total Enrollments</Typography>
            <Typography variant="h5">{dashboard?.enrollments || 0}</Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography color="textSecondary" gutterBottom>Pending Submissions</Typography>
            <Typography variant="h5">{dashboard?.submissions?.pending || 0}</Typography>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
          Top Courses
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell>Course</TableCell>
                <TableCell align="right">Enrollments</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dashboard?.topCourses?.map((course: any) => (
                <TableRow key={course.id}>
                  <TableCell>{course.title}</TableCell>
                  <TableCell align="right">{course.enrollmentCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Card sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
          Recent Activity
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell>Event</TableCell>
                <TableCell>User</TableCell>
                <TableCell align="right">Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dashboard?.recentActivity?.map((event: any, idx: number) => (
                <TableRow key={idx}>
                  <TableCell>{event.eventType}</TableCell>
                  <TableCell>{event.user}</TableCell>
                  <TableCell align="right">{new Date(event.timestamp).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
};

export default AdminDashboardPage;
