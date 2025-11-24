import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import { getPaginationParams, createPaginatedResponse } from '../utils/pagination';
import { NotificationService } from '../services/notification.service';
import logger from '../utils/logger';

export class CourseController {
  static async createCourse(req: AuthRequest, res: Response) {
    try {
      const { title, description, category, tags, thumbnail } = req.body;
      const userId = req.user!.userId;

      const course = await prisma.course.create({
        data: {
          title,
          description,
          category,
          tags: tags ? JSON.stringify(tags) : null,
          thumbnail,
          instructorId: userId,
        },
        include: {
          instructor: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
      });

      logger.info(`Course created: ${course.title} (${course.id}) by ${req.user!.userId}`);
      res.status(201).json(course);
    } catch (error) {
      logger.error('Create course error:', error);
      res.status(500).json({ error: 'Failed to create course' });
    }
  }

  static async getCourses(req: AuthRequest, res: Response) {
    try {
      const { page, limit, skip } = getPaginationParams(req);
      const { category, search, published } = req.query;

      const where: any = {};

      if (category) {
        where.category = category;
      }

      if (search) {
        where.OR = [
          { title: { contains: search as string } },
          { description: { contains: search as string } },
        ];
      }

      if (published !== undefined) {
        where.isPublished = published === 'true';
      }

      // Students can only see published courses they're enrolled in or all published
      if (req.user!.roles.includes('student') && !req.user!.roles.includes('instructor')) {
        where.isPublished = true;
      }

      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where,
          skip,
          take: limit,
          include: {
            instructor: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
            _count: {
              select: {
                enrollments: true,
                modules: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.course.count({ where }),
      ]);

      const response = createPaginatedResponse(courses, total, { page, limit, skip });
      res.json(response);
    } catch (error) {
      logger.error('Get courses error:', error);
      res.status(500).json({ error: 'Failed to fetch courses' });
    }
  }

  static async getCourse(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const course = await prisma.course.findUnique({
        where: { id },
        include: {
          instructor: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          modules: {
            include: {
              lessons: {
                orderBy: { orderIndex: 'asc' },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
          _count: {
            select: {
              enrollments: true,
            },
          },
        },
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check access
      const isInstructor = course.instructorId === req.user!.userId;
      const isAdmin = req.user!.roles.includes('admin');

      if (!course.isPublished && !isInstructor && !isAdmin) {
        return res.status(403).json({ error: 'Course not published' });
      }

      res.json(course);
    } catch (error) {
      logger.error('Get course error:', error);
      res.status(500).json({ error: 'Failed to fetch course' });
    }
  }

  static async updateCourse(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, description, category, tags, thumbnail, isPublished } = req.body;

      const course = await prisma.course.findUnique({ where: { id } });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check permissions
      const isInstructor = course.instructorId === req.user!.userId;
      const isAdmin = req.user!.roles.includes('admin');

      if (!isInstructor && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const updated = await prisma.course.update({
        where: { id },
        data: {
          title,
          description,
          category,
          tags: tags ? JSON.stringify(tags) : undefined,
          thumbnail,
          isPublished,
        },
      });

      logger.info(`Course updated: ${updated.title} (${updated.id})`);
      res.json(updated);
    } catch (error) {
      logger.error('Update course error:', error);
      res.status(500).json({ error: 'Failed to update course' });
    }
  }

  static async deleteCourse(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const course = await prisma.course.findUnique({ where: { id } });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check permissions
      const isInstructor = course.instructorId === req.user!.userId;
      const isAdmin = req.user!.roles.includes('admin');

      if (!isInstructor && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await prisma.course.delete({ where: { id } });

      logger.info(`Course deleted: ${course.title} (${id})`);
      res.json({ message: 'Course deleted successfully' });
    } catch (error) {
      logger.error('Delete course error:', error);
      res.status(500).json({ error: 'Failed to delete course' });
    }
  }

  static async enrollCourse(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const course = await prisma.course.findUnique({ where: { id } });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (!course.isPublished) {
        return res.status(403).json({ error: 'Course not available for enrollment' });
      }

      // Check if already enrolled
      const existing = await prisma.courseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId: id,
          },
        },
      });

      if (existing) {
        return res.status(400).json({ error: 'Already enrolled in this course' });
      }

      const enrollment = await prisma.courseEnrollment.create({
        data: {
          userId,
          courseId: id,
        },
        include: {
          course: true,
        },
      });

      // Send notification
      await NotificationService.notifyEnrollment(userId, course.title);

      logger.info(`User ${userId} enrolled in course ${id}`);
      res.status(201).json(enrollment);
    } catch (error) {
      logger.error('Enroll course error:', error);
      res.status(500).json({ error: 'Failed to enroll in course' });
    }
  }

  static async unenrollCourse(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const enrollment = await prisma.courseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId: id,
          },
        },
      });

      if (!enrollment) {
        return res.status(404).json({ error: 'Not enrolled in this course' });
      }

      await prisma.courseEnrollment.delete({
        where: {
          id: enrollment.id,
        },
      });

      logger.info(`User ${userId} unenrolled from course ${id}`);
      res.json({ message: 'Unenrolled successfully' });
    } catch (error) {
      logger.error('Unenroll course error:', error);
      res.status(500).json({ error: 'Failed to unenroll from course' });
    }
  }

  static async getEnrolledCourses(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { page, limit, skip } = getPaginationParams(req);

      const [enrollments, total] = await Promise.all([
        prisma.courseEnrollment.findMany({
          where: { userId },
          skip,
          take: limit,
          include: {
            course: {
              include: {
                instructor: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                  },
                },
                _count: {
                  select: {
                    modules: true,
                  },
                },
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
        }),
        prisma.courseEnrollment.count({ where: { userId } }),
      ]);

      const response = createPaginatedResponse(
        enrollments.map(e => ({ ...e.course, progress: e.progress })),
        total,
        { page, limit, skip }
      );

      res.json(response);
    } catch (error) {
      logger.error('Get enrolled courses error:', error);
      res.status(500).json({ error: 'Failed to fetch enrolled courses' });
    }
  }
}
