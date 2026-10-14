import { Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { DAY_MS, tehranDayKey, tehranDayStart } from '../utils/datetime';

const router = Router();
router.use(requireAuth);

const MAX_PAGE_SIZE = 100;
const PAYMENT_STATUSES = ['pending', 'paid', 'verified', 'failed'] as const;

type Kind = 'all' | 'book' | 'subscription';
type Source = 'all' | 'gateway' | 'points';
type GroupBy = 'day' | 'week' | 'month';

// One row of the unified ledger: a gateway checkout (money) or a book unlocked
// with XP (points). Points purchases have no gateway step, so they are always
// complete and count as `verified`.
type Sale = {
  id: string;
  source: 'gateway' | 'points';
  kind: 'book' | 'subscription';
  status: string;
  amountToman: number;
  pointsSpent: number;
  createdAt: Date;
  user: { id: number; phone: string; name: string };
  book: { id: number; title: string; categories: { id: number; name: string }[] } | null;
  plan: { id: number; title: string } | null;
  trackId: string | null;
  refNumber: string | null;
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * `YYYY-MM-DD` (Tehran calendar day) → the UTC instant that day starts. `to` is
 * inclusive, so callers pass the day after it as the exclusive upper bound.
 */
function parseDay(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const utcMidnight = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(utcMidnight.getTime())) return null;
  return tehranDayStart(new Date(utcMidnight.getTime() + DAY_MS / 2));
}

// Bucket key for the time series. Weeks start on Saturday, as in Iran.
function periodKey(date: Date, groupBy: GroupBy): string {
  const day = tehranDayKey(date);
  if (groupBy === 'month') return day.slice(0, 7);
  if (groupBy === 'week') {
    const start = tehranDayStart(date);
    const weekday = new Date(start.getTime() + DAY_MS / 2).getUTCDay(); // 0 = Sunday
    const sinceSaturday = (weekday + 1) % 7;
    return tehranDayKey(new Date(start.getTime() - sinceSaturday * DAY_MS));
  }
  return day;
}

// ADMIN: GET /api/sales — sales report with filters and breakdowns.
//
// Query (all optional):
//   from, to      Tehran calendar days, YYYY-MM-DD, inclusive
//   kind          all | book | subscription
//   source        all | gateway | points
//   status        all | verified | paid | pending | failed   (default verified)
//   bookId, planId, categoryId, userId
//   q             buyer phone or name
//   groupBy       day | week | month (time series bucket)
//   page, pageSize  for the transaction list
//
// Revenue figures only ever count verified money; the status filter decides
// which rows the ledger and the per-status breakdown include.
router.get('/', async (req, res) => {
  const kind = pick<Kind>(req.query.kind, ['all', 'book', 'subscription'], 'all');
  const source = pick<Source>(req.query.source, ['all', 'gateway', 'points'], 'all');
  const status = pick(req.query.status, ['all', ...PAYMENT_STATUSES] as const, 'verified');
  const groupBy = pick<GroupBy>(req.query.groupBy, ['day', 'week', 'month'], 'day');
  const bookId = positiveInt(req.query.bookId);
  const planId = positiveInt(req.query.planId);
  const categoryId = positiveInt(req.query.categoryId);
  const userId = positiveInt(req.query.userId);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || 25));

  const from = req.query.from ? parseDay(req.query.from) : null;
  const toStart = req.query.to ? parseDay(req.query.to) : null;
  if ((req.query.from && !from) || (req.query.to && !toStart)) {
    return res.status(400).json({ error: 'تاریخ باید به شکل YYYY-MM-DD باشد.' });
  }
  const toExclusive = toStart ? new Date(toStart.getTime() + DAY_MS) : null;
  if (from && toExclusive && from >= toExclusive) {
    return res.status(400).json({ error: 'تاریخ شروع باید قبل از تاریخ پایان باشد.' });
  }

  // A book/category filter can only ever match book sales, and a plan filter
  // only subscription sales — so they narrow `kind` implicitly.
  const wantBooks = kind !== 'subscription' && planId === null;
  const wantSubs = kind !== 'book' && bookId === null && categoryId === null;
  const wantGateway = source !== 'points';
  // Points purchases are always complete; they belong to a `verified` view only.
  const wantPoints = source !== 'gateway' && wantBooks && (status === 'all' || status === 'verified');

  const createdAt = {
    ...(from ? { gte: from } : {}),
    ...(toExclusive ? { lt: toExclusive } : {}),
  };
  const userWhere = q
    ? {
        OR: [
          { phone: { contains: q } },
          { first_name: { contains: q, mode: 'insensitive' as const } },
          { last_name: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : undefined;
  const bookWhere = {
    ...(bookId ? { id: bookId } : {}),
    ...(categoryId ? { categories: { some: { id: categoryId } } } : {}),
  };

  const userSelect = { select: { id: true, phone: true, first_name: true, last_name: true } };
  const bookSelect = {
    select: { id: true, title: true, categories: { select: { id: true, name: true } } },
  };

  try {
    const kinds = [wantBooks && 'book', wantSubs && 'subscription'].filter(Boolean) as string[];

    const [payments, pointsPurchases] = await Promise.all([
      wantGateway && kinds.length > 0
        ? prisma.payment.findMany({
            where: {
              kind: { in: kinds },
              created_at: createdAt,
              ...(userId ? { user_id: userId } : {}),
              ...(userWhere ? { user: userWhere } : {}),
              ...(planId ? { plan_id: planId } : {}),
              ...(bookId || categoryId ? { book: bookWhere } : {}),
            },
            include: { user: userSelect, book: bookSelect, plan: { select: { id: true, title: true } } },
            orderBy: { created_at: 'desc' },
          })
        : Promise.resolve([]),
      wantPoints
        ? prisma.bookPurchase.findMany({
            where: {
              points_spent: { gt: 0 },
              created_at: createdAt,
              ...(userId ? { user_id: userId } : {}),
              ...(userWhere ? { user: userWhere } : {}),
              ...(bookId || categoryId ? { book: bookWhere } : {}),
            },
            include: { user: userSelect, book: bookSelect },
            orderBy: { created_at: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const name = (u: { first_name: string; last_name: string }) => `${u.first_name} ${u.last_name}`.trim();

    const all: Sale[] = [
      ...payments.map((p) => ({
        id: `payment-${p.id}`,
        source: 'gateway' as const,
        kind: p.kind === 'subscription' ? ('subscription' as const) : ('book' as const),
        status: p.status,
        amountToman: p.amount_toman,
        pointsSpent: 0,
        createdAt: p.created_at,
        user: { id: p.user.id, phone: p.user.phone, name: name(p.user) },
        book: p.book,
        plan: p.plan,
        trackId: p.track_id,
        refNumber: p.ref_number,
      })),
      ...pointsPurchases.map((b) => ({
        id: `points-${b.id}`,
        source: 'points' as const,
        kind: 'book' as const,
        status: 'verified',
        amountToman: 0,
        pointsSpent: b.points_spent,
        createdAt: b.created_at,
        user: { id: b.user.id, phone: b.user.phone, name: name(b.user) },
        book: b.book,
        plan: null,
        trackId: null,
        refNumber: null,
      })),
    ];

    // The per-status breakdown is computed before the status filter so the
    // admin always sees how many checkouts failed or are stuck.
    const byStatus = PAYMENT_STATUSES.map((s) => {
      const rows = all.filter((r) => r.source === 'gateway' && r.status === s);
      return { status: s, count: rows.length, amountToman: rows.reduce((t, r) => t + r.amountToman, 0) };
    });
    const gatewayAttempts = all.filter((r) => r.source === 'gateway').length;

    const rows = status === 'all' ? all : all.filter((r) => r.status === status);
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const completed = rows.filter((r) => r.status === 'verified');
    const money = completed.filter((r) => r.source === 'gateway');
    const revenue = money.reduce((t, r) => t + r.amountToman, 0);
    const sum = (list: Sale[], f: (r: Sale) => number) => list.reduce((t, r) => t + f(r), 0);
    const bookMoney = money.filter((r) => r.kind === 'book');
    const subMoney = money.filter((r) => r.kind === 'subscription');
    const points = completed.filter((r) => r.source === 'points');

    // Time series over completed sales.
    const series = new Map<string, { period: string; revenueToman: number; bookRevenueToman: number; subscriptionRevenueToman: number; orders: number; pointsPurchases: number; pointsSpent: number }>();
    for (const r of completed) {
      const key = periodKey(r.createdAt, groupBy);
      const entry = series.get(key) ?? {
        period: key,
        revenueToman: 0,
        bookRevenueToman: 0,
        subscriptionRevenueToman: 0,
        orders: 0,
        pointsPurchases: 0,
        pointsSpent: 0,
      };
      if (r.source === 'gateway') {
        entry.revenueToman += r.amountToman;
        entry.orders += 1;
        if (r.kind === 'book') entry.bookRevenueToman += r.amountToman;
        else entry.subscriptionRevenueToman += r.amountToman;
      } else {
        entry.pointsPurchases += 1;
        entry.pointsSpent += r.pointsSpent;
      }
      series.set(key, entry);
    }

    const byBook = new Map<number, { bookId: number; title: string; revenueToman: number; orders: number; pointsPurchases: number; pointsSpent: number }>();
    const byCategory = new Map<number, { categoryId: number; name: string; revenueToman: number; orders: number; pointsPurchases: number }>();
    const byPlan = new Map<number | null, { planId: number | null; title: string; revenueToman: number; orders: number }>();
    for (const r of completed) {
      if (r.kind === 'book' && r.book) {
        const b = byBook.get(r.book.id) ?? { bookId: r.book.id, title: r.book.title, revenueToman: 0, orders: 0, pointsPurchases: 0, pointsSpent: 0 };
        if (r.source === 'gateway') {
          b.revenueToman += r.amountToman;
          b.orders += 1;
        } else {
          b.pointsPurchases += 1;
          b.pointsSpent += r.pointsSpent;
        }
        byBook.set(r.book.id, b);

        // A book in several categories counts toward each of them.
        for (const c of r.book.categories) {
          const cat = byCategory.get(c.id) ?? { categoryId: c.id, name: c.name, revenueToman: 0, orders: 0, pointsPurchases: 0 };
          if (r.source === 'gateway') {
            cat.revenueToman += r.amountToman;
            cat.orders += 1;
          } else {
            cat.pointsPurchases += 1;
          }
          byCategory.set(c.id, cat);
        }
      }
      if (r.kind === 'subscription') {
        const key = r.plan?.id ?? null;
        const p = byPlan.get(key) ?? { planId: key, title: r.plan?.title ?? 'پلن حذف‌شده', revenueToman: 0, orders: 0 };
        p.revenueToman += r.amountToman;
        p.orders += 1;
        byPlan.set(key, p);
      }
    }

    const byRevenue = <T extends { revenueToman: number }>(list: T[]) =>
      list.sort((a, b) => b.revenueToman - a.revenueToman);

    res.json({
      filters: {
        from: from ? tehranDayKey(from) : null,
        to: toStart ? tehranDayKey(toStart) : null,
        kind,
        source,
        status,
        groupBy,
        bookId,
        planId,
        categoryId,
        userId,
        q,
      },
      summary: {
        revenueToman: revenue,
        orders: money.length,
        averageOrderToman: money.length > 0 ? Math.round(revenue / money.length) : 0,
        uniqueBuyers: new Set(completed.map((r) => r.user.id)).size,
        bookRevenueToman: sum(bookMoney, (r) => r.amountToman),
        bookOrders: bookMoney.length,
        subscriptionRevenueToman: sum(subMoney, (r) => r.amountToman),
        subscriptionOrders: subMoney.length,
        pointsPurchases: points.length,
        pointsSpent: sum(points, (r) => r.pointsSpent),
        // Share of gateway checkouts in range that ended verified.
        conversionRate:
          gatewayAttempts > 0
            ? (byStatus.find((s) => s.status === 'verified')!.count / gatewayAttempts)
            : null,
      },
      byStatus,
      timeseries: [...series.values()].sort((a, b) => a.period.localeCompare(b.period)),
      byBook: byRevenue([...byBook.values()]),
      byCategory: byRevenue([...byCategory.values()]),
      byPlan: byRevenue([...byPlan.values()]),
      transactions: {
        total: rows.length,
        page,
        pageSize,
        rows: rows.slice((page - 1) * pageSize, page * pageSize).map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          book: r.book ? { id: r.book.id, title: r.book.title } : null,
        })),
      },
    });
  } catch (error) {
    console.error('[SALES] report error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

export default router;
