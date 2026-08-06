import crypto from 'crypto';
import prisma from '../db';

/** Keeps app sign-in codes and admin dashboard codes in separate namespaces. */
export type OtpPurpose = 'USER' | 'ADMIN';

const TTL_MS = 2 * 60 * 1000; // a code is good for 2 minutes
const MAX_ATTEMPTS = 5; // wrong guesses before the code is burned
const RESEND_COOLDOWN_MS = 60 * 1000; // at most one SMS per minute per phone
const MAX_PER_HOUR = 5; // and no more than 5 in an hour

// Codes are hashed with a server-side pepper, so a leaked database still can't
// be used to sign in. Reuses JWT_SECRET rather than adding another secret to
// configure — both are "compromise means re-issue everything" material.
const PEPPER = process.env.OTP_PEPPER || process.env.JWT_SECRET || 'magicbook-otp-pepper';

function hashCode(phone: string, purpose: OtpPurpose, code: string): string {
  return crypto.createHmac('sha256', PEPPER).update(`${purpose}:${phone}:${code}`).digest('hex');
}

/** A 5-digit code, never with a leading zero so it reads back cleanly. */
function generateCode(): string {
  return String(crypto.randomInt(10000, 100000));
}

export type IssueResult =
  | { ok: true; code: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Creates a fresh code for this phone, invalidating any earlier unused one, and
 * returns it for sending. Enforces the resend cooldown and the hourly cap so a
 * caller cannot be used to bombard a number with SMS at our expense.
 */
export async function issueOtp(phone: string, purpose: OtpPurpose): Promise<IssueResult> {
  const now = new Date();

  const latest = await prisma.otpCode.findFirst({
    where: { phone, purpose },
    orderBy: { created_at: 'desc' },
    select: { created_at: true },
  });

  if (latest) {
    const sinceLast = now.getTime() - latest.created_at.getTime();
    if (sinceLast < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000);
      return {
        ok: false,
        error: `برای ارسال مجدد کد، ${retryAfterSeconds} ثانیه صبر کنید.`,
        retryAfterSeconds,
      };
    }
  }

  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const recentCount = await prisma.otpCode.count({
    where: { phone, purpose, created_at: { gte: lastHour } },
  });
  if (recentCount >= MAX_PER_HOUR) {
    return {
      ok: false,
      error: 'تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً یک ساعت دیگر تلاش کنید.',
      retryAfterSeconds: 3600,
    };
  }

  // Only the newest code may be used.
  await prisma.otpCode.updateMany({
    where: { phone, purpose, consumed_at: null },
    data: { consumed_at: now },
  });

  const code = generateCode();
  await prisma.otpCode.create({
    data: {
      phone,
      purpose,
      code_hash: hashCode(phone, purpose, code),
      expires_at: new Date(now.getTime() + TTL_MS),
    },
  });

  return { ok: true, code };
}

/**
 * Marks the newest outstanding code as used without verifying it — called when
 * the SMS fails to send, so the user isn't stuck waiting out a cooldown for a
 * code that never arrived.
 */
export async function discardLatestOtp(phone: string, purpose: OtpPurpose): Promise<void> {
  const latest = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumed_at: null },
    orderBy: { created_at: 'desc' },
    select: { id: true },
  });
  if (latest) {
    await prisma.otpCode.delete({ where: { id: latest.id } });
  }
}

export type VerifyResult = { ok: true } | { ok: false; error: string };

/**
 * Checks a submitted code against the newest outstanding one, consuming it on
 * success. Wrong guesses are counted and the code is burned after MAX_ATTEMPTS,
 * so a 5-digit code can't be brute-forced.
 */
export async function verifyOtp(
  phone: string,
  purpose: OtpPurpose,
  submitted: string
): Promise<VerifyResult> {
  const now = new Date();
  const record = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumed_at: null },
    orderBy: { created_at: 'desc' },
  });

  if (!record) {
    return { ok: false, error: 'کدی برای این شماره ثبت نشده است. لطفاً دوباره درخواست کد کنید.' };
  }

  if (record.expires_at.getTime() < now.getTime()) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { consumed_at: now } });
    return { ok: false, error: 'کد تایید منقضی شده است. لطفاً دوباره درخواست کد کنید.' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { consumed_at: now } });
    return { ok: false, error: 'تعداد تلاش‌های نادرست بیش از حد مجاز است. لطفاً کد جدیدی بگیرید.' };
  }

  const expected = hashCode(phone, purpose, submitted);
  const matches =
    expected.length === record.code_hash.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(record.code_hash));

  if (!matches) {
    const updated = await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const left = Math.max(0, MAX_ATTEMPTS - updated.attempts);
    return {
      ok: false,
      error: left > 0
        ? `کد تایید وارد شده اشتباه است. ${left} تلاش دیگر باقی مانده است.`
        : 'کد تایید اشتباه است و تعداد تلاش‌ها به پایان رسید. لطفاً کد جدیدی بگیرید.',
    };
  }

  await prisma.otpCode.update({ where: { id: record.id }, data: { consumed_at: now } });
  return { ok: true };
}

/** Housekeeping: drops codes that expired over a day ago. */
export async function purgeExpiredOtps(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.otpCode.deleteMany({ where: { expires_at: { lt: cutoff } } });
}
