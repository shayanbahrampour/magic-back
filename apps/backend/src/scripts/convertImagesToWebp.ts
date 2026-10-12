/**
 * One-time migration: converts every stored PNG/JPEG referenced by the database
 * (book covers, page images, user avatars) to WebP and points the database at
 * the new files.
 *
 *   node dist/scripts/convertImagesToWebp.js           # dry run: lists what would change
 *   node dist/scripts/convertImagesToWebp.js --apply   # converts and updates the database
 *
 * Run it on the server (next to MinIO) after deploying this build — it reads
 * the same S3_* / DATABASE_URL environment as the backend.
 *
 * Safe to re-run: already-converted URLs are skipped. The original files are
 * left in storage untouched, so the change can be reverted by restoring the
 * old URLs; delete them by hand once the app is confirmed working.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import prisma from '../db';
import { getS3Client } from '../utils/s3';
import { toWebp } from '../utils/imageOptimize';

const APPLY = process.argv.includes('--apply');
const CONCURRENCY = 4;
const FILES_MARKER = '/api/files/';
const CONVERTIBLE_URL = /\.(png|jpe?g)$/i;

function storageKey(url: string): string | null {
  const at = url.indexOf(FILES_MARKER);
  if (at === -1) return null;
  return decodeURIComponent(url.slice(at + FILES_MARKER.length).split(/[?#]/)[0]);
}

function isConvertibleUrl(url: string): boolean {
  const key = storageKey(url);
  return key !== null && CONVERTIBLE_URL.test(key);
}

function toWebpUrl(url: string): string {
  return url.replace(/\.(png|jpe?g)(?=([?#].*)?$)/i, '.webp');
}

/** Every /api/files/... URL inside a block of text (for HTML page content). */
function urlsInText(text: string | null): string[] {
  if (!text) return [];
  return text.match(/https?:\/\/[^\s"'<>)]+\/api\/files\/[^\s"'<>)]+|\/api\/files\/[^\s"'<>)]+/g) ?? [];
}

function parseImageUrls(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const s3 = getS3Client();
const localDir = path.join(__dirname, '../../../admin/public/uploads');

async function readObject(key: string): Promise<Buffer> {
  if (!s3) return fs.readFileSync(path.join(localDir, path.basename(key)));
  // Keys are sometimes stored with the bucket name in front (see routes/files.ts).
  const candidates = key.startsWith(`${s3.bucket}/`) ? [key, key.slice(s3.bucket.length + 1)] : [key];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const res = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: candidate }));
      return Buffer.from(await res.Body!.transformToByteArray());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function writeObject(key: string, body: Buffer): Promise<void> {
  if (!s3) {
    fs.writeFileSync(path.join(localDir, path.basename(key)), body);
    return;
  }
  const bareKey = key.startsWith(`${s3.bucket}/`) ? key.slice(s3.bucket.length + 1) : key;
  await s3.client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: bareKey,
      Body: body,
      ContentType: 'image/webp',
      ACL: 'public-read',
    })
  );
}

async function main() {
  const [books, users, pages] = await Promise.all([
    prisma.book.findMany({ select: { id: true, cover_image_url: true } }),
    prisma.user.findMany({ select: { id: true, avatar_url: true } }),
    prisma.page.findMany({ select: { id: true, image_urls: true, text_content: true } }),
  ]);

  const urls = new Set<string>();
  for (const b of books) if (b.cover_image_url && isConvertibleUrl(b.cover_image_url)) urls.add(b.cover_image_url);
  for (const u of users) if (u.avatar_url && isConvertibleUrl(u.avatar_url)) urls.add(u.avatar_url);
  for (const p of pages) {
    for (const url of [...parseImageUrls(p.image_urls), ...urlsInText(p.text_content)]) {
      if (isConvertibleUrl(url)) urls.add(url);
    }
  }

  console.log(`Found ${urls.size} PNG/JPEG image(s) to convert.`);
  if (!APPLY) {
    for (const url of urls) console.log(`  ${url}  ->  ${toWebpUrl(url)}`);
    console.log('\nDry run — nothing changed. Re-run with --apply to convert.');
    return;
  }

  // 1) Convert files. Only successfully converted URLs get rewritten below.
  const converted = new Map<string, string>();
  let before = 0;
  let after = 0;
  const queue = [...urls];
  let done = 0;

  async function worker() {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const key = storageKey(url)!;
      try {
        const original = await readObject(key);
        const webp = await toWebp(original);
        await writeObject(key.replace(/\.(png|jpe?g)$/i, '.webp'), webp);
        converted.set(url, toWebpUrl(url));
        before += original.length;
        after += webp.length;
      } catch (error: any) {
        console.warn(`  ! Skipped ${key}: ${error?.message || error}`);
      }
      done += 1;
      if (done % 10 === 0 || done === urls.size) console.log(`  converted ${done}/${urls.size}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // 2) Point the database at the new files.
  const swap = (url: string) => converted.get(url) ?? url;
  const swapText = (text: string) => {
    let out = text;
    for (const [from, to] of converted) out = out.split(from).join(to);
    return out;
  };

  let rows = 0;
  for (const b of books) {
    if (b.cover_image_url && converted.has(b.cover_image_url)) {
      await prisma.book.update({ where: { id: b.id }, data: { cover_image_url: swap(b.cover_image_url) } });
      rows += 1;
    }
  }
  for (const u of users) {
    if (u.avatar_url && converted.has(u.avatar_url)) {
      await prisma.user.update({ where: { id: u.id }, data: { avatar_url: swap(u.avatar_url) } });
      rows += 1;
    }
  }
  for (const p of pages) {
    const imageUrls = parseImageUrls(p.image_urls);
    const nextImageUrls = imageUrls.map(swap);
    const nextText = p.text_content ? swapText(p.text_content) : p.text_content;
    const imagesChanged = nextImageUrls.some((u, i) => u !== imageUrls[i]);
    if (imagesChanged || nextText !== p.text_content) {
      await prisma.page.update({
        where: { id: p.id },
        data: { image_urls: JSON.stringify(nextImageUrls), text_content: nextText },
      });
      rows += 1;
    }
  }

  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  console.log(
    `\nDone: ${converted.size}/${urls.size} image(s) converted, ${rows} database row(s) updated.` +
      `\nSize: ${mb(before)} MB -> ${mb(after)} MB.` +
      `\nOriginal files were kept; remove them once the app is confirmed working.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
