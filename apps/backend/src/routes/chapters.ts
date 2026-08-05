import { Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { optionalUser } from '../middleware/optionalUser';
import { UserAuthRequest } from '../middleware/userAuth';
import { normalizeFileUrl } from '../utils/s3';
import { getChapterAccess } from '../services/entitlements';

const router = Router();

// CLIENT: GET /chapters/:id/pages (Get pages sequentially)
// This is the endpoint that actually serves paid content, so it is the one that
// must enforce entitlements — the lock states elsewhere are presentation only.
router.get('/:id/pages', optionalUser, async (req: UserAuthRequest, res) => {
  const { id } = req.params;
  const userId = req.appUser?.id ?? null;
  try {
    const access = await getChapterAccess(userId, Number(id));
    if (!access) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    if (!access.canRead) {
      return res.status(403).json({
        error: 'برای مطالعه این فصل باید کتاب را خریداری کنید یا اشتراک تهیه کنید.',
        locked: true,
        bookId: access.chapter.book.id,
      });
    }

    const pages = await prisma.page.findMany({
      where: { chapter_id: Number(id) },
      orderBy: { page_number: 'asc' },
    });

    const parsedPages = pages.map((page) => {
      let urls: string[] = [];
      try {
        urls = page.image_urls ? JSON.parse(page.image_urls) : [];
      } catch (e) {
        urls = [];
      }
      return {
        ...page,
        image_urls: urls.map((u) => normalizeFileUrl(u, req) || u),
        is_full_page: Boolean(page.is_full_page),
      };
    });

    res.json(parsedPages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chapter pages' });
  }
});

// ADMIN: GET /chapters (List all chapters, with optional bookId query filter)
router.get('/', requireAuth, async (req, res) => {
  const { bookId } = req.query;
  try {
    const filter = bookId ? { book_id: Number(bookId) } : {};
    const chapters = await prisma.chapter.findMany({
      where: filter,
      orderBy: [
        { book_id: 'asc' },
        { chapter_order: 'asc' }
      ],
    });
    res.json(chapters);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chapters' });
  }
});

// ADMIN: GET /chapters/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: Number(id) },
    });
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chapter' });
  }
});

// ADMIN: POST /chapters
router.post('/', requireAuth, async (req, res) => {
  const { book_id, title, chapter_order, is_free } = req.body;
  if (!book_id || !title || chapter_order === undefined) {
    return res.status(400).json({ error: 'book_id, title, and chapter_order are required' });
  }
  try {
    const newChapter = await prisma.chapter.create({
      data: {
        book_id: Number(book_id),
        title,
        chapter_order: Number(chapter_order),
        is_free: Boolean(is_free),
      },
    });
    res.status(201).json(newChapter);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create chapter' });
  }
});

// ADMIN: PUT /chapters/:id
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { book_id, title, chapter_order, is_free } = req.body;
  try {
    const updatedChapter = await prisma.chapter.update({
      where: { id: Number(id) },
      data: {
        book_id: book_id ? Number(book_id) : undefined,
        title,
        chapter_order: chapter_order !== undefined ? Number(chapter_order) : undefined,
        is_free: is_free !== undefined ? Boolean(is_free) : undefined,
      },
    });
    res.json(updatedChapter);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update chapter' });
  }
});

// ADMIN: DELETE /chapters/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.chapter.delete({
      where: { id: Number(id) },
    });
    res.json({ message: 'Chapter deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
});

export default router;
