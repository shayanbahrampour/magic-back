import { Router } from 'express';
import prisma from '../db';
import { signToken, verifyToken } from '../utils/jwt';
import { requireUser, UserAuthRequest } from '../middleware/userAuth';

const router = Router();

const IRAN_PHONE_REGEX = /^09\d{9}$/;

// For now the OTP is hardcoded. Replace with a real SMS provider + stored codes later.
const HARDCODED_OTP = '11111';

function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const clean = input.trim();
  return IRAN_PHONE_REGEX.test(clean) ? clean : null;
}

function toPublicUser(user: { id: number; phone: string; first_name: string; last_name: string }) {
  return {
    id: user.id,
    phone: user.phone,
    firstName: user.first_name,
    lastName: user.last_name,
  };
}

// POST /api/user/send-otp  { phone }
// Validates the phone and "sends" the OTP. Any valid Iranian mobile number is accepted.
router.post('/send-otp', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    return res.status(400).json({
      error: 'شماره موبایل معتبر نیست. شماره باید با 09 آغاز شده و دقیقاً ۱۱ رقم باشد (مثال: 09123456789).',
    });
  }

  console.log(`[USER-AUTH] OTP requested for ${phone}. Hardcoded OTP: ${HARDCODED_OTP}`);

  res.json({
    message: 'کد تایید ۵ رقمی به شماره شما ارسال شد.',
    phone,
  });
});

// POST /api/user/verify-otp  { phone, otp }
// If the phone belongs to a registered user -> logs in (returns access token).
// If not -> returns isNewUser=true plus a short-lived registrationToken to complete the profile.
router.post('/verify-otp', async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    return res.status(400).json({ error: 'شماره موبایل معتبر نیست.' });
  }

  const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : String(req.body?.otp ?? '').trim();
  if (otp !== HARDCODED_OTP) {
    return res.status(401).json({
      error: 'کد تایید وارد شده اشتباه است (برای تست از 11111 استفاده کنید).',
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { phone } });

    if (user) {
      // Existing user -> log in.
      const token = signToken({ id: user.id, phone: user.phone, role: 'USER' });
      return res.json({
        message: 'ورود با موفقیت انجام شد.',
        isNewUser: false,
        token,
        user: toPublicUser(user),
      });
    }

    // New user -> issue a short-lived registration token so they can complete their profile.
    const registrationToken = signToken(
      { phone, role: 'USER', purpose: 'registration' },
      60 * 15 // 15 minutes
    );

    return res.json({
      message: 'شماره تایید شد. لطفا نام و نام خانوادگی خود را وارد کنید.',
      isNewUser: true,
      registrationToken,
    });
  } catch (error) {
    console.error('[USER-AUTH] verify-otp error:', error);
    return res.status(500).json({ error: 'خطای داخلی سرور. لطفا دوباره تلاش کنید.' });
  }
});

// POST /api/user/complete-profile  { registrationToken, firstName, lastName }
// Creates the account for a phone that was just OTP-verified, then logs in.
router.post('/complete-profile', async (req, res) => {
  const { registrationToken, firstName, lastName } = req.body ?? {};

  const firstNameClean = typeof firstName === 'string' ? firstName.trim() : '';
  const lastNameClean = typeof lastName === 'string' ? lastName.trim() : '';

  if (!firstNameClean || !lastNameClean) {
    return res.status(400).json({ error: 'نام و نام خانوادگی الزامی است.' });
  }

  if (typeof registrationToken !== 'string' || !registrationToken) {
    return res.status(400).json({ error: 'توکن ثبت‌نام یافت نشد. لطفا مراحل ورود را از ابتدا انجام دهید.' });
  }

  // Verify the registration token instead of trusting a phone from the body.
  const payload = verifyToken(registrationToken);
  if (!payload || payload.purpose !== 'registration' || !payload.phone) {
    return res.status(401).json({
      error: 'توکن ثبت‌نام نامعتبر یا منقضی شده است. لطفا مراحل ورود را از ابتدا انجام دهید.',
    });
  }

  const phone = normalizePhone(payload.phone);
  if (!phone) {
    return res.status(400).json({ error: 'شماره موبایل معتبر نیست.' });
  }

  try {
    // Guard against a race where the account was created between OTP verify and profile completion.
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      const token = signToken({ id: existing.id, phone: existing.phone, role: 'USER' });
      return res.json({
        message: 'ورود با موفقیت انجام شد.',
        token,
        user: toPublicUser(existing),
      });
    }

    const user = await prisma.user.create({
      data: { phone, first_name: firstNameClean, last_name: lastNameClean },
    });

    const token = signToken({ id: user.id, phone: user.phone, role: 'USER' });

    return res.status(201).json({
      message: 'ثبت‌نام و ورود با موفقیت انجام شد.',
      token,
      user: toPublicUser(user),
    });
  } catch (error) {
    console.error('[USER-AUTH] complete-profile error:', error);
    return res.status(500).json({ error: 'خطای داخلی سرور. لطفا دوباره تلاش کنید.' });
  }
});

// GET /api/user/me  -> current authenticated user's profile.
router.get('/me', requireUser, async (req: UserAuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.appUser!.id } });
    if (!user) {
      return res.status(404).json({ error: 'کاربر یافت نشد.' });
    }
    res.json({ user: toPublicUser(user) });
  } catch (error) {
    console.error('[USER-AUTH] me error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

export default router;
