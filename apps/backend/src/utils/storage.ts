import path from 'path';
import fs from 'fs';
import express from 'express';
import { PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getS3Client, getAppPublicUrl } from './s3';

/** The parts of a multer file this module needs. */
export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/**
 * Stores one uploaded file and returns its public `/api/files/...` URL.
 *
 * Uses S3/MinIO when credentials are configured (creating the bucket on first
 * use if it is missing) and falls back to the local uploads directory in dev.
 * `prefix` groups objects by kind — `uploads` for admin content, `avatars` for
 * profile pictures.
 */
export async function storeFile(
  file: UploadedFile,
  req: express.Request,
  prefix = 'uploads'
): Promise<string> {
  const ext = path.extname(file.originalname) || '.jpg';
  const filename = `${prefix}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const appPublicUrl = getAppPublicUrl(req);
  const s3Info = getS3Client();

  if (!s3Info) {
    // Local dev fallback if S3 keys are missing.
    const localDir = path.join(__dirname, '../../../admin/public/uploads');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.writeFileSync(path.join(localDir, path.basename(filename)), file.buffer);
    return `${appPublicUrl}/api/files/${filename}`;
  }

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
    const missingBucket =
      s3Error.Code === 'NoSuchBucket' ||
      s3Error.name === 'NoSuchBucket' ||
      (s3Error.message && s3Error.message.includes('NoSuchBucket'));

    if (!missingBucket) throw s3Error;

    console.log(`[Upload] باکت «${s3Info.bucket}» وجود ندارد. در حال تلاش برای ایجاد خودکار باکت...`);
    try {
      await s3Info.client.send(new CreateBucketCommand({ Bucket: s3Info.bucket }));
      console.log(`[Upload] باکت «${s3Info.bucket}» با موفقیت ایجاد شد. تلاش مجدد برای آپلود...`);
      await s3Info.client.send(new PutObjectCommand(putObjectParams));
    } catch (createErr: any) {
      console.error('[Upload] ایجاد خودکار باکت ناموفق بود:', createErr);
      throw new Error(
        `باکت «${s3Info.bucket}» در سرویس ذخیره‌سازی ابری (S3/MinIO) وجود ندارد (NoSuchBucket) و تلاش برای ساخت خودکار آن توسط سرور با خطا مواجه شد (${createErr.message || createErr.Code}). لطفاً وارد پنل سرویس ابری خود شده و باکتی با نام «${s3Info.bucket}» ایجاد کنید، یا متغیر محیطی S3_BUCKET را به نام باکتی که از قبل ساخته‌اید تغییر دهید.`
      );
    }
  }

  return `${appPublicUrl}/api/files/${filename}`;
}

/** Turns a storage failure into a Persian message worth showing the caller. */
export function describeUploadError(error: any): string {
  const message: string = error?.message || 'خطا در آپلود فایل به سرور یا MinIO';

  if (
    error?.Code === 'InvalidBucketName' ||
    error?.name === 'InvalidBucketName' ||
    message.includes('InvalidBucketName')
  ) {
    return 'نام باکت نامعتبر است (InvalidBucketName). طبق استانداردهای S3، نام باکت فقط باید شامل حروف کوچک انگلیسی، اعداد و خط‌تیره (-) باشد و نباید شامل حروف بزرگ (مثل MagicStore) یا اسلش (/) باشد. لطفاً نام باکت را در تنظیمات سرویس ابری و متغیر محیطی S3_BUCKET اصلاح کنید.';
  }

  if (
    error?.Code === 'NoSuchBucket' ||
    error?.name === 'NoSuchBucket' ||
    message.includes('NoSuchBucket')
  ) {
    const bucketName = getS3Client()?.bucket || process.env.S3_BUCKET || 'magicstore';
    return `باکت «${bucketName}» در سرویس ذخیره‌سازی ابری وجود ندارد (NoSuchBucket). لطفاً ابتدا این باکت را در پنل ابری خود بسازید یا نام آن را در متغیر محیطی S3_BUCKET اصلاح کنید.`;
  }

  return message;
}
