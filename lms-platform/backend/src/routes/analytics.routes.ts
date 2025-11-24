import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate, requireInstructor, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/dashboard/student', AnalyticsController.getStudentDashboard);
router.get('/dashboard/instructor', requireInstructor, AnalyticsController.getInstructorDashboard);
router.get('/dashboard/admin', requireAdmin, AnalyticsController.getAdminDashboard);
router.get('/course/:courseId', requireInstructor, AnalyticsController.getCourseAnalytics);
router.post('/events', AnalyticsController.logEvent);

export default router;
