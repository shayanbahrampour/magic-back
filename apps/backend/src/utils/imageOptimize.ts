import path from 'path';
import sharp from 'sharp';

// Book pages are shown on phones, so nothing needs more than this on its long
// side. Smaller sources are never enlarged.
const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 80;

// Raster formats worth re-encoding. GIFs (may be animated) and SVGs (vector)
// are stored as uploaded.
const CONVERTIBLE = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif']);
const CONVERTIBLE_EXT = /\.(png|jpe?g|webp|heic|heif)$/i;

export interface ImageFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export function isConvertibleImage(file: Pick<ImageFile, 'originalname' | 'mimetype'>): boolean {
  return CONVERTIBLE.has(file.mimetype.toLowerCase()) || CONVERTIBLE_EXT.test(file.originalname);
}

/** Resizes and re-encodes an image buffer as WebP. */
export async function toWebp(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: 'none' })
    .rotate() // honour EXIF orientation before it is stripped
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/**
 * Resizes an image to at most `width` pixels wide (never enlarging) and
 * re-encodes it as WebP — the on-request variants served by /api/files?w=.
 */
export async function toWebpWidth(buffer: Buffer, width: number): Promise<Buffer> {
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/**
 * Returns the file as a compact WebP, renamed to `.webp`. PNG book pages shrink
 * roughly 20× this way, which is most of what the reader waits for. Anything
 * that isn't a convertible image — or fails to decode — is returned unchanged,
 * so an upload never fails because of optimisation.
 */
export async function optimizeImage<T extends ImageFile>(file: T): Promise<T> {
  if (!isConvertibleImage(file)) return file;
  try {
    const buffer = await toWebp(file.buffer);
    const base = path.basename(file.originalname, path.extname(file.originalname));
    return { ...file, buffer, originalname: `${base}.webp`, mimetype: 'image/webp' };
  } catch (error) {
    console.warn(`[Upload] Image optimisation failed for "${file.originalname}", storing original:`, error);
    return file;
  }
}
