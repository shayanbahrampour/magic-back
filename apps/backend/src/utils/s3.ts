import { S3Client } from '@aws-sdk/client-s3';
import express from 'express';

export interface S3Info {
  client: S3Client;
  endpoint: string;
  publicEndpoint: string;
  bucket: string;
}

export function getS3Client(): S3Info | null {
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

  const rawPublicEndpoint = process.env.S3_ENDPOINT || process.env.S3_PUBLIC_URL || endpoint;
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

export function getAppPublicUrl(req: express.Request): string {
  // 1. If explicit public URL is configured via environment variables
  const envUrl = process.env.APP_PUBLIC_URL || process.env.PUBLIC_URL || process.env.APP_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  // 2. Derive from incoming request (handles reverse proxies such as Nginx/Cloudflare/Docker)
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${process.env.PORT || 5001}`;
  return `${protocol}://${host}`;
}

export function normalizeFileUrl(url: string | null | undefined, req?: express.Request): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const baseUrl = req ? getAppPublicUrl(req) : '';

  // If already pointing to /api/files/
  if (trimmed.includes('/api/files/')) {
    if (trimmed.startsWith('/api/files/')) {
      return baseUrl ? `${baseUrl}${trimmed}` : trimmed;
    }
    // If it's an absolute URL that already has /api/files/, return as is
    return trimmed;
  }

  const s3Info = getS3Client();
  const bucket = s3Info?.bucket || process.env.S3_BUCKET || 'magicstore';

  let key: string | null = null;

  // Check if url is an absolute http/https or internal minio url
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const path = parsed.pathname.replace(/^\/+/, '');
      if (path.startsWith(`${bucket}/`)) {
        key = path.slice(bucket.length + 1);
      } else if (path.startsWith('uploads/') || path.includes('/uploads/')) {
        const uploadIdx = path.indexOf('uploads/');
        key = path.slice(uploadIdx);
      } else if (parsed.port === '9000' || parsed.hostname.startsWith('10.') || parsed.hostname === 'localhost' || parsed.hostname === 'minio') {
        // Any internal endpoint with port 9000 or private IP
        key = path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
      }
    } catch {
      // Ignore URL parse errors
    }
  } else if (trimmed.startsWith(`/${bucket}/`) || trimmed.startsWith(`${bucket}/`)) {
    const cleanPath = trimmed.replace(/^\/+/, '');
    key = cleanPath.slice(bucket.length + 1);
  } else if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
    key = trimmed.replace(/^\/+/, '');
  }

  if (key) {
    return baseUrl ? `${baseUrl}/api/files/${key}` : `/api/files/${key}`;
  }

  return trimmed;
}
