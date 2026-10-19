import { Router } from 'express';
import prisma from '../db';
import { requireUser, UserAuthRequest } from '../middleware/userAuth';
import { requireAuth } from '../middleware/auth';
import { isBookFree, isBookVisible } from '../services/entitlements';
import { Prisma } from '@prisma/client';
import { myketConfigured } from '../services/myket';
import {
  PAYMENT_KIND_BOOK,
  PAYMENT_KIND_SUBSCRIPTION,
  PAYMENT_PROVIDER_MYKET,
  newOrderId,
  recordCallback,
  settleMyketPayment,
  settlePayment,
  tomanToRial,
} from '../services/payments';
import {
  ZibalError,
  callbackUrl,
  egressIp,
  paymentPageUrl,
  requestPayment,
  zibalConfigured,
  zibalMerchant,
} from '../services/zibal';

const router = Router();

// Zibal refuses anything under 1,000 rials.
const MIN_AMOUNT_RIAL = 1000;

// Where the payer's browser is sent once we are done with the callback. The app
// registers `magic://` (see `scheme` in app.json) and intercepts this URL, which
// is how the checkout WebView closes itself.
function appReturnUrl(params: Record<string, string>): string {
  const scheme = process.env.APP_RETURN_SCHEME?.trim() || 'magic';
  const query = new URLSearchParams(params).toString();
  return `${scheme}://payment?${query}`;
}

function shapePayment(payment: {
  id: number;
  kind: string;
  plan_id: number | null;
  book_id: number | null;
  amount_toman: number;
  order_id: string;
  track_id: string | null;
  status: string;
  ref_number: string | null;
  card_number: string | null;
  failure_reason: string | null;
  paid_at: Date | null;
  created_at: Date;
}) {
  return {
    id: payment.id,
    kind: payment.kind,
    planId: payment.plan_id,
    bookId: payment.book_id,
    amountToman: payment.amount_toman,
    orderId: payment.order_id,
    trackId: payment.track_id,
    status: payment.status,
    refNumber: payment.ref_number,
    cardNumber: payment.card_number,
    failureReason: payment.failure_reason,
    paidAt: payment.paid_at?.toISOString() ?? null,
    createdAt: payment.created_at.toISOString(),
  };
}

/**
 * Creates the Payment row, opens a Zibal session for it, and returns the URL
 * the app must open. Shared by both checkout kinds — they only differ in what
 * is being bought.
 */
async function openCheckout(
  userId: number,
  target:
    | { kind: 'subscription'; planId: number; amountToman: number; description: string }
    | { kind: 'book'; bookId: number; amountToman: number; description: string },
  mobile?: string
) {
  const amountRial = tomanToRial(target.amountToman);
  if (amountRial < MIN_AMOUNT_RIAL) {
    throw new ZibalError('مبلغ این خرید کمتر از حداقل مجاز درگاه پرداخت است.');
  }

  const orderId = newOrderId(target.kind === 'subscription' ? 'SUB' : 'BOOK');
  const payment = await prisma.payment.create({
    data: {
      user_id: userId,
      kind: target.kind === 'subscription' ? PAYMENT_KIND_SUBSCRIPTION : PAYMENT_KIND_BOOK,
      plan_id: target.kind === 'subscription' ? target.planId : null,
      book_id: target.kind === 'book' ? target.bookId : null,
      amount_toman: target.amountToman,
      amount_rial: amountRial,
      order_id: orderId,
      status: 'pending',
    },
  });

  try {
    const session = await requestPayment({
      amountRial,
      orderId,
      description: target.description,
      mobile,
    });
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { track_id: session.trackId },
    });
    return {
      payment: updated,
      paymentUrl: paymentPageUrl(session.trackId),
      trackId: session.trackId,
    };
  } catch (error) {
    // A session we could not open is dead on arrival — close the row out so it
    // does not sit in `pending` forever.
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'failed',
        failure_reason: error instanceof ZibalError ? error.message : 'خطا در ایجاد جلسه پرداخت.',
      },
    });
    throw error;
  }
}

function checkoutErrorResponse(res: any, error: unknown, context: string) {
  console.error(`[PAYMENTS] ${context}:`, error);
  if (error instanceof ZibalError) {
    return res.status(502).json({ error: error.message });
  }
  return res.status(500).json({ error: 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' });
}

// CLIENT: POST /api/payments/subscription — buy a subscription plan.
// Returns the gateway URL; the app opens it and waits for the callback.
router.post('/subscription', requireUser, async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const planId = Number(req.body?.planId);

  if (!Number.isInteger(planId)) {
    return res.status(400).json({ error: 'شناسه پلن معتبر نیست.' });
  }

  try {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: 'پلن اشتراک یافت نشد.' });
    if (!plan.is_active) {
      return res.status(400).json({ error: 'این پلن اشتراک دیگر در دسترس نیست.' });
    }
    if (plan.price_toman <= 0) {
      return res.status(400).json({ error: 'این پلن قیمتی برای پرداخت ندارد.' });
    }

    const { payment, paymentUrl, trackId } = await openCheckout(
      userId,
      {
        kind: 'subscription',
        planId: plan.id,
        amountToman: plan.price_toman,
        description: `اشتراک مجیک — ${plan.title}`,
      },
      req.appUser!.phone
    );

    return res.status(201).json({
      payment: shapePayment(payment),
      paymentUrl,
      trackId,
      sandbox: !zibalConfigured(),
    });
  } catch (error) {
    return checkoutErrorResponse(res, error, 'subscription checkout');
  }
});

// CLIENT: POST /api/payments/book/:id — buy permanent access to one book.
router.post('/book/:id', requireUser, async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const bookId = Number(req.params.id);

  if (!Number.isInteger(bookId)) {
    return res.status(400).json({ error: 'شناسه کتاب معتبر نیست.' });
  }

  try {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true, title: true, is_free: true, price_toman: true, is_disabled: true, disabled_until: true },
    });
    if (!book || !isBookVisible(book)) return res.status(404).json({ error: 'کتاب یافت نشد.' });
    if (isBookFree(book)) {
      return res.status(400).json({ error: 'این کتاب رایگان است و نیازی به خرید ندارد.' });
    }

    const owned = await prisma.bookPurchase.findUnique({
      where: { user_id_book_id: { user_id: userId, book_id: bookId } },
      select: { id: true },
    });
    if (owned) return res.status(409).json({ error: 'این کتاب را قبلاً خریده‌اید.' });

    const { payment, paymentUrl, trackId } = await openCheckout(
      userId,
      {
        kind: 'book',
        bookId: book.id,
        amountToman: book.price_toman,
        description: `خرید کتاب — ${book.title}`,
      },
      req.appUser!.phone
    );

    return res.status(201).json({
      payment: shapePayment(payment),
      paymentUrl,
      trackId,
      sandbox: !zibalConfigured(),
    });
  } catch (error) {
    return checkoutErrorResponse(res, error, 'book checkout');
  }
});

// Myket product ids, as registered in the Myket developer panel: `plan_<id>` for
// a subscription plan and `book_<id>` for a single book. The app derives them
// the same way (lib/checkout.ts).
function parseMyketSku(
  sku: string
): { kind: 'subscription'; planId: number } | { kind: 'book'; bookId: number } | null {
  const match = /^(plan|book)_(\d+)$/.exec(sku);
  if (!match) return null;
  const id = Number(match[2]);
  return match[1] === 'plan' ? { kind: 'subscription', planId: id } : { kind: 'book', bookId: id };
}

// CLIENT: POST /api/payments/myket/verify — a purchase made through Myket's
// in-app billing (the Android store build). Body:
// `{ sku, purchaseToken, orderId, developerPayload }`.
//
// The app calls this right after the Myket sheet closes, and again on later
// launches for any purchase it could not get confirmed. One purchase token maps
// to one Payment row, so every repeat lands on the same row and grants at most
// once. Answers with the same shape as GET /:trackId.
router.post('/myket/verify', requireUser, async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const sku = typeof req.body?.sku === 'string' ? req.body.sku.trim() : '';
  const purchaseToken = typeof req.body?.purchaseToken === 'string' ? req.body.purchaseToken.trim() : '';
  const myketOrderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';

  const target = parseMyketSku(sku);
  if (!target || !purchaseToken) {
    return res.status(400).json({ error: 'اطلاعات خرید مایکت معتبر نیست.' });
  }

  try {
    let payment = await prisma.payment.findUnique({ where: { purchase_token: purchaseToken } });

    if (!payment) {
      // Priced from our own catalogue: Myket charged whatever its product is set
      // to, and this is what our reports should show for it.
      let amountToman: number;
      if (target.kind === 'subscription') {
        const plan = await prisma.subscriptionPlan.findUnique({ where: { id: target.planId } });
        if (!plan) return res.status(404).json({ error: 'پلن اشتراک یافت نشد.' });
        amountToman = plan.price_toman;
      } else {
        const book = await prisma.book.findUnique({ where: { id: target.bookId } });
        if (!book) return res.status(404).json({ error: 'کتاب یافت نشد.' });
        amountToman = book.price_toman;
      }

      try {
        payment = await prisma.payment.create({
          data: {
            user_id: userId,
            provider: PAYMENT_PROVIDER_MYKET,
            kind: target.kind === 'subscription' ? PAYMENT_KIND_SUBSCRIPTION : PAYMENT_KIND_BOOK,
            plan_id: target.kind === 'subscription' ? target.planId : null,
            book_id: target.kind === 'book' ? target.bookId : null,
            amount_toman: amountToman,
            amount_rial: tomanToRial(amountToman),
            order_id: newOrderId('MYK'),
            purchase_token: purchaseToken,
            ref_number: myketOrderId || null,
            status: 'pending',
          },
        });
      } catch (error) {
        // Two concurrent reports of the same purchase: the other one made the row.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          payment = await prisma.payment.findUnique({ where: { purchase_token: purchaseToken } });
        }
        if (!payment) throw error;
      }
    }

    // A token is bound to whoever reported it first, and to the product it was
    // first reported for.
    const sameTarget =
      target.kind === 'subscription'
        ? payment.kind === PAYMENT_KIND_SUBSCRIPTION && payment.plan_id === target.planId
        : payment.kind === PAYMENT_KIND_BOOK && payment.book_id === target.bookId;
    if (payment.user_id !== userId || payment.provider !== PAYMENT_PROVIDER_MYKET || !sameTarget) {
      return res.status(409).json({ error: 'این خرید قبلاً برای حساب یا محصول دیگری ثبت شده است.' });
    }

    const outcome = await settleMyketPayment(payment.id, sku, purchaseToken);
    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
    return res.json({ payment: shapePayment(fresh!), message: outcome.message });
  } catch (error) {
    console.error('[PAYMENTS] Myket verify error:', error);
    return res.status(500).json({ error: 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' });
  }
});

// GATEWAY: GET /api/payments/callback — Zibal sends the payer's browser here.
//
// Unauthenticated by nature (it is a browser redirect, not an app request), so
// it trusts nothing in the query string beyond the `trackId` used to look up
// our own row: the real state always comes from Zibal's verify endpoint.
router.get('/callback', async (req, res) => {
  const trackId = typeof req.query.trackId === 'string' ? req.query.trackId : null;
  const success = req.query.success === '1' || req.query.success === 'true';
  const gatewayStatus = req.query.status != null ? Number(req.query.status) : null;

  if (!trackId) {
    return res.redirect(302, appReturnUrl({ status: 'failed', message: 'پرداخت نامعتبر است.' }));
  }

  try {
    const payment = await prisma.payment.findUnique({ where: { track_id: trackId } });
    if (!payment) {
      return res.redirect(302, appReturnUrl({ status: 'failed', message: 'پرداخت یافت نشد.' }));
    }

    await recordCallback(
      payment.id,
      Number.isFinite(gatewayStatus) ? (gatewayStatus as number) : null,
      success
    );

    // Settle either way: a `success=0` callback still needs the verify/inquiry
    // round-trip to learn *why* it failed, which is what the user is shown.
    const outcome = await settlePayment(payment.id);
    return res.redirect(
      302,
      appReturnUrl({
        status: outcome.status,
        trackId,
        kind: payment.kind,
        message: outcome.message,
      })
    );
  } catch (error) {
    console.error('[PAYMENTS] callback error:', error);
    return res.redirect(
      302,
      appReturnUrl({
        status: 'failed',
        trackId,
        message: 'خطایی در بررسی پرداخت رخ داد. لطفاً با پشتیبانی تماس بگیرید.',
      })
    );
  }
});

// CLIENT: GET /api/payments/:trackId — the app's source of truth after checkout.
//
// The app calls this when the browser closes, however it closed. Still-open
// payments are re-settled here, so a callback that never arrived (the user
// killed the browser, the network dropped) is recovered rather than lost.
router.get('/:trackId', requireUser, async (req: UserAuthRequest, res) => {
  const userId = req.appUser!.id;
  const { trackId } = req.params;

  try {
    const payment = await prisma.payment.findUnique({ where: { track_id: trackId } });
    // Not-found and not-yours are the same answer: a user must never be able to
    // probe other people's payments.
    if (!payment || payment.user_id !== userId) {
      return res.status(404).json({ error: 'پرداخت یافت نشد.' });
    }

    if (payment.status === 'pending' || payment.status === 'paid') {
      const outcome = await settlePayment(payment.id);
      const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
      return res.json({ payment: shapePayment(fresh!), message: outcome.message });
    }

    return res.json({
      payment: shapePayment(payment),
      message:
        payment.status === 'verified'
          ? 'پرداخت شما با موفقیت انجام شد.'
          : payment.failure_reason || 'پرداخت انجام نشد.',
    });
  } catch (error) {
    console.error('[PAYMENTS] status error:', error);
    return res.status(500).json({ error: 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' });
  }
});

// CLIENT: GET /api/payments — the caller's own checkout history.
router.get('/', requireUser, async (req: UserAuthRequest, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { user_id: req.appUser!.id },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    res.json({ payments: payments.map(shapePayment), sandbox: !zibalConfigured() });
  } catch (error) {
    console.error('[PAYMENTS] history error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// OPS: GET /api/payments/config/check — are the gateways wired up on this deploy?
// Deliberately does not expose the merchant id itself.
//
// `egressIp` is the address Zibal's IP allowlist actually sees; it is what must
// be registered in the panel to clear a result-115 rejection. It is usually not
// the IP this API's domain resolves to — see the note on `egressIp()`.
router.get('/config/check', requireAuth, async (_req, res) => {
  const egress = await egressIp();
  res.json({
    configured: zibalConfigured(),
    merchantSuffix: zibalMerchant().slice(-4),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
    callbackUrl: process.env.PUBLIC_BASE_URL ? callbackUrl() : null,
    egressIp: egress.ip,
    egressIpSource: egress.source,
    myketConfigured: myketConfigured(),
  });
});

export default router;
