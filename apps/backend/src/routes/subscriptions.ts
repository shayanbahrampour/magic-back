import { Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { requireUser, UserAuthRequest } from '../middleware/userAuth';
import { getActiveSubscription } from '../services/entitlements';

const router = Router();

type PlanShape = {
  id: number;
  title: string;
  durationMonths: number;
  priceToman: number;
  isActive: boolean;
};

function shapePlan(plan: {
  id: number;
  title: string;
  duration_months: number;
  price_toman: number;
  is_active: boolean;
}): PlanShape {
  return {
    id: plan.id,
    title: plan.title,
    durationMonths: plan.duration_months,
    priceToman: plan.price_toman,
    isActive: plan.is_active,
  };
}

// Validates the admin-supplied period/price. Returns an error string, or null
// when the input is usable.
function validatePlanInput(durationMonths: unknown, priceToman: unknown): string | null {
  const months = Number(durationMonths);
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    return 'مدت اشتراک باید عددی صحیح بین ۱ تا ۱۲۰ ماه باشد.';
  }
  const price = Number(priceToman);
  if (!Number.isInteger(price) || price < 0) {
    return 'قیمت باید یک عدد صحیح و نامنفی (به تومان) باشد.';
  }
  return null;
}

// CLIENT: GET /api/subscriptions/plans — the plans on offer.
// Public so the app can show pricing before the user logs in. Only active plans
// are exposed; retired ones stay in the DB for existing subscriptions.
router.get('/plans', async (_req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { is_active: true },
      orderBy: { duration_months: 'asc' },
    });
    res.json({ plans: plans.map(shapePlan) });
  } catch (error) {
    console.error('[SUBSCRIPTIONS] list plans error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// ADMIN: GET /api/subscriptions/plans/all — including retired plans.
router.get('/plans/all', requireAuth, async (_req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: [{ is_active: 'desc' }, { duration_months: 'asc' }],
    });
    res.json({ plans: plans.map(shapePlan) });
  } catch (error) {
    console.error('[SUBSCRIPTIONS] list all plans error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// ADMIN: POST /api/subscriptions/plans
router.post('/plans', requireAuth, async (req, res) => {
  const { title, durationMonths, priceToman, isActive } = req.body;
  const invalid = validatePlanInput(durationMonths, priceToman);
  if (invalid) return res.status(400).json({ error: invalid });

  const months = Number(durationMonths);
  const name = typeof title === 'string' && title.trim() ? title.trim() : `اشتراک ${months} ماهه`;

  try {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        title: name,
        duration_months: months,
        price_toman: Number(priceToman),
        is_active: isActive === undefined ? true : Boolean(isActive),
      },
    });
    res.status(201).json(shapePlan(plan));
  } catch (error) {
    console.error('[SUBSCRIPTIONS] create plan error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// ADMIN: PUT /api/subscriptions/plans/:id
router.put('/plans/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { title, durationMonths, priceToman, isActive } = req.body;

  // Only validate the fields actually being changed.
  if (durationMonths !== undefined || priceToman !== undefined) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: 'پلن مورد نظر یافت نشد.' });
    const invalid = validatePlanInput(
      durationMonths ?? existing.duration_months,
      priceToman ?? existing.price_toman
    );
    if (invalid) return res.status(400).json({ error: invalid });
  }

  try {
    const plan = await prisma.subscriptionPlan.update({
      where: { id: Number(id) },
      data: {
        title: typeof title === 'string' && title.trim() ? title.trim() : undefined,
        duration_months: durationMonths !== undefined ? Number(durationMonths) : undefined,
        price_toman: priceToman !== undefined ? Number(priceToman) : undefined,
        is_active: isActive !== undefined ? Boolean(isActive) : undefined,
      },
    });
    res.json(shapePlan(plan));
  } catch (error) {
    console.error('[SUBSCRIPTIONS] update plan error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// ADMIN: DELETE /api/subscriptions/plans/:id
// Retires the plan when users are already subscribed under it, so their grants
// keep resolving; hard-deletes only when nothing references it.
router.delete('/plans/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const inUse = await prisma.userSubscription.count({ where: { plan_id: Number(id) } });
    if (inUse > 0) {
      const plan = await prisma.subscriptionPlan.update({
        where: { id: Number(id) },
        data: { is_active: false },
      });
      return res.json({
        message: 'این پلن دارای اشتراک فعال است و بایگانی شد.',
        archived: true,
        plan: shapePlan(plan),
      });
    }
    await prisma.subscriptionPlan.delete({ where: { id: Number(id) } });
    res.json({ message: 'پلن با موفقیت حذف شد.', archived: false });
  } catch (error) {
    console.error('[SUBSCRIPTIONS] delete plan error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// CLIENT: GET /api/subscriptions/me — the caller's own entitlement summary.
// Drives the client's lock states without needing a request per book.
router.get('/me', requireUser, async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  try {
    const [subscription, purchases] = await Promise.all([
      getActiveSubscription(userId),
      prisma.bookPurchase.findMany({
        where: { user_id: userId },
        select: { book_id: true },
      }),
    ]);

    res.json({
      isSubscribed: subscription !== null,
      subscription: subscription
        ? {
            expiresAt: subscription.expires_at.toISOString(),
            startsAt: subscription.starts_at.toISOString(),
            plan: subscription.plan ? shapePlan(subscription.plan) : null,
          }
        : null,
      purchasedBookIds: purchases.map((p) => p.book_id),
    });
  } catch (error) {
    console.error('[SUBSCRIPTIONS] me error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

export default router;
