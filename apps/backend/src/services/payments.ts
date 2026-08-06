import prisma from '../db';
import {
  ZibalError,
  inquiryPayment,
  isPaidStatus,
  resultMessage,
  statusMessage,
  verifyPayment,
} from './zibal';

// The lifecycle of a Payment row. See the model's comment in schema.prisma.
export type PaymentStatus = 'pending' | 'paid' | 'verified' | 'failed' | 'canceled';

export const PAYMENT_KIND_SUBSCRIPTION = 'subscription';
export const PAYMENT_KIND_BOOK = 'book';

/** Zibal is priced in rials; everything user-facing in this app is in tomans. */
export function tomanToRial(toman: number): number {
  return toman * 10;
}

/**
 * `months` calendar months after `from`, clamped so that e.g. the 31st of a
 * short month lands on the last day rather than spilling into the next one.
 */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  // The month rolled over (31 Jan + 1 month), so step back to that month's end.
  if (result.getUTCDate() < day) result.setUTCDate(0);
  return result;
}

/** A short, unique merchant-side reference sent to Zibal as `orderId`. */
export function newOrderId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MGC-${prefix}-${Date.now().toString(36).toUpperCase()}-${random}`;
}

type PaymentRow = {
  id: number;
  user_id: number;
  kind: string;
  plan_id: number | null;
  book_id: number | null;
  amount_toman: number;
  track_id: string | null;
  status: string;
  granted: boolean;
};

/**
 * Hands out what the payment bought. Idempotent: the `granted` flag is flipped
 * inside the same transaction as the grant itself, and only the caller that
 * observed `granted: false` does any work — so a callback racing a status poll
 * can never produce two subscription windows.
 */
async function grantEntitlement(payment: PaymentRow): Promise<void> {
  if (payment.granted) return;

  await prisma.$transaction(async (tx) => {
    // Claim the payment. `count === 0` means somebody else already granted it.
    const claim = await tx.payment.updateMany({
      where: { id: payment.id, granted: false },
      data: { granted: true },
    });
    if (claim.count === 0) return;

    if (payment.kind === PAYMENT_KIND_SUBSCRIPTION && payment.plan_id) {
      const plan = await tx.subscriptionPlan.findUnique({ where: { id: payment.plan_id } });
      if (!plan) throw new Error(`plan ${payment.plan_id} vanished while granting`);

      // Renewing early extends the existing window instead of overwriting it,
      // so a user never loses days by paying ahead of the expiry.
      const now = new Date();
      const current = await tx.userSubscription.findFirst({
        where: { user_id: payment.user_id, expires_at: { gt: now } },
        orderBy: { expires_at: 'desc' },
        select: { expires_at: true },
      });
      const startsAt = current && current.expires_at > now ? current.expires_at : now;

      await tx.userSubscription.create({
        data: {
          user_id: payment.user_id,
          plan_id: plan.id,
          starts_at: startsAt,
          expires_at: addMonths(startsAt, plan.duration_months),
        },
      });
      return;
    }

    if (payment.kind === PAYMENT_KIND_BOOK && payment.book_id) {
      // A second purchase of the same book is a no-op rather than an error —
      // the user may have bought it on another device mid-checkout.
      const owned = await tx.bookPurchase.findUnique({
        where: { user_id_book_id: { user_id: payment.user_id, book_id: payment.book_id } },
        select: { id: true },
      });
      if (owned) return;

      await tx.bookPurchase.create({
        data: {
          user_id: payment.user_id,
          book_id: payment.book_id,
          price_toman: payment.amount_toman,
          points_spent: 0,
        },
      });
      return;
    }

    throw new Error(`payment ${payment.id} has no grantable target`);
  });
}

export type SettleOutcome = {
  status: PaymentStatus;
  /** Persian, safe to show the user. */
  message: string;
  granted: boolean;
};

/**
 * Verifies a payment with Zibal and, when it really was paid, grants what it
 * bought. Safe to call repeatedly for the same payment — this is exactly what
 * happens when the gateway callback and the app's status poll both land.
 *
 * Never throws for an ordinary rejection; a gateway/network failure leaves the
 * payment `pending` so a later poll can pick it up again.
 */
export async function settlePayment(paymentId: number): Promise<SettleOutcome> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    return { status: 'failed', message: 'پرداخت یافت نشد.', granted: false };
  }

  // Terminal states need no further gateway calls.
  if (payment.status === 'verified') {
    if (!payment.granted) await grantEntitlement(payment);
    return { status: 'verified', message: 'پرداخت شما با موفقیت انجام شد.', granted: true };
  }
  if (payment.status === 'failed' || payment.status === 'canceled') {
    return {
      status: payment.status as PaymentStatus,
      message: payment.failure_reason || statusMessage(payment.gateway_status),
      granted: payment.granted,
    };
  }
  if (!payment.track_id) {
    return { status: 'pending', message: 'این پرداخت هنوز به درگاه ارسال نشده است.', granted: false };
  }

  let verify;
  try {
    verify = await verifyPayment(payment.track_id);
  } catch (error) {
    console.error('[PAYMENTS] verify call failed:', error);
    return {
      status: 'pending',
      message:
        error instanceof ZibalError
          ? error.message
          : 'ارتباط با درگاه پرداخت برقرار نشد. لطفاً چند لحظه بعد دوباره بررسی کنید.',
      granted: false,
    };
  }

  // 100 = verified just now. 201 = a previous verify already settled it; the
  // money is ours either way, so both count as success. Zibal omits the details
  // on 201, so fill them in with an inquiry.
  if (verify.result === 100 || verify.result === 201) {
    let details = verify;
    if (verify.result === 201) {
      try {
        details = await inquiryPayment(payment.track_id);
      } catch {
        // Non-fatal: we lose the card number, not the payment.
      }
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'verified',
        gateway_status: typeof details.status === 'number' ? details.status : payment.gateway_status,
        ref_number: details.refNumber != null ? String(details.refNumber) : payment.ref_number,
        card_number: details.cardNumber ?? payment.card_number,
        paid_at: details.paidAt ? new Date(details.paidAt) : payment.paid_at ?? new Date(),
        verified_at: new Date(),
        failure_reason: null,
      },
    });

    await grantEntitlement(updated);
    return { status: 'verified', message: 'پرداخت شما با موفقیت انجام شد.', granted: true };
  }

  // 202 = the session exists but was not paid (cancelled, declined, expired).
  // Ask why, so the user gets "موجودی کافی نیست" rather than a generic failure.
  if (verify.result === 202) {
    let gatewayStatus: number | null = null;
    try {
      const info = await inquiryPayment(payment.track_id);
      gatewayStatus = typeof info.status === 'number' ? info.status : null;
    } catch {
      // Fall through to the generic message.
    }

    // Status -1 means the user simply has not finished paying yet; leave the
    // payment open so a later poll can still settle it.
    if (gatewayStatus === -1) {
      return { status: 'pending', message: 'پرداخت هنوز کامل نشده است.', granted: false };
    }

    const canceled = gatewayStatus === 3;
    const message = gatewayStatus != null ? statusMessage(gatewayStatus) : resultMessage(202);
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: canceled ? 'canceled' : 'failed',
        gateway_status: gatewayStatus,
        failure_reason: message,
      },
    });
    return { status: canceled ? 'canceled' : 'failed', message, granted: false };
  }

  // Anything else (bad merchant, bad trackId) is a configuration problem.
  const message = resultMessage(verify.result);
  console.error('[PAYMENTS] verify rejected:', payment.track_id, verify.result, verify.message);
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'failed', failure_reason: message },
  });
  return { status: 'failed', message, granted: false };
}

/**
 * Records what the gateway told us in its callback before verification runs.
 * Keeps the row informative even when the verify step later fails.
 */
export async function recordCallback(
  paymentId: number,
  gatewayStatus: number | null,
  success: boolean
): Promise<void> {
  const paid = success && isPaidStatus(gatewayStatus);
  // Scoped to still-open payments so a duplicate callback can never walk a
  // settled payment back from `verified` to `paid`.
  await prisma.payment.updateMany({
    where: { id: paymentId, status: { in: ['pending', 'paid'] } },
    data: {
      gateway_status: gatewayStatus,
      ...(paid ? { status: 'paid', paid_at: new Date() } : {}),
    },
  });
}
