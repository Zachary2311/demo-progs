import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

// Get student's grades for a course
router.get('/course/:courseId', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = req.params;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const grades = await prisma.grade.findMany({
      where: {
        courseId: BigInt(courseId),
        studentId: BigInt(req.user.id)
      },
      include: {
        submission: { include: { assignment: true } },
        quizAttempt: { include: { quiz: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate overall course grade
    const totalPoints = grades.reduce((sum, g) => sum + (g.points?.toNumber() || 0), 0);
    const totalPossible = grades.reduce((sum, g) => sum + 100, 0);
    const overallPercentage = totalPossible > 0 ? (totalPoints / totalPossible) * 100 : 0;

    res.json({
      grades,
      courseId,
      overallPercentage: parseFloat(overallPercentage.toFixed(2)),
      letterGrade: getLetterGrade(overallPercentage)
    });
  } catch (error) {
    next(error);
  }
});

// Get gradebook for course (instructor view)
router.get('/course/:courseId/gradebook', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courseId } = req.params;
      if (!req.user) throw new AppError(401, 'Not authenticated');

      // Verify course ownership
      const course = await prisma.course.findUnique({
        where: { id: BigInt(courseId) }
      });

      if (!course) throw new AppError(404, 'Course not found');

      if (course.instructorId !== BigInt(req.user.id) && !req.user.roles.includes('admin')) {
        throw new AppError(403, 'Not authorized to view this gradebook');
      }

      const enrollments = await prisma.courseEnrollment.findMany({
        where: { courseId: BigInt(courseId) },
        include: {
          student: { select: { id: true, username: true, email: true } },
          course: { select: { id: true, title: true } }
        }
      });

      const gradebook = await Promise.all(
        enrollments.map(async (enrollment) => {
          const grades = await prisma.grade.findMany({
            where: {
              courseId: BigInt(courseId),
              studentId: enrollment.studentId
            }
          });

          const totalPoints = grades.reduce((sum, g) => sum + (g.points?.toNumber() || 0), 0);
          const avgPercentage = grades.length > 0
            ? grades.reduce((sum, g) => sum + (g.percentage?.toNumber() || 0), 0) / grades.length
            : 0;

          return {
            studentId: enrollment.studentId.toString(),
            studentName: enrollment.student.username,
            email: enrollment.student.email,
            totalPoints,
            averagePercentage: parseFloat(avgPercentage.toFixed(2)),
            letterGrade: getLetterGrade(avgPercentage),
            enrolledAt: enrollment.enrolledAt,
            lastAccessed: enrollment.lastAccessed
          };
        })
      );

      res.json({
        courseId,
        courseName: enrollments[0]?.course.title,
        gradebook: gradebook.sort((a, b) => parseFloat(b.averagePercentage) - parseFloat(a.averagePercentage))
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update grade (instructor)
router.put('/:gradeId', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { gradeId } = req.params;
      const { points, feedback, letterGrade } = req.body;

      const grade = await prisma.grade.update({
        where: { id: BigInt(gradeId) },
        data: {
          ...(points !== undefined && { points: parseFloat(points) }),
          ...(feedback && { feedback }),
          ...(letterGrade && { letterGrade })
        }
      });

      res.json(grade);
    } catch (error) {
      next(error);
    }
  }
);

// Get all grades for a student
router.get('/student/:studentId', authMiddleware, requireRole(['admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { studentId } = req.params;

      const grades = await prisma.grade.findMany({
        where: { studentId: BigInt(studentId) },
        include: {
          course: { select: { id: true, title: true } },
          submission: true,
          quizAttempt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(grades);
    } catch (error) {
      next(error);
    }
  }
);

// CSV injection prevention helper
const escapeCSV = (value: string | number): string => {
  const stringValue = String(value);
  // Check for formula injection patterns
  if (stringValue.match(/^[=+\-@]/)) {
    return `'${stringValue}`;
  }
  // Quote fields containing commas, quotes, or newlines
  if (stringValue.match(/[,"\n]/)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

// Export gradebook as CSV
router.get('/:courseId/export-csv', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courseId } = req.params;
      if (!req.user) throw new AppError(401, 'Not authenticated');

      // Verify course ownership
      const course = await prisma.course.findUnique({
        where: { id: BigInt(courseId) }
      });

      if (!course) throw new AppError(404, 'Course not found');

      if (course.instructorId !== BigInt(req.user.id) && !req.user.roles.includes('admin')) {
        throw new AppError(403, 'Not authorized to export this gradebook');
      }

      const enrollments = await prisma.courseEnrollment.findMany({
        where: { courseId: BigInt(courseId) },
        include: { student: true }
      });

      let csv = 'Student ID,Name,Email,Total Points,Average Percentage,Letter Grade\n';

      for (const enrollment of enrollments) {
        const grades = await prisma.grade.findMany({
          where: {
            courseId: BigInt(courseId),
            studentId: enrollment.studentId
          }
        });

        const totalPoints = grades.reduce((sum, g) => sum + (g.points?.toNumber() || 0), 0);
        const avgPercentage = grades.length > 0
          ? grades.reduce((sum, g) => sum + (g.percentage?.toNumber() || 0), 0) / grades.length
          : 0;

        csv += `${escapeCSV(enrollment.studentId.toString())},${escapeCSV(enrollment.student.username)},${escapeCSV(enrollment.student.email)},${escapeCSV(totalPoints)},${escapeCSV(avgPercentage.toFixed(2))},${escapeCSV(getLetterGrade(avgPercentage))}\n`;
      }

      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="gradebook-${courseId}.csv"`
      });
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
);

function getLetterGrade(percentage: number): string {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

export { router as gradeRoutes };
