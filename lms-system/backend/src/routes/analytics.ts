import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

// Log an event
router.post('/events', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventType, courseId, lessonId, quizId, assignmentId, eventData } = req.body;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const event = await prisma.analyticsEvent.create({
      data: {
        userId: BigInt(req.user.id),
        eventType,
        courseId: courseId ? BigInt(courseId) : null,
        lessonId: lessonId ? BigInt(lessonId) : null,
        quizId: quizId ? BigInt(quizId) : null,
        assignmentId: assignmentId ? BigInt(assignmentId) : null,
        eventData: eventData ? JSON.stringify(eventData) : null,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });

    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

// Get course analytics (instructor view)
router.get('/course/:courseId', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courseId } = req.params;

      // Total enrollments
      const enrollmentCount = await prisma.courseEnrollment.count({
        where: { courseId: BigInt(courseId) }
      });

      // Average progress
      const avgProgress = await prisma.courseEnrollment.aggregate({
        where: { courseId: BigInt(courseId) },
        _avg: { completionPercentage: true }
      });

      // Active users (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const activeUsers = await prisma.analyticsEvent.groupBy({
        by: ['userId'],
        where: {
          courseId: BigInt(courseId),
          createdAt: { gte: sevenDaysAgo }
        }
      });

      // Quiz performance
      const quizzes = await prisma.quiz.findMany({
        where: { lesson: { module: { courseId: BigInt(courseId) } } },
        include: {
          attempts: {
            select: { score: true, percentage: true }
          }
        }
      });

      const quizPerformance = quizzes.map(quiz => {
        const scores = quiz.attempts.map(a => a.percentage?.toNumber() || 0);
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0;

        return {
          quizId: quiz.id.toString(),
          quizTitle: quiz.title,
          totalAttempts: quiz.attempts.length,
          averageScore: parseFloat(avgScore.toFixed(2))
        };
      });

      // Assignment submissions
      const assignments = await prisma.assignment.findMany({
        where: { courseId: BigInt(courseId) },
        include: {
          submissions: { select: { status: true } }
        }
      });

      const submissionStats = {
        total: assignments.reduce((sum, a) => sum + a.submissions.length, 0),
        submitted: assignments.reduce(
          (sum, a) => sum + a.submissions.filter(s => s.status !== 'DRAFT').length,
          0
        ),
        graded: assignments.reduce(
          (sum, a) => sum + a.submissions.filter(s => s.status === 'GRADED').length,
          0
        )
      };

      res.json({
        courseId,
        enrollmentCount,
        averageProgress: avgProgress._avg.completionPercentage || 0,
        activeUsersCount: activeUsers.length,
        quizPerformance,
        submissionStats
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get student learning analytics
router.get('/student/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new AppError(401, 'Not authenticated');

    // Time spent on platform
    const events = await prisma.analyticsEvent.findMany({
      where: { userId: BigInt(req.user.id) }
    });

    // Courses enrolled
    const enrolledCourses = await prisma.courseEnrollment.findMany({
      where: { studentId: BigInt(req.user.id) },
      include: { course: true }
    });

    // Lesson completions
    const completedLessons = await prisma.lessonCompletion.findMany({
      where: { studentId: BigInt(req.user.id) },
      select: { completedAt: true, timeSpentSeconds: true }
    });

    // Quiz attempts
    const quizAttempts = await prisma.quizAttempt.findMany({
      where: { studentId: BigInt(req.user.id) },
      include: { quiz: true }
    });

    // Submissions
    const submissions = await prisma.submission.findMany({
      where: { studentId: BigInt(req.user.id) },
      select: { status: true }
    });

    // Grades
    const grades = await prisma.grade.findMany({
      where: { studentId: BigInt(req.user.id) }
    });

    const totalTimeSpent = completedLessons.reduce((sum, l) => sum + l.timeSpentSeconds, 0);
    const avgQuizScore = quizAttempts.length > 0
      ? quizAttempts.reduce((sum, a) => sum + (a.percentage?.toNumber() || 0), 0) / quizAttempts.length
      : 0;

    res.json({
      enrolledCoursesCount: enrolledCourses.length,
      completedLessonsCount: completedLessons.length,
      totalTimeSpentSeconds: totalTimeSpent,
      totalTimeSpentHours: parseFloat((totalTimeSpent / 3600).toFixed(2)),
      quizAttemptsCount: quizAttempts.length,
      averageQuizScore: parseFloat(avgQuizScore.toFixed(2)),
      submissionsCount: submissions.length,
      submittedAssignments: submissions.filter(s => s.status !== 'DRAFT').length,
      gradedAssignments: submissions.filter(s => s.status === 'GRADED').length,
      averageGrade: grades.length > 0
        ? parseFloat(
            (grades.reduce((sum, g) => sum + (g.percentage?.toNumber() || 0), 0) / grades.length).toFixed(2)
          )
        : 0,
      eventsCount: events.length
    });
  } catch (error) {
    next(error);
  }
});

// Get system-wide analytics (admin only)
router.get('/admin/dashboard', authMiddleware, requireRole(['admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Total users
      const totalUsers = await prisma.user.count({ where: { deletedAt: null } });

      // Users by role
      const usersByRole = await prisma.userRole.groupBy({
        by: ['roleId'],
        _count: true
      });

      // Total courses
      const totalCourses = await prisma.course.count({ where: { deletedAt: null } });
      const publishedCourses = await prisma.course.count({ where: { isPublished: true, deletedAt: null } });

      // Total enrollments
      const totalEnrollments = await prisma.courseEnrollment.count();

      // Total submissions
      const totalSubmissions = await prisma.submission.count();
      const gradedSubmissions = await prisma.submission.count({
        where: { status: 'GRADED' }
      });

      // Top courses
      const topCourses = await prisma.course.findMany({
        take: 5,
        orderBy: {
          enrollments: { _count: 'desc' }
        },
        include: {
          _count: { select: { enrollments: true } }
        }
      });

      // Recent activity
      const recentEvents = await prisma.analyticsEvent.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true } } }
      });

      res.json({
        users: {
          total: totalUsers,
          byRole: usersByRole
        },
        courses: {
          total: totalCourses,
          published: publishedCourses
        },
        enrollments: totalEnrollments,
        submissions: {
          total: totalSubmissions,
          graded: gradedSubmissions,
          pending: totalSubmissions - gradedSubmissions
        },
        topCourses: topCourses.map(c => ({
          id: c.id.toString(),
          title: c.title,
          enrollmentCount: c._count.enrollments
        })),
        recentActivity: recentEvents.map(e => ({
          eventType: e.eventType,
          user: e.user?.username,
          timestamp: e.createdAt
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as analyticsRoutes };
