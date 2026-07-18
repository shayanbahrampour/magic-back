import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { S3Client, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { requireAuth } from '../middleware/auth';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max file size
});

// Helper to get configured S3 client
function getS3Client() {
  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const rawEndpoint = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  const cleanEndpoint = rawEndpoint.replace(/\/+$/, ''); // Remove trailing slashes

  const rawBucket = process.env.S3_BUCKET || process.env.AWS_BUCKET || 'magicbook';
  // S3 bucket names must be lowercase and cannot contain slashes
  const cleanBucket = rawBucket.replace(/^\/+|\/+$/g, '').toLowerCase();

  const rawPublicEndpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_PUBLIC_URL || endpoint;
  const cleanPublicEndpoint = (rawPublicEndpoint.startsWith('http') ? rawPublicEndpoint : `https://${rawPublicEndpoint}`).replace(/\/+$/, '');

  return {
    client: new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: cleanEndpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO and PaaS S3-compatible object storage
    }),
    endpoint: cleanEndpoint,
    publicEndpoint: cleanPublicEndpoint,
    bucket: cleanBucket,
  };
}

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

    const s3Info = getS3Client();
    const uploadedUrls: string[] = [];

    for (const file of allFiles) {
      const ext = path.extname(file.originalname) || '.jpg';
      const filename = `uploads/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

      if (s3Info) {
        // Upload to S3 / MinIO with auto-bucket creation fallback
        const putObjectParams = {
          Bucket: s3Info.bucket,
          Key: filename,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'public-read' as const,
        };

        try {
          await s3Info.client.send(new PutObjectCommand(putObjectParams));
        } catch (s3Error: any) {
          if (s3Error.Code === 'NoSuchBucket' || s3Error.name === 'NoSuchBucket' || (s3Error.message && s3Error.message.includes('NoSuchBucket'))) {
            console.log(`[Upload] باکت «${s3Info.bucket}» وجود ندارد. در حال تلاش برای ایجاد خودکار باکت...`);
            try {
              await s3Info.client.send(new CreateBucketCommand({ Bucket: s3Info.bucket }));
              console.log(`[Upload] باکت «${s3Info.bucket}» با موفقیت ایجاد شد. تلاش مجدد برای آپلود...`);
              await s3Info.client.send(new PutObjectCommand(putObjectParams));
            } catch (createErr: any) {
              console.error('[Upload] ایجاد خودکار باکت ناموفق بود:', createErr);
              throw new Error(`باکت «${s3Info.bucket}» در سرویس ذخیره‌سازی ابری (S3/MinIO) وجود ندارد (NoSuchBucket) و تلاش برای ساخت خودکار آن توسط سرور با خطا مواجه شد (${createErr.message || createErr.Code}). لطفاً وارد پنل سرویس ابری خود شده و باکتی با نام «${s3Info.bucket}» ایجاد کنید، یا متغیر محیطی S3_BUCKET را به نام باکتی که از قبل ساخته‌اید تغییر دهید.`);
            }
          } else {
            throw s3Error;
          }
        }

        const publicUrl = `${s3Info.publicEndpoint}/${s3Info.bucket}/${filename}`;
        uploadedUrls.push(publicUrl);
      } else {
        // Local dev fallback if S3 keys are missing
        const localDir = path.join(__dirname, '../../../admin/public/uploads');
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        const localFilepath = path.join(localDir, path.basename(filename));
        fs.writeFileSync(localFilepath, file.buffer);
        uploadedUrls.push(`/uploads/${path.basename(filename)}`);
      }
    }

    // Return single url if 1 file requested, plus urls array
    res.json({
      url: uploadedUrls[0],
      urls: uploadedUrls,
      message: 'آپلود با موفقیت انجام شد.',
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    let errorMessage = error.message || 'خطا در آپلود فایل به سرور یا MinIO';
    if (error.Code === 'InvalidBucketName' || error.name === 'InvalidBucketName' || (error.message && error.message.includes('InvalidBucketName'))) {
      errorMessage = `نام باکت نامعتبر است (InvalidBucketName). طبق استانداردهای S3، نام باکت فقط باید شامل حروف کوچک انگلیسی، اعداد و خط‌تیره (-) باشد و نباید شامل حروف بزرگ (مثل MagicStore) یا اسلش (/) باشد. لطفاً نام باکت را در تنظیمات سرویس ابری و متغیر محیطی S3_BUCKET اصلاح کنید.`;
    } else if (error.Code === 'NoSuchBucket' || error.name === 'NoSuchBucket' || (error.message && error.message.includes('NoSuchBucket'))) {
      const bucketName = getS3Client()?.bucket || process.env.S3_BUCKET || 'magicstore';
      errorMessage = `باکت «${bucketName}» در سرویس ذخیره‌سازی ابری وجود ندارد (NoSuchBucket). لطفاً ابتدا این باکت را در پنل ابری خود بسازید یا نام آن را در متغیر محیطی S3_BUCKET اصلاح کنید.`;
    }
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
