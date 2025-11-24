import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import logger from '../utils/logger';

export class AnalyticsController {
  static async getStudentDashboard(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;

      // Get enrolled courses with progress
      const enrollments = await prisma.courseEnrollment.findMany({
        where: { userId },
        include: {
          course: {
            include: {
              _count: {
                select: {
                  modules: true,
                },
              },
            },
          },
        },
      });

      // Get completed lessons count
      const completedLessons = await prisma.lessonCompletion.count({
        where: { userId },
      });

      // Get grades
      const grades = await prisma.grade.findMany({
        where: { userId },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Get upcoming assignments
      const upcomingAssignments = await prisma.assignment.findMany({
        where: {
          courseId: {
            in: enrollments.map(e => e.courseId),
          },
          dueDate: {
            gte: new Date(),
          },
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      });

      // Calculate time spent (from analytics events)
      const timeSpentEvents = await prisma.analyticsEvent.findMany({
        where: {
          userId,
          eventType: 'lesson_view',
        },
      });

      res.json({
        enrolledCourses: enrollments.length,
        completedLessons,
        averageGrade: grades.length > 0
          ? grades.reduce((sum, g) => sum + g.overallGrade, 0) / grades.length
          : 0,
        upcomingAssignments,
        courses: enrollments.map(e => ({
          ...e.course,
          progress: e.progress,
        })),
        grades,
      });
    } catch (error) {
      logger.error('Get student dashboard error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  }

  static async getInstructorDashboard(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;

      // Get instructor's courses
      const courses = await prisma.course.findMany({
        where: { instructorId: userId },
        include: {
          _count: {
            select: {
              enrollments: true,
              modules: true,
            },
          },
        },
      });

      // Get total students across all courses
      const totalStudents = await prisma.courseEnrollment.count({
        where: {
          courseId: {
            in: courses.map(c => c.id),
          },
        },
      });

      // Get submission statistics
      const pendingGrading = await prisma.assignmentSubmission.count({
        where: {
          assignment: {
            courseId: {
              in: courses.map(c => c.id),
            },
          },
          gradedAt: null,
        },
      });

      // Get quiz statistics
      const quizzes = await prisma.quiz.findMany({
        where: {
          lesson: {
            module: {
              courseId: {
                in: courses.map(c => c.id),
              },
            },
          },
        },
        include: {
          _count: {
            select: {
              attempts: true,
            },
          },
        },
      });

      // Get average course completion rate
      const enrollments = await prisma.courseEnrollment.findMany({
        where: {
          courseId: {
            in: courses.map(c => c.id),
          },
        },
      });

      const avgCompletion = enrollments.length > 0
        ? enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length
        : 0;

      res.json({
        totalCourses: courses.length,
        totalStudents,
        pendingGrading,
        totalQuizzes: quizzes.length,
        totalQuizAttempts: quizzes.reduce((sum, q) => sum + q._count.attempts, 0),
        averageCompletion: avgCompletion,
        courses: courses.map(c => ({
          id: c.id,
          title: c.title,
          students: c._count.enrollments,
          modules: c._count.modules,
          isPublished: c.isPublished,
        })),
      });
    } catch (error) {
      logger.error('Get instructor dashboard error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  }

  static async getAdminDashboard(req: AuthRequest, res: Response) {
    try {
      const [
        totalUsers,
        totalCourses,
        totalEnrollments,
        publishedCourses,
        totalLessons,
        totalQuizzes,
        totalAssignments,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.course.count(),
        prisma.courseEnrollment.count(),
        prisma.course.count({ where: { isPublished: true } }),
        prisma.lesson.count(),
        prisma.quiz.count(),
        prisma.assignment.count(),
      ]);

      // Get user role distribution
      const roleDistribution = await prisma.userRole.groupBy({
        by: ['roleId'],
        _count: true,
      });

      const roles = await prisma.role.findMany();
      const roleStats = roleDistribution.map(rd => {
        const role = roles.find(r => r.id === rd.roleId);
        return {
          role: role?.name || 'Unknown',
          count: rd._count,
        };
      });

      // Get recent activity
      const recentEvents = await prisma.analyticsEvent.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              username: true,
            },
          },
          course: {
            select: {
              title: true,
            },
          },
        },
      });

      // Get top courses by enrollment
      const topCourses = await prisma.course.findMany({
        take: 5,
        include: {
          _count: {
            select: {
              enrollments: true,
            },
          },
          instructor: {
            select: {
              username: true,
            },
          },
        },
        orderBy: {
          enrollments: {
            _count: 'desc',
          },
        },
      });

      res.json({
        totalUsers,
        totalCourses,
        totalEnrollments,
        publishedCourses,
        totalLessons,
        totalQuizzes,
        totalAssignments,
        roleDistribution: roleStats,
        recentActivity: recentEvents,
        topCourses: topCourses.map(c => ({
          id: c.id,
          title: c.title,
          instructor: c.instructor.username,
          enrollments: c._count.enrollments,
        })),
      });
    } catch (error) {
      logger.error('Get admin dashboard error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  }

  static async getCourseAnalytics(req: AuthRequest, res: Response) {
    try {
      const { courseId } = req.params;

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          _count: {
            select: {
              enrollments: true,
              modules: true,
            },
          },
        },
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check permissions
      const isInstructor = course.instructorId === req.user!.userId;
      const isAdmin = req.user!.roles.includes('admin');

      if (!isInstructor && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Get completion rate
      const enrollments = await prisma.courseEnrollment.findMany({
        where: { courseId },
      });

      const avgProgress = enrollments.length > 0
        ? enrollments.reduce((sum, e) => sum + e.progress, 0) / enrollments.length
        : 0;

      const completedCount = enrollments.filter(e => e.completedAt !== null).length;

      // Get quiz performance
      const quizAttempts = await prisma.quizAttempt.findMany({
        where: {
          quiz: {
            lesson: {
              module: {
                courseId,
              },
            },
          },
          completedAt: { not: null },
        },
      });

      const avgQuizScore = quizAttempts.length > 0
        ? quizAttempts.reduce((sum, a) => sum + ((a.score || 0) / a.maxScore) * 100, 0) / quizAttempts.length
        : 0;

      // Get assignment submission rate
      const assignments = await prisma.assignment.findMany({
        where: { courseId },
        include: {
          _count: {
            select: {
              submissions: true,
            },
          },
        },
      });

      const totalAssignments = assignments.length;
      const expectedSubmissions = totalAssignments * enrollments.length;
      const actualSubmissions = assignments.reduce((sum, a) => sum + a._count.submissions, 0);
      const submissionRate = expectedSubmissions > 0
        ? (actualSubmissions / expectedSubmissions) * 100
        : 0;

      res.json({
        enrollments: enrollments.length,
        averageProgress: avgProgress,
        completionRate: enrollments.length > 0 ? (completedCount / enrollments.length) * 100 : 0,
        averageQuizScore: avgQuizScore,
        totalQuizzes: quizAttempts.length,
        totalAssignments,
        submissionRate,
        studentProgress: enrollments.map(e => ({
          userId: e.userId,
          progress: e.progress,
          enrolledAt: e.enrolledAt,
          completedAt: e.completedAt,
        })),
      });
    } catch (error) {
      logger.error('Get course analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch course analytics' });
    }
  }

  static async logEvent(req: AuthRequest, res: Response) {
    try {
      const { eventType, courseId, metadata } = req.body;
      const userId = req.user!.userId;

      const event = await prisma.analyticsEvent.create({
        data: {
          userId,
          courseId,
          eventType,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });

      res.status(201).json(event);
    } catch (error) {
      logger.error('Log event error:', error);
      res.status(500).json({ error: 'Failed to log event' });
    }
  }
}
