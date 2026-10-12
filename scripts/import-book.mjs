#!/usr/bin/env node
/**
 * Imports a book from a slots.json bundle (the Books-Skill output format) into a
 * running backend through the same admin REST API the panel uses — no manual
 * data entry, no direct database access.
 *
 * Each slot becomes one page: `text_fa` is the page text and the slot's image,
 * uploaded through /api/upload, is its single image.
 *
 * The run is resumable. Every created id and uploaded URL is written to a state
 * file next to slots.json, so re-running after a failure picks up where it
 * stopped instead of creating a second copy of the book.
 *
 * Usage:
 *   node scripts/import-book.mjs \
 *     --slots "/path/to/slots.json" \
 *     --api   https://your-domain.com/api \
 *     --token "<admin JWT>" \
 *     --category "توسعه فردی" \
 *     [--cover /path/to/cover.png] \
 *     [--price 120000] [--points-price 500] \
 *     [--free-chapters 1] \
 *     [--author "جان میدا"] [--title "قوانین سادگی"] \
 *     [--dry-run]
 *
 * The token is whatever the admin panel stores: open the panel, log in, then in
 * the browser console run `localStorage.getItem('admin_token')`.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function required(name) {
  const value = args[name];
  if (!value || value === true) {
    console.error(`Missing required --${name}`);
    process.exit(1);
  }
  return String(value);
}

const SLOTS_PATH = path.resolve(required('slots'));
const BOOK_DIR = path.dirname(SLOTS_PATH);
const API = required('api').replace(/\/+$/, '');
const TOKEN = args.token === undefined ? process.env.ADMIN_TOKEN : String(args.token);
const DRY_RUN = Boolean(args['dry-run']);
const STATE_PATH = args.state ? path.resolve(String(args.state)) : path.join(BOOK_DIR, '.import-state.json');

if (!TOKEN && !DRY_RUN) {
  console.error('Missing admin token. Pass --token or set ADMIN_TOKEN.');
  process.exit(1);
}

// Prices are whole tomans; 0 (the default) means the book is free.
const PRICE = Number(args.price ?? 0);
const POINTS_PRICE = Number(args['points-price'] ?? 0);
const IS_FREE = PRICE <= 0;
// How many leading chapters stay readable as a preview inside a paid book.
const FREE_CHAPTERS = Number(args['free-chapters'] ?? (IS_FREE ? 0 : 1));

// ---------------------------------------------------------------- state

const state = fs.existsSync(STATE_PATH)
  ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
  : { api: API, bookId: null, uploads: {}, chapters: {}, pages: {} };

if (state.api && state.api !== API) {
  console.error(
    `State file ${STATE_PATH} was written against ${state.api}, not ${API}.\n` +
      'Delete it or pass a different --state to import into another environment.'
  );
  process.exit(1);
}
state.api = API;

function saveState() {
  if (DRY_RUN) return;
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------- http

async function api(method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!res.ok) {
    const detail = payload && payload.error ? payload.error : text.slice(0, 300);
    throw new Error(`${method} ${endpoint} → ${res.status}: ${detail}`);
  }
  return payload;
}

// Uploads happen one file at a time so a failure mid-book costs one retry, not
// the whole batch, and so each URL can be recorded in the state as it lands.
async function uploadFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeFor(filePath) }), path.basename(filePath));

  const res = await fetch(`${API}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.url) {
    throw new Error(`upload ${path.basename(filePath)} → ${res.status}: ${payload?.error || 'no url returned'}`);
  }
  return payload.url;
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

// ---------------------------------------------------------------- import

const bundle = JSON.parse(fs.readFileSync(SLOTS_PATH, 'utf8'));
const meta = bundle.book || bundle;
const TITLE = String(args.title || meta.title_fa || meta.title_en || 'Untitled');
const AUTHOR = String(args.author || meta.author_fa || meta.author_en || 'Unknown');
const SHORT_DESC = String(args['short-description'] || meta.short_description_fa || '');
const FULL_DESC = String(args['full-description'] || meta.full_description_fa || SHORT_DESC);

// Fail before touching the server if any referenced image is missing, rather
// than discovering it halfway through a partially created book.
const missing = [];
for (const chapter of bundle.chapters) {
  for (const slot of chapter.slots) {
    if (!slot.image?.file) continue;
    const abs = path.resolve(BOOK_DIR, slot.image.file);
    if (!fs.existsSync(abs)) missing.push(slot.image.file);
  }
}
if (missing.length) {
  console.error(`Missing ${missing.length} image file(s):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

async function resolveCategoryIds() {
  const wanted = String(args.category || '').trim();
  if (!wanted) {
    throw new Error('Pass --category "<name>"; the book endpoint requires at least one category.');
  }
  const categories = await api('GET', '/categories');
  const found = categories.find((c) => c.name.trim() === wanted);
  if (found) return [found.id];
  if (args['create-category']) {
    const created = await api('POST', '/categories', { name: wanted });
    console.log(`  created category "${wanted}" (id ${created.id})`);
    return [created.id];
  }
  throw new Error(
    `Category "${wanted}" not found. Existing: ${categories.map((c) => c.name).join(', ')}. ` +
      'Pass --create-category to create it.'
  );
}

async function run() {
  console.log(`Importing "${TITLE}" → ${API}${DRY_RUN ? '  (dry run)' : ''}`);
  const slotCount = bundle.chapters.reduce((n, c) => n + c.slots.length, 0);
  const imageCount = bundle.chapters.reduce(
    (n, c) => n + c.slots.filter((s) => s.image?.file).length,
    0
  );
  console.log(`  ${bundle.chapters.length} chapters, ${slotCount} pages, ${imageCount} images`);
  console.log(`  ${IS_FREE ? 'free book' : `${PRICE} toman`}${POINTS_PRICE ? `, ${POINTS_PRICE} points` : ''}, first ${FREE_CHAPTERS} chapter(s) free`);

  if (DRY_RUN) {
    console.log('Dry run — nothing sent.');
    return;
  }

  // 1. Book
  if (!state.bookId) {
    const categoryIds = await resolveCategoryIds();
    let coverUrl = null;
    if (args.cover && args.cover !== true) {
      coverUrl = await uploadFile(path.resolve(String(args.cover)));
      console.log(`  cover uploaded`);
    }
    const book = await api('POST', '/books', {
      title: TITLE,
      author: AUTHOR,
      short_description: SHORT_DESC,
      full_description: FULL_DESC,
      cover_image_url: coverUrl,
      category_ids: categoryIds,
      is_free: IS_FREE,
      price_toman: PRICE,
      points_price: IS_FREE ? 0 : POINTS_PRICE,
    });
    state.bookId = book.id;
    saveState();
    console.log(`  book created (id ${book.id})`);
  } else {
    console.log(`  book already created (id ${state.bookId}) — resuming`);
  }

  // 2. Chapters and pages
  for (const chapter of bundle.chapters) {
    const chapterNumber = Number(chapter.number ?? bundle.chapters.indexOf(chapter) + 1);
    const chapterKey = String(chapterNumber);
    if (!state.chapters[chapterKey]) {
      const created = await api('POST', '/chapters', {
        book_id: state.bookId,
        title: chapter.title_fa || chapter.title_en || `فصل ${chapterNumber}`,
        chapter_order: chapterNumber,
        is_free: chapterNumber <= FREE_CHAPTERS,
      });
      state.chapters[chapterKey] = created.id;
      saveState();
    }
    const chapterId = state.chapters[chapterKey];
    console.log(`  chapter ${chapterNumber} (id ${chapterId})`);

    let pageNumber = 0;
    for (const slot of chapter.slots) {
      pageNumber++;
      if (state.pages[slot.id]) continue;

      let imageUrls = [];
      if (slot.image?.file) {
        if (!state.uploads[slot.id]) {
          state.uploads[slot.id] = await uploadFile(path.resolve(BOOK_DIR, slot.image.file));
          saveState();
        }
        imageUrls = [state.uploads[slot.id]];
      }

      const page = await api('POST', '/pages', {
        chapter_id: chapterId,
        page_number: pageNumber,
        text_content: slot.text_fa || slot.text_en || null,
        image_urls: imageUrls,
        // 9:16 art is drawn to fill the screen, as is any image slot that
        // carries no words of its own.
        is_full_page:
          Boolean(slot.image?.file) &&
          (slot.image.ratio === '9:16' || (!slot.text_fa && !slot.text_en)),
      });
      state.pages[slot.id] = page.id;
      saveState();
      process.stdout.write(`    page ${pageNumber} (${slot.id})${imageUrls.length ? ' +image' : ''}\n`);
    }
  }

  console.log(`\nDone. Book id ${state.bookId}. State: ${STATE_PATH}`);
}

run().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  console.error(`Progress saved to ${STATE_PATH} — re-run the same command to resume.`);
  process.exit(1);
});
