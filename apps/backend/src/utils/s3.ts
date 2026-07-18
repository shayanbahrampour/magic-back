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
