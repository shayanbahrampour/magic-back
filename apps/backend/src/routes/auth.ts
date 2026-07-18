import { Router } from 'express';
import { signToken } from '../utils/jwt';

const router = Router();

const IRAN_PHONE_REGEX = /^09\d{9}$/;

function isAllowedAdmin(phone: string): boolean {
  const envPhones = process.env.ADMIN_PHONES || '09136441844,09135709925';
  const allowedList = envPhones.split(',').map((p) => p.trim()).filter(Boolean);
  return allowedList.includes(phone);
}

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone || typeof phone !== 'string' || !IRAN_PHONE_REGEX.test(phone.trim())) {
    return res.status(400).json({
      error: 'شماره موبایل معتبر نیست. شماره باید با 09 آغاز شده و دقیقاً ۱۱ رقم باشد (مثال: 09123456789).',
    });
  }

  const cleanPhone = phone.trim();

  if (!isAllowedAdmin(cleanPhone)) {
    return res.status(403).json({
      error: 'شماره موبایل وارد شده در سیستم ثبت نشده است و دسترسی مدیریت ندارد.',
    });
  }

  // For now, OTP is hardcoded to 11111
  console.log(`[AUTH] OTP requested for ${cleanPhone}. Hardcoded OTP: 11111`);

  res.json({
    message: 'کد تایید ۵ رقمی به شماره شما ارسال شد.',
    phone: cleanPhone,
  });
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || typeof phone !== 'string' || !IRAN_PHONE_REGEX.test(phone.trim())) {
    return res.status(400).json({
      error: 'شماره موبایل معتبر نیست.',
    });
  }

  const cleanPhone = phone.trim();

  if (!isAllowedAdmin(cleanPhone)) {
    return res.status(403).json({
      error: 'شماره موبایل وارد شده در سیستم ثبت نشده است و دسترسی مدیریت ندارد.',
    });
  }

  const cleanOtp = typeof otp === 'string' ? otp.trim() : String(otp || '').trim();

  // Hardcoded check: 11111
  if (cleanOtp !== '11111') {
    return res.status(401).json({
      error: 'کد تایید وارد شده اشتباه است (برای تست از 11111 استفاده کنید).',
    });
  }

  const token = signToken({
    phone: cleanPhone,
    role: 'ADMIN',
  });

  res.json({
    message: 'ورود با موفقیت انجام شد.',
    token,
    user: {
      phone: cleanPhone,
      role: 'ADMIN',
    },
  });
});

export default router;
