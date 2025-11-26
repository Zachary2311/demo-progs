import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  Grid,
  Typography,
  CircularProgress,
  LinearProgress,
  Button,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../utils/api';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [analytics, setAnalytics] = useState<any>(null);
  const [enrolledCourses, setEnrolledCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [analyticsData, coursesData] = await Promise.all([
          apiClient.getStudentAnalytics(),
          apiClient.getCourses(1, 10),
        ]);
        setAnalytics(analyticsData);
        setEnrolledCourses(coursesData.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return <CircularProgress />;
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 'bold' }}>
        Welcome, {user?.username}!
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography color="textSecondary" gutterBottom>
              Courses Enrolled
            </Typography>
            <Typography variant="h5">{analytics?.enrolledCoursesCount || 0}</Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography color="textSecondary" gutterBottom>
              Lessons Completed
            </Typography>
            <Typography variant="h5">{analytics?.completedLessonsCount || 0}</Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography color="textSecondary" gutterBottom>
              Average Grade
            </Typography>
            <Typography variant="h5">{analytics?.averageGrade?.toFixed(2) || 'N/A'}%</Typography>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ p: 2 }}>
            <Typography color="textSecondary" gutterBottom>
              Time Spent
            </Typography>
            <Typography variant="h5">{analytics?.totalTimeSpentHours || 0}h</Typography>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
        Enrolled Courses
      </Typography>

      <Grid container spacing={2}>
        {enrolledCourses.map((course) => (
          <Grid item xs={12} sm={6} md={4} key={course.id}>
            <Card
              sx={{
                cursor: 'pointer',
                '&:hover': { boxShadow: 3 },
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={() => navigate(`/courses/${course.id}`)}
            >
              {course.thumbnailUrl && (
                <Box
                  component="img"
                  src={course.thumbnailUrl}
                  sx={{ width: '100%', height: 200, objectFit: 'cover' }}
                />
              )}
              <Box sx={{ p: 2, flexGrow: 1 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {course.title}
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  {course.description?.substring(0, 100)}...
                </Typography>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="textSecondary">
                    Progress
                  </Typography>
                  <LinearProgress variant="determinate" value={course.completionPercentage || 0} />
                </Box>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Button
          variant="outlined"
          size="large"
          onClick={() => navigate('/courses')}
        >
          Browse All Courses
        </Button>
      </Box>
    </Box>
  );
};

export default DashboardPage;
