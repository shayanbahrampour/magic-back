import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import { requireUser, UserAuthRequest } from '../middleware/userAuth';
import { recordActivity, getStats, XP } from '../services/gamification';
import { DAY_MS, tehranDayKey, tehranDayStart } from '../utils/datetime';
import { getChapterAccess, visibleBookWhere } from '../services/entitlements';

const router = Router();

// All progress endpoints require a logged-in app user.
router.use(requireUser);

// Percentage of a chapter read. A chapter explicitly marked complete is always
// 100%; otherwise it's the furthest page reached over the chapter's total pages.
function toPercent(lastPage: number, totalPages: number, completed: boolean): number {
  if (completed) return 100;
  if (totalPages <= 0) return 0;
  return Math.min(100, Math.round((Math.min(lastPage, totalPages) / totalPages) * 100));
}

type ProgressRow = {
  last_page: number;
  completed: boolean;
  completed_at: Date | null;
  updated_at: Date;
} | null;

function shapeChapterProgress(
  chapterId: number,
  totalPages: number,
  progress: ProgressRow
) {
  const lastPage = progress?.last_page ?? 0;
  const completed = progress?.completed ?? false;
  return {
    chapterId,
    totalPages,
    lastPage,
    percent: toPercent(lastPage, totalPages, completed),
    completed,
    completedAt: progress?.completed_at ?? null,
    updatedAt: progress?.updated_at ?? null,
  };
}

// PUT /api/user/progress/chapters/:chapterId
// Body: { lastPage: number }
// Records how far the user has read in a chapter. `last_page` only ever moves
// forward (furthest page reached). The chapter is completed only by reaching its
// final page — there is no way to mark it complete otherwise — and stays
// completed from then on. A `completed` field in the body is ignored.
router.put('/chapters/:chapterId', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const chapterId = Number(req.params.chapterId);
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return res.status(400).json({ error: 'شناسه فصل نامعتبر است.' });
  }

  const rawLastPage = req.body?.lastPage;
  const lastPage = Number(rawLastPage);
  if (rawLastPage === undefined || !Number.isFinite(lastPage) || lastPage < 0) {
    return res.status(400).json({ error: 'lastPage باید یک عدد نامنفی باشد.' });
  }

  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    const access = chapter ? await getChapterAccess(userId, chapterId) : null;
    if (!chapter || !access) {
      return res.status(404).json({ error: 'فصل یافت نشد.' });
    }
    // Progress on a locked chapter would let anyone "finish" paid books they
    // never opened, farm the completion XP, and spend it on real books.
    if (!access.canRead) {
      return res.status(403).json({ error: 'برای مطالعه این فصل باید کتاب را خریداری کنید یا اشتراک تهیه کنید.', locked: true });
    }

    const totalPages = await prisma.page.count({ where: { chapter_id: chapterId } });
    const existing = await prisma.readingProgress.findUnique({
      where: { user_id_chapter_id: { user_id: userId, chapter_id: chapterId } },
    });

    // Furthest page reached, clamped to the chapter's real page count.
    const cappedIncoming = totalPages > 0 ? Math.min(Math.floor(lastPage), totalPages) : Math.floor(lastPage);
    const furthestPage = Math.max(existing?.last_page ?? 0, cappedIncoming);

    const reachedEnd = totalPages > 0 && furthestPage >= totalPages;
    // Never un-completed either: flipping it off and on again would re-award XP.
    const completed = Boolean(existing?.completed) || reachedEnd;
    // Preserve the original completion timestamp once set.
    const completedAt = completed ? existing?.completed_at ?? new Date() : null;

    const saved = await prisma.readingProgress.upsert({
      where: { user_id_chapter_id: { user_id: userId, chapter_id: chapterId } },
      create: {
        user_id: userId,
        chapter_id: chapterId,
        last_page: furthestPage,
        completed,
        completed_at: completedAt,
      },
      update: {
        last_page: furthestPage,
        completed,
        completed_at: completedAt,
      },
    });

    // Reading keeps the daily streak alive; finishing a chapter for the first
    // time additionally grants XP. `justCompleted` guards against re-awarding on
    // repeat calls once the chapter is already marked complete.
    const justCompleted = completed && !existing?.completed;
    const chapterXp = justCompleted ? XP.CHAPTER_COMPLETE : 0;

    // Completing a chapter may finish the whole book — every chapter done, in
    // whatever order — which earns a one-off bonus on top.
    let bookXp = 0;
    if (justCompleted) {
      const [chapterCount, completedCount] = await Promise.all([
        prisma.chapter.count({ where: { book_id: chapter.book_id } }),
        prisma.readingProgress.count({
          where: { user_id: userId, completed: true, chapter: { book_id: chapter.book_id } },
        }),
      ]);
      if (chapterCount > 0 && completedCount >= chapterCount) {
        try {
          await prisma.bookCompletion.create({ data: { user_id: userId, book_id: chapter.book_id } });
          bookXp = XP.BOOK_COMPLETE;
        } catch (err) {
          // Already finished this book before (or a concurrent request just
          // recorded it) — the bonus was paid then.
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
            throw err;
          }
        }
      }
    }

    const stats = await recordActivity(userId, chapterXp + bookXp);

    res.json({
      ...shapeChapterProgress(chapterId, totalPages, saved),
      xpAwarded: chapterXp + bookXp,
      // Set when this request finished the book for the first time.
      bookCompleted: bookXp > 0,
      bookXpAwarded: bookXp,
      stats,
    });
  } catch (error) {
    console.error('[PROGRESS] update chapter error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// GET /api/user/progress/chapters/:chapterId
// The current user's progress for a single chapter.
router.get('/chapters/:chapterId', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const chapterId = Number(req.params.chapterId);
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return res.status(400).json({ error: 'شناسه فصل نامعتبر است.' });
  }

  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      return res.status(404).json({ error: 'فصل یافت نشد.' });
    }

    const totalPages = await prisma.page.count({ where: { chapter_id: chapterId } });
    const progress = await prisma.readingProgress.findUnique({
      where: { user_id_chapter_id: { user_id: userId, chapter_id: chapterId } },
    });

    res.json(shapeChapterProgress(chapterId, totalPages, progress));
  } catch (error) {
    console.error('[PROGRESS] get chapter error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// GET /api/user/progress/books/:bookId
// Per-chapter progress for one book plus a book-level completion summary.
router.get('/books/:bookId', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const bookId = Number(req.params.bookId);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return res.status(400).json({ error: 'شناسه کتاب نامعتبر است.' });
  }

  try {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      return res.status(404).json({ error: 'کتاب یافت نشد.' });
    }

    const chapters = await prisma.chapter.findMany({
      where: { book_id: bookId },
      orderBy: { chapter_order: 'asc' },
      include: { _count: { select: { pages: true } } },
    });

    const progressRows = await prisma.readingProgress.findMany({
      where: { user_id: userId, chapter: { book_id: bookId } },
    });
    const progressByChapter = new Map(progressRows.map((p) => [p.chapter_id, p]));

    const chapterProgress = chapters.map((chapter) => {
      const totalPages = chapter._count.pages;
      const progress = progressByChapter.get(chapter.id) ?? null;
      return {
        ...shapeChapterProgress(chapter.id, totalPages, progress),
        title: chapter.title,
        chapterOrder: chapter.chapter_order,
      };
    });

    const totalChapters = chapters.length;
    const completedChapters = chapterProgress.filter((c) => c.completed).length;

    res.json({
      bookId,
      totalChapters,
      completedChapters,
      percentComplete:
        totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0,
      bookCompleted: totalChapters > 0 && completedChapters === totalChapters,
      chapters: chapterProgress,
    });
  } catch (error) {
    console.error('[PROGRESS] get book error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// GET /api/user/progress/stats
// The user's gamification stats: total XP, current streak, longest streak, plus
// a 12-week activity calendar (one entry per day the user was active).
router.get('/stats', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  try {
    const stats = await getStats(userId);

    // Recent activity days for rendering a heatmap / calendar.
    // Pinned to a Tehran day boundary so the oldest visible column doesn't drift
    // in and out depending on the hour the request is made.
    const since = tehranDayStart(new Date(Date.now() - 83 * DAY_MS)); // 12 weeks
    const activity = await prisma.dailyActivity.findMany({
      where: { user_id: userId, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, xp_earned: true },
    });

    res.json({
      ...stats,
      activity: activity.map((a) => ({
        date: tehranDayKey(a.date),
        xpEarned: a.xp_earned,
      })),
    });
  } catch (error) {
    console.error('[PROGRESS] stats error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// GET /api/user/progress/continue
// "Continue where you left off": the most recently updated, not-yet-completed
// chapter, with enough context (book, chapter, resume page) for the app to jump
// straight back in. Returns { hasProgress: false } if there is nothing to resume.
router.get('/continue', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  try {
    const latest = await prisma.readingProgress.findFirst({
      where: { user_id: userId, completed: false, chapter: { book: visibleBookWhere() } },
      orderBy: { updated_at: 'desc' },
      include: { chapter: { include: { book: true } } },
    });

    if (!latest) {
      return res.json({ hasProgress: false });
    }

    const totalPages = await prisma.page.count({ where: { chapter_id: latest.chapter_id } });

    res.json({
      hasProgress: true,
      book: {
        id: latest.chapter.book.id,
        title: latest.chapter.book.title,
        author: latest.chapter.book.author,
        coverImageUrl: latest.chapter.book.cover_image_url ?? null,
      },
      chapter: {
        id: latest.chapter.id,
        title: latest.chapter.title,
        chapterOrder: latest.chapter.chapter_order,
      },
      // Where to resume: the next unread page (furthest reached + 1), clamped to
      // the chapter's last page.
      resumePage: totalPages > 0 ? Math.min(latest.last_page + 1, totalPages) : latest.last_page,
      ...shapeChapterProgress(latest.chapter_id, totalPages, latest),
    });
  } catch (error) {
    console.error('[PROGRESS] continue error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// GET /api/user/progress
// Overview across every book the user has started: for each book, how many of
// its chapters they've completed.
router.get('/', async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;

  try {
    const progressRows = await prisma.readingProgress.findMany({
      where: { user_id: userId, chapter: { book: visibleBookWhere() } },
      include: { chapter: { include: { book: true } } },
    });

    // Aggregate the user's touched chapters by book.
    const byBook = new Map<
      number,
      { book: { id: number; title: string; author: string }; completed: number; started: number }
    >();
    for (const row of progressRows) {
      const book = row.chapter.book;
      const entry =
        byBook.get(book.id) ??
        { book: { id: book.id, title: book.title, author: book.author }, completed: 0, started: 0 };
      entry.started += 1;
      if (row.completed) entry.completed += 1;
      byBook.set(book.id, entry);
    }

    const bookIds = [...byBook.keys()];
    // Total chapter counts for the books the user has started.
    const chapterCounts = await prisma.chapter.groupBy({
      by: ['book_id'],
      where: { book_id: { in: bookIds } },
      _count: { _all: true },
    });
    const totalByBook = new Map(chapterCounts.map((c) => [c.book_id, c._count._all]));

    const books = [...byBook.values()].map((entry) => {
      const totalChapters = totalByBook.get(entry.book.id) ?? 0;
      return {
        bookId: entry.book.id,
        title: entry.book.title,
        author: entry.book.author,
        totalChapters,
        completedChapters: entry.completed,
        startedChapters: entry.started,
        percentComplete:
          totalChapters > 0 ? Math.round((entry.completed / totalChapters) * 100) : 0,
        bookCompleted: totalChapters > 0 && entry.completed === totalChapters,
      };
    });

    res.json({ books });
  } catch (error) {
    console.error('[PROGRESS] overview error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

export default router;
