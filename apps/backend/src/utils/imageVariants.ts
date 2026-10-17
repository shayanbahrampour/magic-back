import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { toWebpWidth } from './imageOptimize';

/**
 * Widths the app may ask for with `/api/files/...?w=`. A fixed set keeps the
 * cache bounded — an arbitrary `w` would let any caller fill the disk.
 * 800 covers book cards and the detail hero; 1080 covers full-width reader pages.
 */
export const VARIANT_WIDTHS = [400, 800, 1080] as const;

// Raster sources worth resizing. GIFs (may be animated) and SVGs are served as stored.
const RESIZABLE_KEY = /\.(png|jpe?g|webp)$/i;

// Variants are derived data, so they live in temp storage and are simply
// rebuilt after a restart. Uploads are never overwritten (every upload gets a
// fresh timestamped key), so a cached variant can't go stale.
const CACHE_DIR = path.join(os.tmpdir(), 'magic-file-variants');

// Concurrent requests for the same variant share one resize.
const inFlight = new Map<string, Promise<Buffer | null>>();

/** The requested variant width, or null when `?w=` is absent or not allowed. */
export function parseVariantWidth(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const width = Number(raw);
  return (VARIANT_WIDTHS as readonly number[]).includes(width) ? width : null;
}

export function isResizableKey(key: string): boolean {
  return RESIZABLE_KEY.test(key);
}

function cachePath(key: string, width: number): string {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(CACHE_DIR, `${hash}-${width}.webp`);
}

/**
 * Returns the WebP variant of `key` at `width`, from the disk cache or by
 * resizing the original that `readOriginal` loads. Null when the original
 * doesn't exist or can't be decoded, so the caller can fall back to it.
 */
export async function getVariant(
  key: string,
  width: number,
  readOriginal: () => Promise<Buffer | null>
): Promise<Buffer | null> {
  const file = cachePath(key, width);
  try {
    return await fs.promises.readFile(file);
  } catch {
    // not cached yet
  }

  const pending = inFlight.get(file);
  if (pending) return pending;

  const work = (async () => {
    const original = await readOriginal();
    if (!original) return null;
    let variant: Buffer;
    try {
      variant = await toWebpWidth(original, width);
    } catch (error) {
      console.warn(`[File Variant] Could not resize "${key}" to ${width}px:`, error);
      return null;
    }
    // Write-then-rename so a concurrent reader never sees a half-written file.
    try {
      await fs.promises.mkdir(CACHE_DIR, { recursive: true });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await fs.promises.writeFile(tmp, variant);
      await fs.promises.rename(tmp, file);
    } catch (error) {
      // Serving still works without the cache; it just resizes again next time.
      console.warn(`[File Variant] Could not cache "${key}" @${width}:`, error);
    }
    return variant;
  })().finally(() => inFlight.delete(file));

  inFlight.set(file, work);
  return work;
}
