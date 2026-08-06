import { Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';

const router = Router();

const MAX_PAGE_SIZE = 100;

/**
 * Adds whole months to a date, clamping the day when the target month is
 * shorter. Without the clamp, 31 Jan + 1 month would roll over into 3 March.
 */
function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const targetDay = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < targetDay) {
    // Rolled into the next month: step back to the last day of the intended one.
    result.setDate(0);
  }
  return result;
}

function shapeSubscription(sub: {
  id: number;
  starts_at: Date;
  expires_at: Date;
  created_at: Date;
  plan: { id: number; title: string; duration_months: number; price_toman: number } | null;
}) {
  return {
    id: sub.id,
    startsAt: sub.starts_at.toISOString(),
    expiresAt: sub.expires_at.toISOString(),
    createdAt: sub.created_at.toISOString(),
    plan: sub.plan
      ? {
          id: sub.plan.id,
          title: sub.plan.title,
          durationMonths: sub.plan.duration_months,
          priceToman: sub.plan.price_toman,
        }
      : null,
  };
}

// ADMIN: GET /api/users — paginated directory with entitlement summary.
// `q` matches phone or name so the admin can find a caller by the number they
// rang in with.
router.get('/', requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || 25));
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const where = q
    ? {
        OR: [
          { phone: { contains: q } },
          { first_name: { contains: q, mode: 'insensitive' as const } },
          { last_name: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  try {
    const now = new Date();
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          stats: { select: { total_xp: true, spent_xp: true, current_streak: true } },
          _count: { select: { book_purchases: true, subscriptions: true } },
          // Only the window that is live right now, so the list can badge
          // "subscribed" without a second query per row.
          subscriptions: {
            where: { starts_at: { lte: now }, expires_at: { gt: now } },
            orderBy: { expires_at: 'desc' },
            take: 1,
            include: { plan: true },
          },
        },
      }),
    ]);

    res.json({
      total,
      page,
      pageSize,
      users: users.map((user) => {
        const active = user.subscriptions[0] ?? null;
        return {
          id: user.id,
          phone: user.phone,
          firstName: user.first_name,
          lastName: user.last_name,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at.toISOString(),
          totalXp: user.stats?.total_xp ?? 0,
          spentXp: user.stats?.spent_xp ?? 0,
          currentStreak: user.stats?.current_streak ?? 0,
          purchaseCount: user._count.book_purchases,
          subscriptionCount: user._count.subscriptions,
          isSubscribed: active !== null,
          activeSubscription: active ? shapeSubscription(active) : null,
        };
      }),
    });
  } catch (error) {
    console.error('[USERS] list error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// ADMIN: GET /api/users/:id/history — every book the user unlocked and every
// subscription window they have ever held, newest first.
router.get('/:id/history', requireAuth, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'شناسه کاربر نامعتبر است.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'کاربر مورد نظر یافت نشد.' });

    const [purchases, subscriptions] = await Promise.all([
      prisma.bookPurchase.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        include: { book: { select: { id: true, title: true, author: true, cover_image_url: true } } },
      }),
      prisma.userSubscription.findMany({
        where: { user_id: userId },
        orderBy: { expires_at: 'desc' },
        include: { plan: true },
      }),
    ]);

    const now = new Date();
    res.json({
      purchases: purchases.map((p) => ({
        id: p.id,
        bookId: p.book_id,
        bookTitle: p.book.title,
        bookAuthor: p.book.author,
        coverImageUrl: p.book.cover_image_url,
        priceToman: p.price_toman,
        pointsSpent: p.points_spent,
        createdAt: p.created_at.toISOString(),
      })),
      subscriptions: subscriptions.map((s) => ({
        ...shapeSubscription(s),
        isActive: s.starts_at <= now && s.expires_at > now,
      })),
    });
  } catch (error) {
    console.error('[USERS] history error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// ADMIN: POST /api/users/:id/subscriptions — grant a subscription window.
//
// Body takes either `planId` (duration comes from the plan) or an explicit
// `durationMonths`. The new window starts when the user's current coverage runs
// out rather than right now, so granting a month to someone with time left adds
// a month instead of cutting them short.
router.post('/:id/subscriptions', requireAuth, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'شناسه کاربر نامعتبر است.' });
  }

  const { planId, durationMonths } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'کاربر مورد نظر یافت نشد.' });

    let months: number;
    let resolvedPlanId: number | null = null;

    if (planId !== undefined && planId !== null) {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: Number(planId) } });
      if (!plan) return res.status(404).json({ error: 'پلن مورد نظر یافت نشد.' });
      resolvedPlanId = plan.id;
      // An explicit duration still wins, so an admin can grant a plan for a
      // non-standard period without inventing a throwaway plan.
      months = durationMonths !== undefined ? Number(durationMonths) : plan.duration_months;
    } else {
      months = Number(durationMonths);
    }

    if (!Number.isInteger(months) || months < 1 || months > 120) {
      return res.status(400).json({ error: 'مدت اشتراک باید عددی صحیح بین ۱ تا ۱۲۰ ماه باشد.' });
    }

    const now = new Date();
    // Stack onto the furthest-out window the user holds, not just the one that
    // is live right now: a second grant must queue behind the first, otherwise
    // granting twice in a row would overlap and silently lose a period.
    const furthest = await prisma.userSubscription.findFirst({
      where: { user_id: userId },
      orderBy: { expires_at: 'desc' },
      select: { expires_at: true },
    });
    const startsAt = furthest && furthest.expires_at > now ? furthest.expires_at : now;

    const created = await prisma.userSubscription.create({
      data: {
        user_id: userId,
        plan_id: resolvedPlanId,
        starts_at: startsAt,
        expires_at: addMonths(startsAt, months),
      },
      include: { plan: true },
    });

    res.status(201).json({
      subscription: { ...shapeSubscription(created), isActive: created.expires_at > now },
      // True when the grant was queued behind existing coverage rather than
      // starting immediately — the UI says so explicitly.
      extended: startsAt > now,
    });
  } catch (error) {
    console.error('[USERS] grant subscription error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

export default router;
