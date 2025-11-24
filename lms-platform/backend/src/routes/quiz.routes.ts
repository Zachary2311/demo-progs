import { Router } from 'express';
import { QuizController } from '../controllers/quiz.controller';
import { authenticate, requireInstructor } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.middleware';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requireInstructor,
  validate([
    body('title').notEmpty().withMessage('Title is required'),
    body('questions').isArray({ min: 1 }).withMessage('At least one question is required'),
  ]),
  QuizController.createQuiz
);

router.get('/:id', QuizController.getQuiz);
router.post('/:id/start', QuizController.startQuiz);
router.post('/:id/submit', QuizController.submitQuiz);
router.get('/:id/attempts', QuizController.getQuizAttempts);

export default router;
