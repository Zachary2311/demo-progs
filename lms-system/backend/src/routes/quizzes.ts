import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

// Create quiz
router.post('/', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        lessonId,
        title,
        description,
        totalPoints,
        passingPercentage,
        shuffleQuestions,
        showAnswersAfterSubmission,
        timeLimitMinutes,
        retryLimit
      } = req.body;

      if (!title) throw new AppError(400, 'Title is required');

      const quiz = await prisma.quiz.create({
        data: {
          lessonId: lessonId ? BigInt(lessonId) : null,
          title,
          description,
          totalPoints: totalPoints || 100,
          passingPercentage: passingPercentage || 70,
          shuffleQuestions: shuffleQuestions || false,
          showAnswersAfterSubmission: showAnswersAfterSubmission !== false,
          timeLimitMinutes,
          retryLimit: retryLimit || -1
        }
      });

      res.status(201).json(quiz);
    } catch (error) {
      next(error);
    }
  }
);

// Add question to quiz
router.post('/:quizId/questions', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { quizId } = req.params;
      const {
        questionType,
        questionText,
        points,
        correctAnswer,
        explanation,
        options
      } = req.body;

      if (!questionText) throw new AppError(400, 'Question text required');

      const question = await prisma.quizQuestion.create({
        data: {
          quizId: BigInt(quizId),
          questionType: questionType || 'MULTIPLE_CHOICE',
          questionText,
          points: points || 1,
          correctAnswer,
          explanation
        }
      });

      // Add options if provided
      if (options && Array.isArray(options)) {
        await Promise.all(
          options.map((opt: any, idx: number) =>
            prisma.quizOption.create({
              data: {
                questionId: question.id,
                optionText: opt.text,
                isCorrect: opt.isCorrect || false,
                orderIndex: idx
              }
            })
          )
        );
      }

      res.status(201).json(question);
    } catch (error) {
      next(error);
    }
  }
);

// Get quiz with questions
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const quiz = await prisma.quiz.findUnique({
      where: { id: BigInt(id) },
      include: {
        questions: {
          include: { options: true },
          orderBy: { orderIndex: 'asc' }
        },
        _count: { select: { attempts: true } }
      }
    });

    if (!quiz) throw new AppError(404, 'Quiz not found');

    res.json(quiz);
  } catch (error) {
    next(error);
  }
});

// Start quiz attempt
router.post('/:quizId/attempts', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quizId } = req.params;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const quiz = await prisma.quiz.findUnique({
      where: { id: BigInt(quizId) }
    });

    if (!quiz) throw new AppError(404, 'Quiz not found');

    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId: BigInt(quizId),
        studentId: BigInt(req.user.id),
        startedAt: new Date(),
        status: 'IN_PROGRESS'
      }
    });

    res.status(201).json(attempt);
  } catch (error) {
    next(error);
  }
});

// Submit quiz answer
router.post('/:attemptId/answers', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attemptId } = req.params;
    const { questionId, selectedOptionId, shortAnswer } = req.body;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    if (!questionId) throw new AppError(400, 'Question ID required');

    const answer = await prisma.quizAnswer.create({
      data: {
        attemptId: BigInt(attemptId),
        questionId: BigInt(questionId),
        selectedOptionId: selectedOptionId ? BigInt(selectedOptionId) : null,
        shortAnswer
      }
    });

    res.status(201).json(answer);
  } catch (error) {
    next(error);
  }
});

// Submit quiz attempt
router.post('/:attemptId/submit', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attemptId } = req.params;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: BigInt(attemptId) },
      include: {
        quiz: { include: { questions: true } },
        answers: { include: { selectedOption: true, question: true } }
      }
    });

    if (!attempt) throw new AppError(404, 'Attempt not found');

    // Calculate score
    let score = 0;
    const quiz = attempt.quiz;

    for (const answer of attempt.answers) {
      const question = quiz.questions.find(q => q.id === answer.questionId);
      if (!question) continue;

      if (question.questionType === 'MULTIPLE_CHOICE' || question.questionType === 'TRUE_FALSE') {
        if (answer.selectedOption?.isCorrect) {
          score += answer.question.points;
        }
      }
    }

    const percentage = (score / quiz.totalPoints) * 100;
    const passed = percentage >= quiz.passingPercentage;

    const updated = await prisma.quizAttempt.update({
      where: { id: BigInt(attemptId) },
      data: {
        submittedAt: new Date(),
        status: 'SUBMITTED',
        score,
        percentage: new Decimal(percentage.toFixed(2))
      }
    });

    // Create grade record
    if (passed) {
      await prisma.grade.create({
        data: {
          quizAttemptId: BigInt(attemptId),
          courseId: BigInt(1), // Should be fetched from context
          studentId: attempt.studentId,
          points: score,
          percentage: percentage,
          letterGrade: getLetterGrade(percentage)
        }
      });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Get student's quiz attempts
router.get('/:quizId/my-attempts', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quizId } = req.params;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const attempts = await prisma.quizAttempt.findMany({
      where: {
        quizId: BigInt(quizId),
        studentId: BigInt(req.user.id)
      },
      orderBy: { startedAt: 'desc' }
    });

    res.json(attempts);
  } catch (error) {
    next(error);
  }
});

function getLetterGrade(percentage: number): string {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

export { router as quizRoutes };
