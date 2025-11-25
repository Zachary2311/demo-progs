import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CircularProgress, Radio, FormControlLabel, Typography, RadioGroup } from '@mui/material';
import { useParams } from 'react-router-dom';
import { apiClient } from '../utils/api';

const QuizPage: React.FC = () => {
  const { id } = useParams();
  const [quiz, setQuiz] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<any>({});

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const quizData = await apiClient.getQuiz(id!);
        setQuiz(quizData);
      } catch (error) {
        console.error('Failed to fetch quiz:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
  }, [id]);

  const handleStartQuiz = async () => {
    try {
      const attemptData = await apiClient.startQuizAttempt(id!);
      setAttempt(attemptData);
    } catch (error) {
      console.error('Failed to start quiz:', error);
    }
  };

  const handleAnswerChange = (questionId: string, optionId: string) => {
    setAnswers({ ...answers, [questionId]: optionId });
  };

  const handleSubmitQuiz = async () => {
    try {
      for (const [questionId, optionId] of Object.entries(answers)) {
        await apiClient.submitQuizAnswer(attempt.id, {
          questionId: Number(questionId),
          selectedOptionId: optionId,
        });
      }
      await apiClient.submitQuizAttempt(attempt.id);
      alert('Quiz submitted successfully!');
    } catch (error) {
      console.error('Failed to submit quiz:', error);
    }
  };

  if (loading) return <CircularProgress />;
  if (!quiz) return <Typography>Quiz not found</Typography>;

  if (!attempt) {
    return (
      <Box>
        <Card sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 2 }}>
            {quiz.title}
          </Typography>
          <Typography variant="body1" paragraph>
            {quiz.description}
          </Typography>
          <Typography variant="body2" color="textSecondary" paragraph>
            Total Points: {quiz.totalPoints} | Passing: {quiz.passingPercentage}%
            {quiz.timeLimitMinutes && ` | Time Limit: ${quiz.timeLimitMinutes} minutes`}
          </Typography>
          <Button variant="contained" onClick={handleStartQuiz}>
            Start Quiz
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 3 }}>
        {quiz.title}
      </Typography>

      {quiz.questions?.map((question: any, idx: number) => (
        <Card key={question.id} sx={{ p: 3, mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 2 }}>
            {idx + 1}. {question.questionText}
          </Typography>

          {question.questionType === 'MULTIPLE_CHOICE' && (
            <RadioGroup
              value={answers[question.id] || ''}
              onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            >
              {question.options?.map((option: any) => (
                <FormControlLabel
                  key={option.id}
                  value={option.id}
                  control={<Radio />}
                  label={option.optionText}
                />
              ))}
            </RadioGroup>
          )}
        </Card>
      ))}

      <Button variant="contained" color="success" onClick={handleSubmitQuiz} size="large">
        Submit Quiz
      </Button>
    </Box>
  );
};

export default QuizPage;
