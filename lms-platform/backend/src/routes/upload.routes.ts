import { Router } from 'express';
import { UploadController, upload } from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/', upload.single('file'), UploadController.uploadFile);
router.delete('/:id', UploadController.deleteFile);

export default router;
