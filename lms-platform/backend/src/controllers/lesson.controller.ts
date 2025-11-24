import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import logger from '../utils/logger';

export class LessonController {
  static async createLesson(req: AuthRequest, res: Response) {
    try {
      const { moduleId, title, content, videoUrl, orderIndex, duration } = req.body;

      const module = await prisma.module.findUnique({
        where: { id: moduleId },
        include: { course: true },
      });

      if (!module) {
        return res.status(404).json({ error: 'Module not found' });
      }

      // Check permissions
      const isInstructor = module.course.instructorId === req.user!.userId;
      const isAdmin = req.user!.roles.includes('admin');

      if (!isInstructor && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const lesson = await prisma.lesson.create({
        data: {
          moduleId,
          title,
          content,
          videoUrl,
          orderIndex,
          duration,
        },
      });

      logger.info(`Lesson created: ${lesson.title} (${lesson.id})`);
      res.status(201).json(lesson);
    } catch (error) {
      logger.error('Create lesson error:', error);
      res.status(500).json({ error: 'Failed to create lesson' });
    }
  }

  static async getLesson(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const lesson = await prisma.lesson.findUnique({
        where: { id },
        include: {
          module: {
            include: {
              course: true,
            },
          },
          files: true,
        },
      });

      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      res.json(lesson);
    } catch (error) {
      logger.error('Get lesson error:', error);
      res.status(500).json({ error: 'Failed to fetch lesson' });
    }
  }

  static async updateLesson(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, content, videoUrl, orderIndex, duration } = req.body;

      const lesson = await prisma.lesson.findUnique({
        where: { id },
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

      const updated = await prisma.lesson.update({
        where: { id },
        data: { title, content, videoUrl, orderIndex, duration },
      });

      res.json(updated);
    } catch (error) {
      logger.error('Update lesson error:', error);
      res.status(500).json({ error: 'Failed to update lesson' });
    }
  }

  static async deleteLesson(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const lesson = await prisma.lesson.findUnique({
        where: { id },
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

      await prisma.lesson.delete({ where: { id } });

      logger.info(`Lesson deleted: ${id}`);
      res.json({ message: 'Lesson deleted successfully' });
    } catch (error) {
      logger.error('Delete lesson error:', error);
      res.status(500).json({ error: 'Failed to delete lesson' });
    }
  }

  static async markComplete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;

      const lesson = await prisma.lesson.findUnique({ where: { id } });

      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      // Check if already completed
      const existing = await prisma.lessonCompletion.findUnique({
        where: {
          lessonId_userId: {
            lessonId: id,
            userId,
          },
        },
      });

      if (existing) {
        return res.status(400).json({ error: 'Lesson already completed' });
      }

      const completion = await prisma.lessonCompletion.create({
        data: {
          lessonId: id,
          userId,
        },
      });

      // Update course progress
      await updateCourseProgress(userId, lesson.moduleId);

      // Log analytics event
      await prisma.analyticsEvent.create({
        data: {
          userId,
          eventType: 'lesson_complete',
          metadata: JSON.stringify({ lessonId: id }),
        },
      });

      logger.info(`Lesson completed: ${id} by user ${userId}`);
      res.status(201).json(completion);
    } catch (error) {
      logger.error('Mark lesson complete error:', error);
      res.status(500).json({ error: 'Failed to mark lesson as complete' });
    }
  }
}

async function updateCourseProgress(userId: string, moduleId: string) {
  const module = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      course: {
        include: {
          modules: {
            include: {
              lessons: true,
            },
          },
        },
      },
    },
  });

  if (!module) return;

  const totalLessons = module.course.modules.reduce(
    (sum, m) => sum + m.lessons.length,
    0
  );

  const completedLessons = await prisma.lessonCompletion.count({
    where: {
      userId,
      lesson: {
        module: {
          courseId: module.courseId,
        },
      },
    },
  });

  const progress = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

  await prisma.courseEnrollment.updateMany({
    where: {
      userId,
      courseId: module.courseId,
    },
    data: {
      progress,
      completedAt: progress === 100 ? new Date() : null,
    },
  });
}
