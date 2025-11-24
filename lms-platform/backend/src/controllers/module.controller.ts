import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import logger from '../utils/logger';

export class ModuleController {
  static async createModule(req: AuthRequest, res: Response) {
    try {
      const { courseId, title, description, orderIndex } = req.body;

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

      const module = await prisma.module.create({
        data: {
          courseId,
          title,
          description,
          orderIndex,
        },
      });

      logger.info(`Module created: ${module.title} (${module.id})`);
      res.status(201).json(module);
    } catch (error) {
      logger.error('Create module error:', error);
      res.status(500).json({ error: 'Failed to create module' });
    }
  }

  static async updateModule(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, description, orderIndex } = req.body;

      const module = await prisma.module.findUnique({
        where: { id },
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

      const updated = await prisma.module.update({
        where: { id },
        data: { title, description, orderIndex },
      });

      res.json(updated);
    } catch (error) {
      logger.error('Update module error:', error);
      res.status(500).json({ error: 'Failed to update module' });
    }
  }

  static async deleteModule(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const module = await prisma.module.findUnique({
        where: { id },
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

      await prisma.module.delete({ where: { id } });

      logger.info(`Module deleted: ${id}`);
      res.json({ message: 'Module deleted successfully' });
    } catch (error) {
      logger.error('Delete module error:', error);
      res.status(500).json({ error: 'Failed to delete module' });
    }
  }
}
