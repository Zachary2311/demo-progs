import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { sanitizeContent } from '../utils/sanitizer';

const router = Router();
const prisma = new PrismaClient();

// Create lesson
router.post('/', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { moduleId, title, content, contentType, durationMinutes } = req.body;

      if (!moduleId || !title) throw new AppError(400, 'Module ID and title required');

      const sanitizedContent = content ? sanitizeContent(content) : null;

      const lesson = await prisma.lesson.create({
        data: {
          moduleId: BigInt(moduleId),
          title,
          content: sanitizedContent,
          contentType: contentType || 'MARKDOWN',
          durationMinutes
        }
      });

      res.status(201).json(lesson);
    } catch (error) {
      next(error);
    }
  }
);

// Get lesson by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const lesson = await prisma.lesson.findUnique({
      where: { id: BigInt(id) },
      include: {
        module: { include: { course: true } },
        files: true,
        quizzes: true,
        _count: { select: { completions: true } }
      }
    });

    if (!lesson) throw new AppError(404, 'Lesson not found');

    res.json(lesson);
  } catch (error) {
    next(error);
  }
});

// Update lesson
router.put('/:id', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { title, content, contentType, isPublished, durationMinutes } = req.body;
      if (!req.user) throw new AppError(401, 'Not authenticated');

      // Verify lesson exists and user owns the course
      const lesson = await prisma.lesson.findUnique({
        where: { id: BigInt(id) },
        include: { module: { include: { course: true } } }
      });

      if (!lesson) throw new AppError(404, 'Lesson not found');

      // Check authorization: must be instructor of the course or admin
      if (lesson.module.course.instructorId !== BigInt(req.user.id) && !req.user.roles.includes('admin')) {
        throw new AppError(403, 'Not authorized to update this lesson');
      }

      const sanitizedContent = content !== undefined ? (content ? sanitizeContent(content) : null) : undefined;

      const updated = await prisma.lesson.update({
        where: { id: BigInt(id) },
        data: {
          ...(title && { title }),
          ...(sanitizedContent !== undefined && { content: sanitizedContent }),
          ...(contentType && { contentType }),
          ...(isPublished !== undefined && { isPublished }),
          ...(durationMinutes && { durationMinutes })
        }
      });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

// Mark lesson as completed
router.post('/:id/complete', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    // Verify lesson exists and student is enrolled in the course
    const lesson = await prisma.lesson.findUnique({
      where: { id: BigInt(id) },
      include: { module: { include: { course: true } } }
    });

    if (!lesson) throw new AppError(404, 'Lesson not found');

    // Check if student is enrolled in the course
    const enrollment = await prisma.courseEnrollment.findFirst({
      where: {
        courseId: lesson.module.course.id,
        studentId: BigInt(req.user.id)
      }
    });

    if (!enrollment) {
      throw new AppError(403, 'Not enrolled in this course');
    }

    const completion = await prisma.lessonCompletion.upsert({
      where: {
        lessonId_studentId: {
          lessonId: BigInt(id),
          studentId: BigInt(req.user.id)
        }
      },
      update: {
        completedAt: new Date()
      },
      create: {
        lessonId: BigInt(id),
        studentId: BigInt(req.user.id),
        completedAt: new Date()
      }
    });

    res.json(completion);
  } catch (error) {
    next(error);
    }
  }
);

// Get lesson completion status
router.get('/:id/completion', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const completion = await prisma.lessonCompletion.findUnique({
      where: {
        lessonId_studentId: {
          lessonId: BigInt(id),
          studentId: BigInt(req.user.id)
        }
      }
    });

    res.json({ completed: !!completion, completedAt: completion?.completedAt });
  } catch (error) {
    next(error);
  }
});

export { router as lessonRoutes };
