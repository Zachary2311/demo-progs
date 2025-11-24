import { Router } from 'express';
import { AssignmentController } from '../controllers/assignment.controller';
import { authenticate, requireInstructor } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.middleware';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requireInstructor,
  validate([
    body('courseId').notEmpty().withMessage('Course ID is required'),
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
  ]),
  AssignmentController.createAssignment
);

router.get('/', AssignmentController.getAssignments);
router.get('/:id', AssignmentController.getAssignment);
router.post('/:id/submit', AssignmentController.submitAssignment);
router.post('/submissions/:id/grade', requireInstructor, AssignmentController.gradeSubmission);
router.get('/submissions', AssignmentController.getSubmissions);

export default router;
