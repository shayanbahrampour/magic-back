import { Router, Request, Response } from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';
import { getS3Client } from '../utils/s3';

const router = Router();

// GET /api/files/* or /files/*
// Streams files from MinIO / S3 (or local filesystem fallback) to the client
router.get('/*', async (req: Request, res: Response) => {
  try {
    // Extract key from the wildcard path
    let key = decodeURIComponent(req.path.replace(/^\/+/, ''));
    if (!key) {
      return res.status(400).json({ error: 'نام یا مسیر فایل مشخص نشده است' });
    }

    const s3Info = getS3Client();

    if (s3Info) {
      // List of possible keys/buckets to try in MinIO (handling cases where bucket name is or isn't part of the key)
      const attempts: { bucket: string; key: string }[] = [
        { bucket: s3Info.bucket, key },
      ];

      if (key.startsWith(`${s3Info.bucket}/`)) {
        attempts.push({
          bucket: s3Info.bucket,
          key: key.slice(s3Info.bucket.length + 1),
        });
      }

      if (key.includes('/')) {
        const parts = key.split('/');
        const possibleBucket = parts[0];
        const possibleKey = parts.slice(1).join('/');
        if (possibleBucket !== s3Info.bucket) {
          attempts.push({ bucket: possibleBucket, key: possibleKey });
        }
      }

      for (const attempt of attempts) {
        try {
          const getObjectParams = {
            Bucket: attempt.bucket,
            Key: attempt.key,
            ...(req.headers.range ? { Range: req.headers.range } : {}),
          };

          const response = await s3Info.client.send(new GetObjectCommand(getObjectParams));

          // Set appropriate HTTP headers
          if (response.ContentType) {
            res.setHeader('Content-Type', response.ContentType);
          } else {
            const ext = path.extname(attempt.key).toLowerCase();
            const mimeTypes: { [key: string]: string } = {
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png',
              '.gif': 'image/gif',
              '.webp': 'image/webp',
              '.svg': 'image/svg+xml',
              '.pdf': 'application/pdf',
              '.mp4': 'video/mp4',
              '.mp3': 'audio/mpeg',
            };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          }

          if (response.ContentLength !== undefined) {
            res.setHeader('Content-Length', response.ContentLength.toString());
          }
          if (response.ETag) {
            res.setHeader('ETag', response.ETag);
          }
          if (response.LastModified) {
            res.setHeader('Last-Modified', response.LastModified.toUTCString());
          }

          res.setHeader('Cache-Control', 'public, max-age=31536000');
          res.setHeader('Accept-Ranges', 'bytes');

          if (response.$metadata?.httpStatusCode === 206 && response.ContentRange) {
            res.status(206);
            res.setHeader('Content-Range', response.ContentRange);
          } else {
            res.status(200);
          }

          if (response.Body) {
            const stream = typeof (response.Body as any)?.pipe === 'function'
              ? (response.Body as any)
              : Readable.from(response.Body as any);

            stream.on('error', (streamErr: any) => {
              console.error(`[File Stream Error] Key: ${attempt.key}`, streamErr);
              if (!res.headersSent) {
                res.status(500).json({ error: 'خطا در خواندن جریان فایل از سرویس ذخیره‌سازی' });
              } else {
                res.end();
              }
            });

            stream.pipe(res);
            return;
          }
        } catch (s3Error: any) {
          // If error is NoSuchKey or NotFound, we try the next attempt or local fallback
          if (
            s3Error.name === 'NoSuchKey' ||
            s3Error.name === 'NotFound' ||
            s3Error.Code === 'NoSuchKey' ||
            s3Error.$metadata?.httpStatusCode === 404
          ) {
            continue;
          }
          // If network error with MinIO, log and fall through to local fallback check
          console.warn(`[File Stream Warning] S3 GetObject error for key "${attempt.key}":`, s3Error.message || s3Error);
        }
      }
    }

    // Local filesystem fallback
    const localPaths = [
      path.join(__dirname, '../../../admin/public', key),
      path.join(__dirname, '../../admin/dist', key),
      path.join(__dirname, '../../../admin/public/uploads', path.basename(key)),
      path.join(__dirname, '../../admin/dist/uploads', path.basename(key)),
    ];

    for (const localPath of localPaths) {
      if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
        return res.sendFile(path.resolve(localPath));
      }
    }

    res.status(404).json({ error: 'فایل مورد نظر در سرویس ذخیره‌سازی یا سرور یافت نشد' });
  } catch (error: any) {
    console.error('File stream route error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'خطای داخلی سرور در دریافت فایل' });
    } else {
      res.end();
    }
  }
});

export default router;
