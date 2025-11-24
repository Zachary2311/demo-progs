import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import { NotificationService } from '../services/notification.service';
import logger from '../utils/logger';

export class AssignmentController {
  static async createAssignment(req: AuthRequest, res: Response) {
    try {
      const {
        courseId,
        title,
        description,
        dueDate,
        maxScore,
        allowLateSubmission,
        lateDeductionPercent,
      } = req.body;

      const course = await prisma.course.findUnique({ where: { id: courseId } });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      // Check permissions
      const isInstructor = course.instructorId === req.user!.userId;
      const isAdmin = req.user!.roles.includes('admin');

      if (!isInstructor && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const assignment = await prisma.assignment.create({
        data: {
          courseId,
          title,
          description,
          dueDate: dueDate ? new Date(dueDate) : null,
          maxScore,
          allowLateSubmission,
          lateDeductionPercent,
        },
      });

      // Notify enrolled students
      const enrollments = await prisma.courseEnrollment.findMany({
        where: { courseId },
        select: { userId: true },
      });

      if (dueDate) {
        for (const enrollment of enrollments) {
          await NotificationService.notifyAssignmentDeadline(
            enrollment.userId,
            title,
            new Date(dueDate)
          );
        }
      }

      logger.info(`Assignment created: ${assignment.title} (${assignment.id})`);
      res.status(201).json(assignment);
    } catch (error) {
      logger.error('Create assignment error:', error);
      res.status(500).json({ error: 'Failed to create assignment' });
    }
  }

  static async getAssignments(req: AuthRequest, res: Response) {
    try {
      const { courseId } = req.query;

      if (!courseId) {
        return res.status(400).json({ error: 'courseId is required' });
      }

      const assignments = await prisma.assignment.findMany({
        where: { courseId: courseId as string },
        orderBy: { createdAt: 'desc' },
      });

      res.json(assignments);
    } catch (error) {
      logger.error('Get assignments error:', error);
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  }

  static async getAssignment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const assignment = await prisma.assignment.findUnique({
        where: { id },
      });

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      res.json(assignment);
    } catch (error) {
      logger.error('Get assignment error:', error);
      res.status(500).json({ error: 'Failed to fetch assignment' });
    }
  }

  static async submitAssignment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { content, fileUrl } = req.body;
      const userId = req.user!.userId;

      const assignment = await prisma.assignment.findUnique({
        where: { id },
      });

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      // Check if already submitted
      const existing = await prisma.assignmentSubmission.findFirst({
        where: {
          assignmentId: id,
          userId,
        },
      });

      if (existing) {
        return res.status(400).json({ error: 'Assignment already submitted' });
      }

      const now = new Date();
      const isLate = assignment.dueDate ? now > assignment.dueDate : false;

      if (isLate && !assignment.allowLateSubmission) {
        return res.status(400).json({ error: 'Late submissions are not allowed' });
      }

      const submission = await prisma.assignmentSubmission.create({
        data: {
          assignmentId: id,
          userId,
          content,
          fileUrl,
          isLate,
        },
      });

      // Log analytics
      await prisma.analyticsEvent.create({
        data: {
          userId,
          courseId: assignment.courseId,
          eventType: 'assignment_submit',
          metadata: JSON.stringify({ assignmentId: id, submissionId: submission.id }),
        },
      });

      logger.info(`Assignment submitted: ${id} by user ${userId}`);
      res.status(201).json(submission);
    } catch (error) {
      logger.error('Submit assignment error:', error);
      res.status(500).json({ error: 'Failed to submit assignment' });
    }
  }

  static async gradeSubmission(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { score, feedback } = req.body;

      const submission = await prisma.assignmentSubmission.findUnique({
        where: { id },
        include: {
          assignment: {
            include: {
              course: true,
            },
          },
          user: true,
        },
      });

      if (!submission) {
        return res.status(404).json({ error: 'Submission not found' });
      }

      // Check permissions
      const isInstructor = submission.assignment.course.instructorId === req.user!.userId;
      const isAdmin = req.user!.roles.includes('admin');

      if (!isInstructor && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      let finalScore = score;

      // Apply late deduction if applicable
      if (submission.isLate && submission.assignment.lateDeductionPercent) {
        const deduction = (score * submission.assignment.lateDeductionPercent) / 100;
        finalScore = Math.max(0, score - deduction);
      }

      const graded = await prisma.assignmentSubmission.update({
        where: { id },
        data: {
          score: finalScore,
          feedback,
          gradedAt: new Date(),
        },
      });

      // Notify student
      await NotificationService.notifyGradePosted(
        submission.userId,
        submission.assignment.course.title,
        finalScore
      );

      // Update overall grade
      await updateOverallGrade(submission.userId, submission.assignment.courseId);

      logger.info(`Assignment graded: ${id}, score: ${finalScore}`);
      res.json(graded);
    } catch (error) {
      logger.error('Grade submission error:', error);
      res.status(500).json({ error: 'Failed to grade submission' });
    }
  }

  static async getSubmissions(req: AuthRequest, res: Response) {
    try {
      const { assignmentId, courseId } = req.query;

      let where: any = {};

      if (assignmentId) {
        where.assignmentId = assignmentId;
      }

      if (courseId) {
        where.assignment = { courseId };
      }

      // Students can only see their own submissions
      if (!req.user!.roles.includes('instructor') && !req.user!.roles.includes('admin')) {
        where.userId = req.user!.userId;
      }

      const submissions = await prisma.assignmentSubmission.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          assignment: true,
        },
        orderBy: { submittedAt: 'desc' },
      });

      res.json(submissions);
    } catch (error) {
      logger.error('Get submissions error:', error);
      res.status(500).json({ error: 'Failed to fetch submissions' });
    }
  }
}

async function updateOverallGrade(userId: string, courseId: string) {
  // Get all assignment submissions for this course
  const submissions = await prisma.assignmentSubmission.findMany({
    where: {
      userId,
      assignment: {
        courseId,
      },
      score: { not: null },
    },
    include: {
      assignment: true,
    },
  });

  if (submissions.length === 0) return;

  const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
  const maxScore = submissions.reduce((sum, s) => sum + s.assignment.maxScore, 0);

  const overallGrade = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  let letterGrade = 'F';
  if (overallGrade >= 90) letterGrade = 'A';
  else if (overallGrade >= 80) letterGrade = 'B';
  else if (overallGrade >= 70) letterGrade = 'C';
  else if (overallGrade >= 60) letterGrade = 'D';

  await prisma.grade.upsert({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
    create: {
      userId,
      courseId,
      overallGrade,
      letterGrade,
    },
    update: {
      overallGrade,
      letterGrade,
    },
  });
}
