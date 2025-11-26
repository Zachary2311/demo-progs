import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CircularProgress, Grid, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/api';

const CourseDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const data = await apiClient.getCourse(id!);
        setCourse(data);
      } catch (error) {
        console.error('Failed to fetch course:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [id]);

  if (loading) return <CircularProgress />;
  if (!course) return <Typography>Course not found</Typography>;

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        {course.thumbnailUrl && (
          <Box
            component="img"
            src={course.thumbnailUrl}
            sx={{ width: '100%', height: 300, objectFit: 'cover', borderRadius: 1, mb: 3 }}
          />
        )}
        <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 2 }}>
          {course.title}
        </Typography>
        <Typography variant="body1" paragraph>
          {course.description}
        </Typography>
        <Button variant="contained" size="large">
          Enroll in Course
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
              Course Content
            </Typography>
            {course.modules && course.modules.length > 0 ? (
              course.modules.map((module: any, idx: number) => (
                <Box key={module.id} sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Module {idx + 1}: {module.title}
                  </Typography>
                  <List>
                    {module.lessons?.map((lesson: any) => (
                      <ListItem key={lesson.id} disablePadding>
                        <ListItemButton onClick={() => navigate(`/lessons/${lesson.id}`)}>
                          <ListItemText primary={lesson.title} />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              ))
            ) : (
              <Typography color="textSecondary">No modules available yet</Typography>
            )}
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
              Course Info
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="textSecondary">Instructor</Typography>
              <Typography>{course.instructor?.username}</Typography>
            </Box>
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="textSecondary">Students Enrolled</Typography>
              <Typography>{course._count?.enrollments || 0}</Typography>
            </Box>
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="textSecondary">Category</Typography>
              <Typography>{course.category || 'General'}</Typography>
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CourseDetailPage;
