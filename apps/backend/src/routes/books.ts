import { Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { optionalUser } from '../middleware/optionalUser';
import { UserAuthRequest } from '../middleware/userAuth';
import { normalizeFileUrl } from '../utils/s3';
import { canBuyWithPoints, canReadChapter, getBookAccess, getBookAccessMap, isBookFree } from '../services/entitlements';
import { requireUser } from '../middleware/userAuth';
import { getStats, spendXp } from '../services/gamification';

const router = Router();

// Prices are whole tomans. Returns null when the input isn't a usable amount so
// callers can reject it with a message rather than silently storing a 0.
function normalizePrice(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

// Points prices follow the same rules as toman prices: whole, non-negative, and
// 0 meaning "points cannot buy this book".
const normalizePointsPrice = normalizePrice;

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
        can_buy_with_points: canBuyWithPoints(b),
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
      can_buy_with_points: canBuyWithPoints(book),
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

// CLIENT: POST /books/:id/purchase-with-points
// Unlocks a book permanently by charging the caller's earned XP. Only books an
// admin gave a points price to are eligible; money is never involved here.
router.post('/:id/purchase-with-points', requireUser, async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const bookId = Number(req.params.id);

  if (!Number.isInteger(bookId)) {
    return res.status(400).json({ error: 'شناسه کتاب معتبر نیست.' });
  }

  try {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, title: true, is_free: true, price_toman: true, points_price: true },
    });
    if (!book) {
      return res.status(404).json({ error: 'کتاب یافت نشد.' });
    }

    if (isBookFree(book)) {
      return res.status(400).json({ error: 'این کتاب رایگان است و نیازی به خرید ندارد.' });
    }

    if (!canBuyWithPoints(book)) {
      return res.status(400).json({ error: 'این کتاب با امتیاز قابل خریداری نیست.' });
    }

    const owned = await prisma.bookPurchase.findUnique({
      where: { user_id_book_id: { user_id: userId, book_id: bookId } },
      select: { id: true },
    });
    if (owned) {
      return res.status(409).json({ error: 'این کتاب را قبلاً خریده‌اید.' });
    }

    const stats = await getStats(userId);
    if (stats.availableXp < book.points_price) {
      return res.status(400).json({
        error: `امتیاز شما کافی نیست. برای این کتاب ${book.points_price} امتیاز لازم است و شما ${stats.availableXp} امتیاز دارید.`,
        availableXp: stats.availableXp,
        pointsPrice: book.points_price,
      });
    }

    // Charge first: a failed charge must not hand out the book, and the charge
    // is conditioned on the balance we just read, so a double-tap can't spend
    // the same points twice.
    const charged = await spendXp(userId, book.points_price);
    if (!charged) {
      return res.status(409).json({ error: 'امتیاز شما کافی نیست. لطفاً دوباره تلاش کنید.' });
    }

    try {
      await prisma.bookPurchase.create({
        data: {
          user_id: userId,
          book_id: bookId,
          price_toman: 0,
          points_spent: book.points_price,
        },
      });
    } catch (createErr) {
      // Refund rather than leave the user charged for a book they didn't get.
      await prisma.userStats.update({
        where: { user_id: userId },
        data: { spent_xp: { decrement: book.points_price } },
      });
      throw createErr;
    }

    const fresh = await getStats(userId);
    return res.status(201).json({
      message: 'کتاب با امتیاز شما خریداری شد. مطالعه‌ی خوبی داشته باشید!',
      pointsSpent: book.points_price,
      availableXp: fresh.availableXp,
    });
  } catch (error) {
    console.error('[BOOKS] purchase-with-points error:', error);
    return res.status(500).json({ error: 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' });
  }
});

// ADMIN: POST /books (Create book)
router.post('/', requireAuth, async (req, res) => {
  const { title, author, short_description, full_description, cover_image_url, category_ids, is_free, price_toman, points_price } = req.body;
  if (!title || !author || !Array.isArray(category_ids) || category_ids.length === 0) {
    return res.status(400).json({ error: 'Title, author, and at least one category (category_ids array) are required' });
  }
  const price = normalizePrice(price_toman);
  if (price === null) {
    return res.status(400).json({ error: 'قیمت باید یک عدد صحیح و نامنفی (به تومان) باشد.' });
  }
  const pointsPrice = normalizePointsPrice(points_price);
  if (pointsPrice === null) {
    return res.status(400).json({ error: 'امتیاز لازم باید یک عدد صحیح و نامنفی باشد.' });
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
        // A free book can never be points-purchasable, so don't store a stale cost.
        points_price: free ? 0 : pointsPrice,
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
  const { title, author, short_description, full_description, cover_image_url, category_ids, is_free, price_toman, points_price } = req.body;
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
    if (points_price !== undefined) {
      const pointsPrice = normalizePointsPrice(points_price);
      if (pointsPrice === null) {
        return res.status(400).json({ error: 'امتیاز لازم باید یک عدد صحیح و نامنفی باشد.' });
      }
      data.points_price = pointsPrice;
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
    // Turning a book free clears any points cost, so the two can't disagree.
    if (nextFree) {
      data.points_price = 0;
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
