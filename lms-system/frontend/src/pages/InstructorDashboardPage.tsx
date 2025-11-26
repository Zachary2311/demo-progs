import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CircularProgress, Grid, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/api';

const InstructorDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const data = await apiClient.getCourses(1, 10);
        setCourses(data.data);
      } catch (error) {
        console.error('Failed to fetch courses:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Instructor Dashboard
        </Typography>
        <Button variant="contained" onClick={() => navigate('/courses')}>
          Create New Course
        </Button>
      </Box>

      <Grid container spacing={3}>
        {courses.map((course) => (
          <Grid item xs={12} sm={6} md={4} key={course.id}>
            <Card sx={{ p: 3, cursor: 'pointer', '&:hover': { boxShadow: 3 } }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
                {course.title}
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                {course.description?.substring(0, 100)}...
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                <Box>
                  <Typography variant="caption" color="textSecondary">Students</Typography>
                  <Typography variant="h6">{course._count?.enrollments || 0}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="textSecondary">Modules</Typography>
                  <Typography variant="h6">{course._count?.modules || 0}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" fullWidth onClick={() => navigate(`/courses/${course.id}`)}>
                  View
                </Button>
                <Button size="small" variant="contained" fullWidth onClick={() => navigate(`/gradebook/${course.id}`)}>
                  Gradebook
                </Button>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default InstructorDashboardPage;
