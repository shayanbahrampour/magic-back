import { Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { optionalUser } from '../middleware/optionalUser';
import { UserAuthRequest } from '../middleware/userAuth';
import { normalizeFileUrl } from '../utils/s3';
import { canReadChapter, getBookAccess, getBookAccessMap, isBookFree } from '../services/entitlements';

const router = Router();

// Prices are whole tomans. Returns null when the input isn't a usable amount so
// callers can reject it with a message rather than silently storing a 0.
function normalizePrice(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

// CLIENT: GET /books (with optional categoryId filter)
// Public, but personalised: `locked` reflects the caller's own entitlements when
// they send a token.
router.get('/', optionalUser, async (req: UserAuthRequest, res) => {
  const { categoryId } = req.query;
  const userId = req.appUser?.id ?? null;
  try {
    const filter = categoryId
      ? {
          categories: {
            some: {
              id: Number(categoryId),
            },
          },
        }
      : {};

    const books = await prisma.book.findMany({
      where: filter,
      include: {
        categories: true,
      },
      orderBy: { id: 'desc' },
    });

    const accessMap = await getBookAccessMap(userId, books);
    const normalized = books.map(b => {
      const access = accessMap.get(b.id)!;
      return {
        ...b,
        cover_image_url: normalizeFileUrl(b.cover_image_url, req),
        is_free: isBookFree(b),
        has_access: access.hasAccess,
        access_reason: access.reason,
        locked: !access.hasAccess,
      };
    });
    res.json(normalized);
  } catch (error) {
    console.error('Failed to fetch books:', error);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

// CLIENT & ADMIN: GET /books/:id
router.get('/:id', optionalUser, async (req: UserAuthRequest, res) => {
  const { id } = req.params;
  const userId = req.appUser?.id ?? null;
  try {
    const book = await prisma.book.findUnique({
      where: { id: Number(id) },
      include: {
        categories: true,
      },
    });
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    const access = await getBookAccess(userId, book);
    const normalized = {
      ...book,
      cover_image_url: normalizeFileUrl(book.cover_image_url, req),
      is_free: isBookFree(book),
      has_access: access.hasAccess,
      access_reason: access.reason,
      locked: !access.hasAccess,
    };
    res.json(normalized);
  } catch (error) {
    console.error('Failed to fetch book:', error);
    res.status(500).json({ error: 'Failed to fetch book' });
  }
});

// CLIENT: GET /books/:id/chapters
// The table of contents is always readable — it's the chapter *pages* that are
// gated. Each row carries its own `locked` flag so the app can show which
// chapters are free previews.
router.get('/:id/chapters', optionalUser, async (req: UserAuthRequest, res) => {
  const { id } = req.params;
  const userId = req.appUser?.id ?? null;
  try {
    const book = await prisma.book.findUnique({
      where: { id: Number(id) },
      select: { id: true, is_free: true, price_toman: true },
    });
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const chapters = await prisma.chapter.findMany({
      where: { book_id: Number(id) },
      orderBy: { chapter_order: 'asc' },
    });

    const access = await getBookAccess(userId, book);
    res.json(
      chapters.map((c) => ({
        ...c,
        locked: !canReadChapter(c, access),
      }))
    );
  } catch (error) {
    console.error('Failed to fetch book chapters:', error);
    res.status(500).json({ error: 'Failed to fetch book chapters' });
  }
});

// ADMIN: POST /books (Create book)
router.post('/', requireAuth, async (req, res) => {
  const { title, author, short_description, full_description, cover_image_url, category_ids, is_free, price_toman } = req.body;
  if (!title || !author || !Array.isArray(category_ids) || category_ids.length === 0) {
    return res.status(400).json({ error: 'Title, author, and at least one category (category_ids array) are required' });
  }
  const price = normalizePrice(price_toman);
  if (price === null) {
    return res.status(400).json({ error: 'قیمت باید یک عدد صحیح و نامنفی (به تومان) باشد.' });
  }
  const free = is_free === undefined ? price <= 0 : Boolean(is_free);
  if (!free && price <= 0) {
    return res.status(400).json({ error: 'برای کتاب غیررایگان باید قیمتی بزرگ‌تر از صفر تعیین شود.' });
  }
  try {
    const cleanCoverUrl = normalizeFileUrl(cover_image_url, req);
    const newBook = await prisma.book.create({
      data: {
        title,
        author,
        short_description: short_description || '',
        full_description: full_description || '',
        cover_image_url: cleanCoverUrl || null,
        is_free: free,
        price_toman: price,
        categories: {
          connect: category_ids.map((cid: number) => ({ id: Number(cid) })),
        },
      },
      include: {
        categories: true,
      },
    });
    res.status(201).json({
      ...newBook,
      cover_image_url: normalizeFileUrl(newBook.cover_image_url, req),
    });
  } catch (error) {
    console.error('Failed to create book:', error);
    res.status(500).json({ error: 'Failed to create book' });
  }
});

// ADMIN: PUT /books/:id (Update book)
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, author, short_description, full_description, cover_image_url, category_ids, is_free, price_toman } = req.body;
  try {
    const data: any = {
      title,
      author,
      short_description,
      full_description,
    };

    if (cover_image_url !== undefined) {
      data.cover_image_url = normalizeFileUrl(cover_image_url, req) || null;
    }

    if (price_toman !== undefined) {
      const price = normalizePrice(price_toman);
      if (price === null) {
        return res.status(400).json({ error: 'قیمت باید یک عدد صحیح و نامنفی (به تومان) باشد.' });
      }
      data.price_toman = price;
    }
    if (is_free !== undefined) {
      data.is_free = Boolean(is_free);
    }

    // Validate the *resulting* state, since either field may be absent from a
    // partial update.
    const existing = await prisma.book.findUnique({
      where: { id: Number(id) },
      select: { is_free: true, price_toman: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Book not found' });
    }
    const nextFree = data.is_free ?? existing.is_free;
    const nextPrice = data.price_toman ?? existing.price_toman;
    if (!nextFree && nextPrice <= 0) {
      return res.status(400).json({ error: 'برای کتاب غیررایگان باید قیمتی بزرگ‌تر از صفر تعیین شود.' });
    }

    if (Array.isArray(category_ids)) {
      data.categories = {
        set: category_ids.map((cid: number) => ({ id: Number(cid) })),
      };
    }

    const updatedBook = await prisma.book.update({
      where: { id: Number(id) },
      data,
      include: {
        categories: true,
      },
    });
    res.json({
      ...updatedBook,
      cover_image_url: normalizeFileUrl(updatedBook.cover_image_url, req),
    });
  } catch (error) {
    console.error('Failed to update book:', error);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// ADMIN: DELETE /books/:id (Delete book)
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.book.delete({
      where: { id: Number(id) },
    });
    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Failed to delete book:', error);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

export default router;
