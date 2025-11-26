import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CircularProgress, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { apiClient } from '../utils/api';

const LessonPage: React.FC = () => {
  const { id } = useParams();
  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLesson = async () => {
      try {
        const data = await apiClient.getLesson(id!);
        setLesson(data);
        await apiClient.logEvent('LESSON_VIEWED', { lessonId: id });
      } catch (error) {
        console.error('Failed to fetch lesson:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLesson();
  }, [id]);

  const handleCompleteLesson = async () => {
    try {
      await apiClient.completeLesson(id!);
      alert('Lesson marked as complete!');
    } catch (error) {
      console.error('Failed to complete lesson:', error);
    }
  };

  if (loading) return <CircularProgress />;
  if (!lesson) return <Typography>Lesson not found</Typography>;

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        {lesson.title}
      </Typography>

      <Card sx={{ p: 4, mb: 3 }}>
        <div
          dangerouslySetInnerHTML={{ __html: lesson.content }}
          style={{ marginBottom: 20 }}
        />
        <Button variant="contained" color="success" onClick={handleCompleteLesson}>
          Mark as Complete
        </Button>
      </Card>

      {lesson.quizzes && lesson.quizzes.length > 0 && (
        <Card sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
            Quizzes
          </Typography>
          {lesson.quizzes.map((quiz: any) => (
            <Box key={quiz.id} sx={{ mb: 2 }}>
              <Typography>{quiz.title}</Typography>
              <Button size="small" variant="outlined">
                Take Quiz
              </Button>
            </Box>
          ))}
        </Card>
      )}
    </Box>
  );
};

export default LessonPage;
