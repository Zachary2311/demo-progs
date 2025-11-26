import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, Decimal } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

// Create assignment
router.post('/', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        courseId,
        lessonId,
        title,
        description,
        totalPoints,
        dueDate,
        allowLateSubmission,
        lateSubmissionPenaltyPercent,
        submissionType,
        rubric
      } = req.body;

      if (!courseId || !title) throw new AppError(400, 'Course ID and title required');

      const assignment = await prisma.assignment.create({
        data: {
          courseId: BigInt(courseId),
          lessonId: lessonId ? BigInt(lessonId) : null,
          title,
          description,
          totalPoints: totalPoints || 100,
          dueDate: dueDate ? new Date(dueDate) : null,
          allowLateSubmission: allowLateSubmission !== false,
          lateSubmissionPenaltyPercent: lateSubmissionPenaltyPercent || 10,
          submissionType: submissionType || 'BOTH',
          rubric: rubric ? JSON.stringify(rubric) : null
        }
      });

      res.status(201).json(assignment);
    } catch (error) {
      next(error);
    }
  }
);

// Get assignment by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const assignment = await prisma.assignment.findUnique({
      where: { id: BigInt(id) },
      include: {
        course: { select: { id: true, title: true } },
        files: true,
        submissions: { select: { id: true, status: true, studentId: true } }
      }
    });

    if (!assignment) throw new AppError(404, 'Assignment not found');

    res.json(assignment);
  } catch (error) {
    next(error);
    }
  }
);

// Get submissions for an assignment
router.get('/:assignmentId/submissions', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { assignmentId } = req.params;

      const submissions = await prisma.submission.findMany({
        where: { assignmentId: BigInt(assignmentId) },
        include: {
          student: { select: { id: true, username: true, email: true } },
          files: { include: { file: true } },
          grades: true
        },
        orderBy: { submittedAt: 'desc' }
      });

      res.json(submissions);
    } catch (error) {
      next(error);
    }
  }
);

// Create submission
router.post('/:assignmentId/submit', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { assignmentId } = req.params;
    const { submissionText, fileIds } = req.body;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const assignment = await prisma.assignment.findUnique({
      where: { id: BigInt(assignmentId) }
    });

    if (!assignment) throw new AppError(404, 'Assignment not found');

    // Check due date
    const isLate = assignment.dueDate && new Date() > assignment.dueDate;
    if (isLate && !assignment.allowLateSubmission) {
      throw new AppError(400, 'Late submissions not allowed');
    }

    const submission = await prisma.submission.create({
      data: {
        assignmentId: BigInt(assignmentId),
        studentId: BigInt(req.user.id),
        submissionText,
        submittedAt: new Date(),
        isLate: isLate || false,
        status: 'SUBMITTED'
      }
    });

    // Link files if provided
    if (fileIds && Array.isArray(fileIds)) {
      await Promise.all(
        fileIds.map(fileId =>
          prisma.submissionFile.create({
            data: {
              submissionId: submission.id,
              fileId: BigInt(fileId)
            }
          })
        )
      );
    }

    res.status(201).json(submission);
  } catch (error) {
    next(error);
    }
  }
);

// Grade submission
router.post('/:submissionId/grade', authMiddleware, requireRole(['instructor', 'admin']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { submissionId } = req.params;
      const { points, feedback } = req.body;
      if (!req.user) throw new AppError(401, 'Not authenticated');

      const submission = await prisma.submission.findUnique({
        where: { id: BigInt(submissionId) },
        include: { assignment: true }
      });

      if (!submission) throw new AppError(404, 'Submission not found');

      const percentage = (points / submission.assignment.totalPoints) * 100;
      const letterGrade = getLetterGrade(percentage);

      const grade = await prisma.grade.create({
        data: {
          submissionId: BigInt(submissionId),
          courseId: submission.assignment.courseId,
          studentId: submission.studentId,
          points: parseFloat(points),
          percentage: new Decimal(percentage.toFixed(2)),
          letterGrade,
          feedback,
          gradedBy: BigInt(req.user.id),
          gradedAt: new Date()
        }
      });

      // Update submission status
      await prisma.submission.update({
        where: { id: BigInt(submissionId) },
        data: { status: 'GRADED' }
      });

      res.json(grade);
    } catch (error) {
      next(error);
    }
  }
);

// Get student's submission
router.get('/:assignmentId/my-submission', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { assignmentId } = req.params;
    if (!req.user) throw new AppError(401, 'Not authenticated');

    const submission = await prisma.submission.findFirst({
      where: {
        assignmentId: BigInt(assignmentId),
        studentId: BigInt(req.user.id)
      },
      include: {
        files: { include: { file: true } },
        grades: true
      }
    });

    res.json(submission || null);
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

export { router as assignmentRoutes };
