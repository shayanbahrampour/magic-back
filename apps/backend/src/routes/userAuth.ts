import express, { Router } from 'express';
import multer from 'multer';
import prisma from '../db';
import { signToken, verifyToken } from '../utils/jwt';
import { requireUser, UserAuthRequest } from '../middleware/userAuth';
import { normalizeFileUrl } from '../utils/s3';
import { describeUploadError, storeFile } from '../utils/storage';
import { discardLatestOtp, issueOtp, verifyOtp } from '../services/otp';
import { SmsError, sendOtpSms } from '../services/sms';

const router = Router();

// Avatars are small; cap them well below the admin upload limit.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('فقط فایل تصویری مجاز است.'));
  },
});

const IRAN_PHONE_REGEX = /^09\d{9}$/;

function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const clean = input.trim();
  return IRAN_PHONE_REGEX.test(clean) ? clean : null;
}

function toPublicUser(
  user: {
    id: number;
    phone: string;
    first_name: string;
    last_name: string;
    avatar_url?: string | null;
  },
  req?: express.Request
) {
  return {
    id: user.id,
    phone: user.phone,
    firstName: user.first_name,
    lastName: user.last_name,
    avatarUrl: normalizeFileUrl(user.avatar_url, req),
  };
}

/** Validates a name field from a request body. Returns null when unusable. */
function cleanName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 60) return null;
  return trimmed;
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

  const issued = await issueOtp(phone, 'USER');
  if (!issued.ok) {
    return res.status(429).json({ error: issued.error, retryAfterSeconds: issued.retryAfterSeconds });
  }

  try {
    await sendOtpSms(phone, issued.code);
  } catch (error) {
    // The code was never delivered — drop it so the user can retry immediately
    // instead of waiting out the resend cooldown.
    await discardLatestOtp(phone, 'USER');
    return res.status(502).json({
      error: error instanceof SmsError ? error.message : 'ارسال پیامک انجام نشد. لطفاً دوباره تلاش کنید.',
    });
  }

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
  const check = await verifyOtp(phone, 'USER', otp);
  if (!check.ok) {
    return res.status(401).json({ error: check.error });
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
        user: toPublicUser(user, req),
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
        user: toPublicUser(existing, req),
      });
    }

    const user = await prisma.user.create({
      data: { phone, first_name: firstNameClean, last_name: lastNameClean },
    });

    const token = signToken({ id: user.id, phone: user.phone, role: 'USER' });

    return res.status(201).json({
      message: 'ثبت‌نام و ورود با موفقیت انجام شد.',
      token,
      user: toPublicUser(user, req),
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
    res.json({ user: toPublicUser(user, req) });
  } catch (error) {
    console.error('[USER-AUTH] me error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// PATCH /api/user/me  { firstName?, lastName?, avatarUrl? }
// Updates the caller's own profile. Only the fields present in the body change;
// passing `avatarUrl: null` removes the current picture. The phone number is
// deliberately not editable here — it identifies the account.
router.patch('/me', requireUser, async (req: UserAuthRequest, res) => {
  const { firstName, lastName, avatarUrl } = req.body ?? {};
  const data: { first_name?: string; last_name?: string; avatar_url?: string | null } = {};

  if (firstName !== undefined) {
    const clean = cleanName(firstName);
    if (!clean) return res.status(400).json({ error: 'نام معتبر نیست.' });
    data.first_name = clean;
  }

  if (lastName !== undefined) {
    const clean = cleanName(lastName);
    if (!clean) return res.status(400).json({ error: 'نام خانوادگی معتبر نیست.' });
    data.last_name = clean;
  }

  if (avatarUrl !== undefined) {
    if (avatarUrl === null || avatarUrl === '') {
      data.avatar_url = null;
    } else if (typeof avatarUrl === 'string') {
      data.avatar_url = avatarUrl.trim();
    } else {
      return res.status(400).json({ error: 'آدرس تصویر معتبر نیست.' });
    }
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'هیچ تغییری ارسال نشده است.' });
  }

  try {
    const user = await prisma.user.update({ where: { id: req.appUser!.id }, data });
    res.json({ message: 'پروفایل با موفقیت به‌روزرسانی شد.', user: toPublicUser(user, req) });
  } catch (error) {
    console.error('[USER-AUTH] update profile error:', error);
    res.status(500).json({ error: 'خطای داخلی سرور.' });
  }
});

// POST /api/user/me/avatar  (multipart, field `file`)
// Stores the image and points the caller's profile at it in one round-trip.
router.post('/me/avatar', requireUser, (req: UserAuthRequest, res) => {
  avatarUpload.single('file')(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      const tooLarge = uploadErr.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        error: tooLarge ? 'حجم تصویر باید کمتر از ۵ مگابایت باشد.' : uploadErr.message || 'آپلود تصویر ناموفق بود.',
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'تصویری ارسال نشده است.' });
    }

    try {
      const url = await storeFile(req.file, req, 'avatars');
      const user = await prisma.user.update({
        where: { id: req.appUser!.id },
        data: { avatar_url: url },
      });
      res.json({ message: 'تصویر پروفایل به‌روزرسانی شد.', user: toPublicUser(user, req) });
    } catch (error: any) {
      console.error('[USER-AUTH] avatar upload error:', error);
      res.status(500).json({ error: describeUploadError(error) });
    }
  });
});

export default router;
