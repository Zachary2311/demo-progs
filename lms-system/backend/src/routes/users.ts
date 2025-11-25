import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

// Get all users (admin only)
router.get('/', authMiddleware, requireRole(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10, role, status } = req.query;

    const where: any = {
      ...(status && { status: status }),
      deletedAt: null
    };

    const users = await prisma.user.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        roles: { include: { role: true } },
        _count: { select: { enrolledCourses: true, ownedCourses: true } }
      }
    });

    const total = await prisma.user.count({ where });

    res.json({
      data: users.map(u => ({
        id: u.id.toString(),
        discordId: u.discordId,
        username: u.username,
        email: u.email,
        avatarUrl: u.avatarUrl,
        status: u.status,
        roles: u.roles.map(ur => ur.role.name),
        enrolledCourses: u._count.enrolledCourses,
        ownedCourses: u._count.ownedCourses,
        createdAt: u.createdAt
      })),
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

// Get user by ID
router.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: BigInt(id) },
      include: {
        roles: { include: { role: true } },
        enrolledCourses: { include: { course: true } },
        ownedCourses: true
      }
    });

    if (!user) throw new AppError(404, 'User not found');

    res.json({
      id: user.id.toString(),
      discordId: user.discordId,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      status: user.status,
      roles: user.roles.map(ur => ur.role.name),
      enrolledCourses: user.enrolledCourses.map(ec => ({
        id: ec.course.id.toString(),
        title: ec.course.title
      })),
      ownedCourses: user.ownedCourses.map(c => ({
        id: c.id.toString(),
        title: c.title
      })),
      createdAt: user.createdAt
    });
  } catch (error) {
    next(error);
  }
});

// Assign role to user (admin)
router.post('/:userId/roles/:roleId', authMiddleware, requireRole(['admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, roleId } = req.params;
      if (!req.user) throw new AppError(401, 'Not authenticated');

      const userRole = await prisma.userRole.create({
        data: {
          userId: BigInt(userId),
          roleId: BigInt(roleId),
          assignedBy: BigInt(req.user.id)
        }
      });

      res.status(201).json(userRole);
    } catch (error) {
      next(error);
    }
  }
);

// Remove role from user (admin)
router.delete('/:userId/roles/:roleId', authMiddleware, requireRole(['admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, roleId } = req.params;

      await prisma.userRole.deleteMany({
        where: {
          userId: BigInt(userId),
          roleId: BigInt(roleId)
        }
      });

      res.json({ message: 'Role removed' });
    } catch (error) {
      next(error);
    }
  }
);

// Update user status (admin)
router.patch('/:id/status', authMiddleware, requireRole(['admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['ACTIVE', 'INACTIVE', 'BANNED'].includes(status)) {
        throw new AppError(400, 'Invalid status');
      }

      const user = await prisma.user.update({
        where: { id: BigInt(id) },
        data: { status }
      });

      res.json({
        id: user.id.toString(),
        username: user.username,
        status: user.status
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get user's enrolled courses
router.get('/:id/courses', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const enrollments = await prisma.courseEnrollment.findMany({
      where: { studentId: BigInt(id) },
      include: { course: true }
    });

    res.json(
      enrollments.map(e => ({
        ...e.course,
        enrollmentStatus: e.status,
        completionPercentage: e.completionPercentage
      }))
    );
  } catch (error) {
    next(error);
    }
  }
);

// Delete user (admin)
router.delete('/:id', authMiddleware, requireRole(['admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      await prisma.user.update({
        where: { id: BigInt(id) },
        data: { deletedAt: new Date() }
      });

      res.json({ message: 'User deleted' });
    } catch (error) {
      next(error);
    }
  }
);

export { router as userRoutes };
