import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CircularProgress, TextField, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { apiClient } from '../utils/api';

const AssignmentPage: React.FC = () => {
  const { id } = useParams();
  const [assignment, setAssignment] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [assignmentData, submissionData] = await Promise.all([
          apiClient.getAssignment(id!),
          apiClient.getMySubmission(id!),
        ]);
        setAssignment(assignmentData);
        setSubmission(submissionData);
      } catch (error) {
        console.error('Failed to fetch assignment:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleSubmit = async () => {
    try {
      await apiClient.submitAssignment(id!, { submissionText: text });
      alert('Assignment submitted successfully!');
      setText('');
    } catch (error) {
      console.error('Failed to submit assignment:', error);
    }
  };

  if (loading) return <CircularProgress />;
  if (!assignment) return <Typography>Assignment not found</Typography>;

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 3 }}>
        {assignment.title}
      </Typography>

      <Card sx={{ p: 3, mb: 3 }}>
        <Typography variant="body1" paragraph>
          {assignment.description}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="caption" color="textSecondary">Total Points</Typography>
            <Typography variant="h6">{assignment.totalPoints}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="textSecondary">Due Date</Typography>
            <Typography variant="h6">
              {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No due date'}
            </Typography>
          </Box>
        </Box>
      </Card>

      {submission && submission.status !== 'DRAFT' ? (
        <Card sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
            Your Submission
          </Typography>
          <Typography>Status: {submission.status}</Typography>
          {submission.grades?.[0] && (
            <>
              <Typography>Grade: {submission.grades[0].points}/{assignment.totalPoints}</Typography>
              <Typography>Feedback: {submission.grades[0].feedback}</Typography>
            </>
          )}
        </Card>
      ) : (
        <Card sx={{ p: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={6}
            placeholder="Enter your submission"
            value={text}
            onChange={(e) => setText(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button variant="contained" onClick={handleSubmit}>
            Submit Assignment
          </Button>
        </Card>
      )}
    </Box>
  );
};

export default AssignmentPage;
