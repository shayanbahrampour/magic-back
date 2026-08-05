import prisma from '../db';

// Why a user can (or cannot) read a book. `subscription` and `purchase` unlock
// the whole book; `free` means it was never paid content to begin with.
export type AccessReason = 'free' | 'subscription' | 'purchase' | 'locked';

export type BookAccess = {
  hasAccess: boolean;
  reason: AccessReason;
};

// A book priced at 0 is treated as free no matter how `is_free` is set, so a
// half-filled admin form can never produce a book that is locked with no price.
export function isBookFree(book: { is_free: boolean; price_toman: number }): boolean {
  return book.is_free || book.price_toman <= 0;
}

/** True when the user has any subscription window covering this instant. */
export async function hasActiveSubscription(
  userId: number | null | undefined,
  now: Date = new Date()
): Promise<boolean> {
  if (!userId) return false;
  const active = await prisma.userSubscription.findFirst({
    where: { user_id: userId, starts_at: { lte: now }, expires_at: { gt: now } },
    select: { id: true },
  });
  return active !== null;
}

/** The user's current subscription window, or null when they have none. */
export async function getActiveSubscription(userId: number | null | undefined, now: Date = new Date()) {
  if (!userId) return null;
  return prisma.userSubscription.findFirst({
    where: { user_id: userId, starts_at: { lte: now }, expires_at: { gt: now } },
    // Whichever window runs longest is the one that actually governs access.
    orderBy: { expires_at: 'desc' },
    include: { plan: true },
  });
}

/**
 * Resolves whether `userId` may read `book`. Anonymous callers (userId null)
 * only ever get access to free books.
 */
export async function getBookAccess(
  userId: number | null | undefined,
  book: { id: number; is_free: boolean; price_toman: number }
): Promise<BookAccess> {
  if (isBookFree(book)) return { hasAccess: true, reason: 'free' };
  if (!userId) return { hasAccess: false, reason: 'locked' };

  if (await hasActiveSubscription(userId)) {
    return { hasAccess: true, reason: 'subscription' };
  }

  const purchase = await prisma.bookPurchase.findUnique({
    where: { user_id_book_id: { user_id: userId, book_id: book.id } },
    select: { id: true },
  });
  if (purchase) return { hasAccess: true, reason: 'purchase' };

  return { hasAccess: false, reason: 'locked' };
}

/**
 * Batch form of `getBookAccess` for list endpoints — resolves the subscription
 * and the user's purchased book ids once instead of per book.
 */
export async function getBookAccessMap(
  userId: number | null | undefined,
  books: { id: number; is_free: boolean; price_toman: number }[]
): Promise<Map<number, BookAccess>> {
  const map = new Map<number, BookAccess>();

  const paid = books.filter((b) => !isBookFree(b));
  for (const book of books) {
    if (isBookFree(book)) map.set(book.id, { hasAccess: true, reason: 'free' });
  }
  if (paid.length === 0) return map;

  if (!userId) {
    for (const book of paid) map.set(book.id, { hasAccess: false, reason: 'locked' });
    return map;
  }

  if (await hasActiveSubscription(userId)) {
    for (const book of paid) map.set(book.id, { hasAccess: true, reason: 'subscription' });
    return map;
  }

  const purchases = await prisma.bookPurchase.findMany({
    where: { user_id: userId, book_id: { in: paid.map((b) => b.id) } },
    select: { book_id: true },
  });
  const purchased = new Set(purchases.map((p) => p.book_id));
  for (const book of paid) {
    map.set(
      book.id,
      purchased.has(book.id)
        ? { hasAccess: true, reason: 'purchase' }
        : { hasAccess: false, reason: 'locked' }
    );
  }
  return map;
}

/**
 * Whether a specific chapter is readable. Chapters flagged `is_free` are open
 * previews inside an otherwise paid book; everything else follows the book.
 */
export function canReadChapter(chapter: { is_free: boolean }, bookAccess: BookAccess): boolean {
  return bookAccess.hasAccess || chapter.is_free;
}

/**
 * Full access check for one chapter id, loading the book it belongs to.
 * Returns null when the chapter does not exist.
 */
export async function getChapterAccess(userId: number | null | undefined, chapterId: number) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      is_free: true,
      book: { select: { id: true, is_free: true, price_toman: true } },
    },
  });
  if (!chapter) return null;

  const bookAccess = await getBookAccess(userId, chapter.book);
  return {
    chapter,
    bookAccess,
    canRead: canReadChapter(chapter, bookAccess),
  };
}
