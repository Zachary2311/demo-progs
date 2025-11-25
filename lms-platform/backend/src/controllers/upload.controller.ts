import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/database';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileTypeFromFile } from 'file-type';
import logger from '../utils/logger';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'video/mp4',
    'video/webm',
    'application/zip',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB default
  },
});

export class UploadController {
  static async uploadFile(req: AuthRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { lessonId } = req.body;

      // SECURITY FIX: Verify file type using magic numbers (file signature)
      const filePath = path.join(UPLOAD_DIR, req.file.filename);
      const fileType = await fileTypeFromFile(filePath);

      const allowedMimeTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/pdf',
        'video/mp4',
        'video/webm',
        'application/zip',
      ];

      // If file type is detected and doesn't match allowed types, reject it
      if (fileType && !allowedMimeTypes.includes(fileType.mime)) {
        // Delete the uploaded file
        fs.unlinkSync(filePath);
        logger.warn(`File upload rejected: Invalid file type ${fileType.mime} for ${req.file.originalname}`);
        return res.status(400).json({
          error: 'Invalid file type',
          details: `File appears to be ${fileType.mime}, which is not allowed`,
        });
      }

      // Construct file URL
      const fileUrl = `${process.env.API_URL}/uploads/${req.file.filename}`;

      const file = await prisma.file.create({
        data: {
          lessonId: lessonId || null,
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimeType: fileType?.mime || req.file.mimetype,
          size: req.file.size,
          url: fileUrl,
        },
      });

      logger.info(`File uploaded: ${file.filename} (${file.id})`);
      res.status(201).json(file);
    } catch (error) {
      logger.error('Upload file error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }

  static async deleteFile(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const file = await prisma.file.findUnique({
        where: { id },
        include: {
          lesson: {
            include: {
              module: {
                include: {
                  course: true,
                },
              },
            },
          },
        },
      });

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Check permissions
      if (file.lesson) {
        const isInstructor = file.lesson.module.course.instructorId === req.user!.userId;
        const isAdmin = req.user!.roles.includes('admin');

        if (!isInstructor && !isAdmin) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      // Delete file from filesystem
      const filePath = path.join(UPLOAD_DIR, file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete file record from database
      await prisma.file.delete({ where: { id } });

      logger.info(`File deleted: ${file.filename} (${id})`);
      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      logger.error('Delete file error:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  }
}
