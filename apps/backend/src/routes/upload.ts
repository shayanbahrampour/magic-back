import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { describeUploadError, storeFile } from '../utils/storage';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max file size
});

// POST /api/upload (single or multiple files)
// Supports both `file` field (single) and `files` field (multiple)
router.post('/', requireAuth, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 20 }]), async (req, res) => {
  try {
    const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const allFiles: Express.Multer.File[] = [];

    if (req.file) allFiles.push(req.file);
    if (filesMap && filesMap.file) allFiles.push(...filesMap.file);
    if (filesMap && filesMap.files) allFiles.push(...filesMap.files);

    if (allFiles.length === 0) {
      return res.status(400).json({ error: 'هیچ فایلی برای آپلود ارسال نشده است.' });
    }

    const uploadedUrls: string[] = [];
    for (const file of allFiles) {
      uploadedUrls.push(await storeFile(file, req));
    }

    // Return single url if 1 file requested, plus urls array
    res.json({
      url: uploadedUrls[0],
      urls: uploadedUrls,
      message: 'آپلود با موفقیت انجام شد.',
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: describeUploadError(error) });
  }
});

export default router;
