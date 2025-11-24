import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { quizService } from '../../services/quiz.service';

const QuizView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data: quiz } = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => quizService.getQuiz(id!),
    enabled: !!id,
  });

  const startMutation = useMutation({
    mutationFn: () => quizService.startQuiz(id!),
    onSuccess: (data) => {
      setAttemptId(data.id);
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const answerArray = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));
      return quizService.submitQuiz(id!, { attemptId: attemptId!, answers: answerArray });
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });

  const handleAnswerChange = (questionId: string, answer: any) => {
    setAnswers({ ...answers, [questionId]: answer });
  };

  const handleSubmit = () => {
    if (window.confirm('Are you sure you want to submit your answers?')) {
      submitMutation.mutate();
    }
  };

  if (!quiz) {
    return <div>Loading...</div>;
  }

  if (!attemptId) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{quiz.title}</h1>
          {quiz.description && (
            <p className="text-gray-600 mb-6">{quiz.description}</p>
          )}
          <div className="space-y-2 mb-6">
            <p className="text-sm text-gray-600">Passing Score: {quiz.passingScore}%</p>
            <p className="text-sm text-gray-600">Max Attempts: {quiz.maxAttempts}</p>
            {quiz.timeLimit && (
              <p className="text-sm text-gray-600">Time Limit: {quiz.timeLimit} minutes</p>
            )}
          </div>
          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="w-full bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium"
          >
            {startMutation.isPending ? 'Starting...' : 'Start Quiz'}
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Quiz Submitted!</h2>
          <p className="text-gray-600">Your answers have been submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{quiz.title}</h1>

        <div className="space-y-8">
          {quiz.questions?.map((question, index) => (
            <div key={question.id} className="border-b border-gray-200 pb-6">
              <p className="text-lg font-medium text-gray-900 mb-4">
                {index + 1}. {question.questionText}
              </p>

              {question.questionType === 'multiple_choice' && question.options && (
                <div className="space-y-2">
                  {JSON.parse(question.options).map((option: string, optIndex: number) => (
                    <label key={optIndex} className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name={question.id}
                        value={option}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        className="text-primary-600"
                      />
                      <span className="text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
              )}

              {question.questionType === 'true_false' && (
                <div className="space-y-2">
                  {['True', 'False'].map((option) => (
                    <label key={option} className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name={question.id}
                        value={option}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        className="text-primary-600"
                      />
                      <span className="text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
              )}

              {question.questionType === 'short_answer' && (
                <textarea
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={3}
                  placeholder="Enter your answer..."
                />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
          className="w-full mt-8 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium"
        >
          {submitMutation.isPending ? 'Submitting...' : 'Submit Quiz'}
        </button>
      </div>
    </div>
  );
};

export default QuizView;
