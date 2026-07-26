import { Router } from 'express';
import prisma from '../db';
import { requireUser, UserAuthRequest } from '../middleware/userAuth';

const router = Router();

// All bookmark endpoints require a logged-in app user.
router.use(requireUser);

// Shapes a bookmark row (with its chapter+book included) for the client.
function shapeBookmark(bookmark: {
  id: number;
  page_number: number;
  created_at: Date;
  chapter: {
    id: number;
    title: string;
    chapter_order: number;
    book: { id: number; title: string; author: string; cover_image_url: string | null };
  };
}) {
  return {
    id: bookmark.id,
    pageNumber: bookmark.page_number,
    createdAt: bookmark.created_at,
    book: {
      id: bookmark.chapter.book.id,
      title: bookmark.chapter.book.title,
      author: bookmark.chapter.book.author,
      coverImageUrl: bookmark.chapter.book.cover_image_url ?? null,
    },
    chapter: {
      id: bookmark.chapter.id,
      title: bookmark.chapter.title,
      chapterOrder: bookmark.chapter.chapter_order,
    },
  };
}

const BOOKMARK_INCLUDE = {
  chapter: { include: { book: true } },
} as const;

// GET /api/user/bookmarks
// Every page the user has bookmarked, most recent first, with book/chapter
// context so the "Saved" screen can render and deep-link into the reader.
router.get('/', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  try {
    const bookmarks = await prisma.bookmark.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: BOOKMARK_INCLUDE,
    });
    res.json({ bookmarks: bookmarks.map(shapeBookmark) });
  } catch (error) {
    console.error('[BOOKMARKS] list error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// GET /api/user/bookmarks/chapters/:chapterId
// The page numbers the user has bookmarked in a single chapter, so the reader
// can show a filled/outline bookmark icon per page. Returns { pages: number[] }.
router.get('/chapters/:chapterId', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const chapterId = Number(req.params.chapterId);
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return res.status(400).json({ error: 'شناسه فصل نامعتبر است.' });
  }

  try {
    const rows = await prisma.bookmark.findMany({
      where: { user_id: userId, chapter_id: chapterId },
      orderBy: { page_number: 'asc' },
      select: { page_number: true },
    });
    res.json({ pages: rows.map((r) => r.page_number) });
  } catch (error) {
    console.error('[BOOKMARKS] chapter list error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// POST /api/user/bookmarks
// Body: { chapterId: number, pageNumber: number }
// Bookmarks a page. Idempotent — re-bookmarking the same page returns the
// existing bookmark instead of erroring.
router.post('/', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const chapterId = Number(req.body?.chapterId);
  const pageNumber = Number(req.body?.pageNumber);

  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return res.status(400).json({ error: 'شناسه فصل نامعتبر است.' });
  }
  if (!Number.isInteger(pageNumber) || pageNumber <= 0) {
    return res.status(400).json({ error: 'شماره صفحه نامعتبر است.' });
  }

  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      return res.status(404).json({ error: 'فصل یافت نشد.' });
    }

    const totalPages = await prisma.page.count({ where: { chapter_id: chapterId } });
    if (totalPages > 0 && pageNumber > totalPages) {
      return res.status(400).json({ error: 'شماره صفحه خارج از محدوده این فصل است.' });
    }

    const bookmark = await prisma.bookmark.upsert({
      where: {
        user_id_chapter_id_page_number: {
          user_id: userId,
          chapter_id: chapterId,
          page_number: pageNumber,
        },
      },
      create: { user_id: userId, chapter_id: chapterId, page_number: pageNumber },
      update: {}, // already exists → no-op, just return it
      include: BOOKMARK_INCLUDE,
    });

    res.status(201).json(shapeBookmark(bookmark));
  } catch (error) {
    console.error('[BOOKMARKS] create error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// DELETE /api/user/bookmarks/chapters/:chapterId/pages/:pageNumber
// Removes a bookmark by its (chapter, page) coordinates — used by the reader's
// toggle, which doesn't track bookmark ids. Idempotent.
router.delete('/chapters/:chapterId/pages/:pageNumber', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const chapterId = Number(req.params.chapterId);
  const pageNumber = Number(req.params.pageNumber);

  if (!Number.isInteger(chapterId) || chapterId <= 0 || !Number.isInteger(pageNumber) || pageNumber <= 0) {
    return res.status(400).json({ error: 'درخواست نامعتبر است.' });
  }

  try {
    await prisma.bookmark.deleteMany({
      where: { user_id: userId, chapter_id: chapterId, page_number: pageNumber },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[BOOKMARKS] delete by page error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// DELETE /api/user/bookmarks/:id
// Removes one of the user's bookmarks by id — used by the "Saved" list. 404 if
// the bookmark doesn't exist or belongs to another user.
router.delete('/:id', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'شناسه نشان نامعتبر است.' });
  }

  try {
    const result = await prisma.bookmark.deleteMany({ where: { id, user_id: userId } });
    if (result.count === 0) {
      return res.status(404).json({ error: 'نشان یافت نشد.' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[BOOKMARKS] delete error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

export default router;
