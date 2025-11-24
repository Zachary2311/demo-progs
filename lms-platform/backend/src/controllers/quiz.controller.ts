import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import logger from '../utils/logger';

export class QuizController {
  static async createQuiz(req: AuthRequest, res: Response) {
    try {
      const {
        lessonId,
        title,
        description,
        timeLimit,
        passingScore,
        maxAttempts,
        randomizeQuestions,
        showCorrectAnswers,
        questions,
      } = req.body;

      let lesson;
      if (lessonId) {
        lesson = await prisma.lesson.findUnique({
          where: { id: lessonId },
          include: {
            module: {
              include: { course: true },
            },
          },
        });

        if (!lesson) {
          return res.status(404).json({ error: 'Lesson not found' });
        }

        // Check permissions
        const isInstructor = lesson.module.course.instructorId === req.user!.userId;
        const isAdmin = req.user!.roles.includes('admin');

        if (!isInstructor && !isAdmin) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      const quiz = await prisma.quiz.create({
        data: {
          lessonId,
          title,
          description,
          timeLimit,
          passingScore,
          maxAttempts,
          randomizeQuestions,
          showCorrectAnswers,
          questions: {
            create: questions.map((q: any, index: number) => ({
              questionText: q.questionText,
              questionType: q.questionType,
              options: q.options ? JSON.stringify(q.options) : null,
              correctAnswer: JSON.stringify(q.correctAnswer),
              explanation: q.explanation,
              points: q.points || 1,
              orderIndex: index,
            })),
          },
        },
        include: {
          questions: true,
        },
      });

      logger.info(`Quiz created: ${quiz.title} (${quiz.id})`);
      res.status(201).json(quiz);
    } catch (error) {
      logger.error('Create quiz error:', error);
      res.status(500).json({ error: 'Failed to create quiz' });
    }
  }

  static async getQuiz(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const quiz = await prisma.quiz.findUnique({
        where: { id },
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              questionText: true,
              questionType: true,
              options: true,
              points: true,
              orderIndex: true,
              explanation: true,
              // Don't include correctAnswer for students
            },
          },
        },
      });

      if (!quiz) {
        return res.status(404).json({ error: 'Quiz not found' });
      }

      res.json(quiz);
    } catch (error) {
      logger.error('Get quiz error:', error);
      res.status(500).json({ error: 'Failed to fetch quiz' });
    }
  }

  static async startQuiz(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const quiz = await prisma.quiz.findUnique({
        where: { id },
        include: {
          questions: true,
        },
      });

      if (!quiz) {
        return res.status(404).json({ error: 'Quiz not found' });
      }

      // Check attempt limit
      const attemptCount = await prisma.quizAttempt.count({
        where: {
          quizId: id,
          userId,
        },
      });

      if (attemptCount >= quiz.maxAttempts) {
        return res.status(400).json({ error: 'Maximum attempts reached' });
      }

      const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);

      const attempt = await prisma.quizAttempt.create({
        data: {
          quizId: id,
          userId,
          maxScore,
        },
      });

      // Log analytics
      await prisma.analyticsEvent.create({
        data: {
          userId,
          eventType: 'quiz_start',
          metadata: JSON.stringify({ quizId: id, attemptId: attempt.id }),
        },
      });

      logger.info(`Quiz attempt started: ${id} by user ${userId}`);
      res.status(201).json(attempt);
    } catch (error) {
      logger.error('Start quiz error:', error);
      res.status(500).json({ error: 'Failed to start quiz' });
    }
  }

  static async submitQuiz(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { attemptId, answers } = req.body;
      const userId = req.user!.userId;

      const attempt = await prisma.quizAttempt.findUnique({
        where: { id: attemptId },
        include: {
          quiz: {
            include: {
              questions: true,
            },
          },
        },
      });

      if (!attempt) {
        return res.status(404).json({ error: 'Quiz attempt not found' });
      }

      if (attempt.userId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (attempt.completedAt) {
        return res.status(400).json({ error: 'Quiz already submitted' });
      }

      let totalScore = 0;

      // Grade answers
      const gradedAnswers = await Promise.all(
        answers.map(async (answer: any) => {
          const question = attempt.quiz.questions.find((q) => q.id === answer.questionId);

          if (!question) {
            throw new Error(`Question ${answer.questionId} not found`);
          }

          let isCorrect = false;
          let pointsEarned = 0;

          const correctAnswer = JSON.parse(question.correctAnswer);
          const studentAnswer = answer.answer;

          if (question.questionType === 'multiple_choice' || question.questionType === 'true_false') {
            isCorrect = studentAnswer === correctAnswer;
            pointsEarned = isCorrect ? question.points : 0;
          } else if (question.questionType === 'short_answer') {
            // For short answers, manual grading might be needed
            // For now, we'll do a simple case-insensitive comparison
            isCorrect = studentAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
            pointsEarned = isCorrect ? question.points : 0;
          }

          totalScore += pointsEarned;

          return await prisma.quizAnswer.create({
            data: {
              attemptId,
              questionId: question.id,
              answer: JSON.stringify(studentAnswer),
              isCorrect,
              pointsEarned,
            },
          });
        })
      );

      const isPassed = (totalScore / attempt.maxScore) * 100 >= attempt.quiz.passingScore;

      // Update attempt
      const updatedAttempt = await prisma.quizAttempt.update({
        where: { id: attemptId },
        data: {
          score: totalScore,
          isPassed,
          completedAt: new Date(),
        },
        include: {
          quiz: true,
          answers: {
            include: {
              question: true,
            },
          },
        },
      });

      // Log analytics
      await prisma.analyticsEvent.create({
        data: {
          userId,
          eventType: 'quiz_complete',
          metadata: JSON.stringify({
            quizId: id,
            attemptId,
            score: totalScore,
            isPassed,
          }),
        },
      });

      logger.info(`Quiz submitted: ${id} by user ${userId}, score: ${totalScore}/${attempt.maxScore}`);
      res.json(updatedAttempt);
    } catch (error) {
      logger.error('Submit quiz error:', error);
      res.status(500).json({ error: 'Failed to submit quiz' });
    }
  }

  static async getQuizAttempts(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const attempts = await prisma.quizAttempt.findMany({
        where: {
          quizId: id,
          userId,
        },
        include: {
          answers: {
            include: {
              question: true,
            },
          },
        },
        orderBy: { startedAt: 'desc' },
      });

      res.json(attempts);
    } catch (error) {
      logger.error('Get quiz attempts error:', error);
      res.status(500).json({ error: 'Failed to fetch quiz attempts' });
    }
  }
}
