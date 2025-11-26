import React, { useEffect, useState } from 'react';
import { Box, Card, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Button } from '@mui/material';
import { useParams } from 'react-router-dom';
import { apiClient } from '../utils/api';

const GradeBookPage: React.FC = () => {
  const { courseId } = useParams();
  const [grades, setGrades] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const data = await apiClient.getCourseGrades(courseId!);
        setGrades(data);
      } catch (error) {
        console.error('Failed to fetch grades:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGrades();
  }, [courseId]);

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        Gradebook
      </Typography>

      {grades && (
        <Card sx={{ mb: 3, p: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box>
              <Typography variant="caption" color="textSecondary">Overall Grade</Typography>
              <Typography variant="h5">{grades.overallPercentage?.toFixed(2)}%</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="textSecondary">Letter Grade</Typography>
              <Typography variant="h5">{grades.letterGrade}</Typography>
            </Box>
          </Box>
        </Card>
      )}

      <TableContainer component={Card}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell><Typography sx={{ fontWeight: 'bold' }}>Assignment/Quiz</Typography></TableCell>
              <TableCell align="right"><Typography sx={{ fontWeight: 'bold' }}>Points</Typography></TableCell>
              <TableCell align="right"><Typography sx={{ fontWeight: 'bold' }}>Percentage</Typography></TableCell>
              <TableCell align="right"><Typography sx={{ fontWeight: 'bold' }}>Grade</Typography></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {grades?.grades?.map((grade: any) => (
              <TableRow key={grade.id}>
                <TableCell>
                  {grade.submission?.assignment?.title || grade.quizAttempt?.quiz?.title}
                </TableCell>
                <TableCell align="right">{grade.points?.toFixed(2) || 'N/A'}</TableCell>
                <TableCell align="right">{grade.percentage?.toFixed(2) || 'N/A'}%</TableCell>
                <TableCell align="right">{grade.letterGrade}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 3 }}>
        <Button variant="outlined" onClick={() => apiClient.exportGradebook(courseId!)}>
          Export as CSV
        </Button>
      </Box>
    </Box>
  );
};

export default GradeBookPage;
