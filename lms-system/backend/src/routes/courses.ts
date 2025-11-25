import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

// Create course
router.post('/', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, category, tags, thumbnailUrl, prerequisites } = req.body;

      if (!title) throw new AppError(400, 'Title is required');
      if (!req.user) throw new AppError(401, 'Not authenticated');

      const course = await prisma.course.create({
        data: {
          title,
          description,
          category,
          tags: tags ? JSON.stringify(tags) : null,
          thumbnailUrl,
          prerequisites: prerequisites ? JSON.stringify(prerequisites) : null,
          instructorId: BigInt(req.user.id),
          enrollmentOpen: true
        }
      });

      res.status(201).json(course);
    } catch (error) {
      next(error);
    }
  }
);

// Get all courses
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10, category, search, published } = req.query;

    const where: any = {
      isPublished: published !== undefined ? published === 'true' : undefined,
      deletedAt: null
    };

    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { description: { contains: search as string } }
      ];
    }

    const courses = await prisma.course.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        instructor: { select: { id: true, username: true, avatarUrl: true } },
        _count: { select: { enrollments: true, modules: true } }
      }
    });

    const total = await prisma.course.count({ where });

    res.json({
      data: courses,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get course by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const course = await prisma.course.findUnique({
      where: { id: BigInt(id) },
      include: {
        instructor: { select: { id: true, username: true, avatarUrl: true } },
        instructors: { include: { user: { select: { id: true, username: true } } } },
        modules: { include: { lessons: true }, orderBy: { orderIndex: 'asc' } },
        _count: { select: { enrollments: true } }
      }
    });

    if (!course) throw new AppError(404, 'Course not found');

    res.json(course);
  } catch (error) {
    next(error);
  }
});

// Update course
router.put('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, description, category, tags, thumbnailUrl, isPublished, prerequisites } = req.body;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const course = await prisma.course.findUnique({
      where: { id: BigInt(id) }
    });

    if (!course) throw new AppError(404, 'Course not found');

    // Check authorization
    if (course.instructorId !== BigInt(req.user.id) && !req.user.roles.includes('admin')) {
      throw new AppError(403, 'Not authorized to update this course');
    }

    const updated = await prisma.course.update({
      where: { id: BigInt(id) },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(tags && { tags: JSON.stringify(tags) }),
        ...(thumbnailUrl && { thumbnailUrl }),
        ...(isPublished !== undefined && { isPublished }),
        ...(prerequisites && { prerequisites: JSON.stringify(prerequisites) })
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Enroll student in course
router.post('/:id/enroll', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const course = await prisma.course.findUnique({
      where: { id: BigInt(id) }
    });

    if (!course) throw new AppError(404, 'Course not found');
    if (!course.enrollmentOpen) throw new AppError(400, 'Course enrollment is closed');

    // Check if already enrolled
    const existing = await prisma.courseEnrollment.findUnique({
      where: {
        courseId_studentId: {
          courseId: BigInt(id),
          studentId: BigInt(req.user.id)
        }
      }
    });

    if (existing) throw new AppError(400, 'Already enrolled in this course');

    const enrollment = await prisma.courseEnrollment.create({
      data: {
        courseId: BigInt(id),
        studentId: BigInt(req.user.id)
      }
    });

    res.status(201).json(enrollment);
  } catch (error) {
    next(error);
  }
});

// Get course analytics
router.get('/:id/analytics', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!req.user) throw new AppError(401, 'Not authenticated');

      const course = await prisma.course.findUnique({
        where: { id: BigInt(id) }
      });

      if (!course) throw new AppError(404, 'Course not found');

      // Get enrollment count
      const enrollmentCount = await prisma.courseEnrollment.count({
        where: { courseId: BigInt(id) }
      });

      // Get average progress
      const avgProgress = await prisma.courseEnrollment.aggregate({
        where: { courseId: BigInt(id) },
        _avg: { completionPercentage: true }
      });

      // Get submission stats
      const submissions = await prisma.submission.findMany({
        where: {
          assignment: { courseId: BigInt(id) }
        },
        select: { status: true }
      });

      res.json({
        courseId: id,
        enrollmentCount,
        averageProgress: avgProgress._avg.completionPercentage || 0,
        submissions: {
          total: submissions.length,
          submitted: submissions.filter(s => s.status !== 'DRAFT').length,
          graded: submissions.filter(s => s.status === 'GRADED').length
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as courseRoutes };
