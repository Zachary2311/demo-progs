import { Router } from 'express';
import { CourseController } from '../controllers/course.controller';
import { ModuleController } from '../controllers/module.controller';
import { LessonController } from '../controllers/lesson.controller';
import { authenticate, requireInstructor } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Course routes
router.post(
  '/',
  requireInstructor,
  validate([
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
  ]),
  CourseController.createCourse
);

router.get('/', CourseController.getCourses);
router.get('/enrolled', CourseController.getEnrolledCourses);
router.get('/:id', CourseController.getCourse);

router.put(
  '/:id',
  requireInstructor,
  CourseController.updateCourse
);

router.delete('/:id', requireInstructor, CourseController.deleteCourse);

router.post('/:id/enroll', CourseController.enrollCourse);
router.delete('/:id/enroll', CourseController.unenrollCourse);

// Module routes
router.post(
  '/modules',
  requireInstructor,
  validate([
    body('courseId').notEmpty().withMessage('Course ID is required'),
    body('title').notEmpty().withMessage('Title is required'),
    body('orderIndex').isInt().withMessage('Order index must be an integer'),
  ]),
  ModuleController.createModule
);

router.put('/modules/:id', requireInstructor, ModuleController.updateModule);
router.delete('/modules/:id', requireInstructor, ModuleController.deleteModule);

// Lesson routes
router.post(
  '/lessons',
  requireInstructor,
  validate([
    body('moduleId').notEmpty().withMessage('Module ID is required'),
    body('title').notEmpty().withMessage('Title is required'),
    body('content').notEmpty().withMessage('Content is required'),
    body('orderIndex').isInt().withMessage('Order index must be an integer'),
  ]),
  LessonController.createLesson
);

router.get('/lessons/:id', LessonController.getLesson);
router.put('/lessons/:id', requireInstructor, LessonController.updateLesson);
router.delete('/lessons/:id', requireInstructor, LessonController.deleteLesson);
router.post('/lessons/:id/complete', LessonController.markComplete);

export default router;
