import React, { useState } from 'react';
import { api } from '../services/api';
import { BookMarked, ArrowLeft } from 'lucide-react';
import { Button, Field, Input, Notice, controlClass, cx } from '../components/ui';

interface LoginProps {
  onSuccess: (token: string, phone: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPhone = phone.trim();
    if (!/^09\d{9}$/.test(cleanPhone)) {
      setError('شماره موبایل معتبر نیست. شماره باید با ۰۹ شروع شده و دقیقاً ۱۱ رقم باشد.');
      return;
    }

    setLoading(true);
    try {
      await api.sendOtp(cleanPhone);
      setStep('OTP');
    } catch (err: any) {
      setError(err.message || 'خطا در ارسال کد تایید');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 5) {
      setError('لطفاً کد ۵ رقمی را وارد کنید.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.verifyOtp(phone.trim(), cleanOtp);
      localStorage.setItem('admin_token', res.token);
      localStorage.setItem('admin_phone', res.user.phone);
      onSuccess(res.token, res.user.phone);
    } catch (err: any) {
      setError(err.message || 'کد تایید اشتباه است.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-canvas px-6 py-12"
      dir="rtl"
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-9">
          <span className="mb-6 flex h-11 w-11 items-center justify-center rounded-panel bg-accent text-white">
            <BookMarked className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">ورود به پنل مدیریت</h1>
          <p className="mt-1.5 text-sm text-muted">
            {step === 'PHONE'
              ? 'شماره موبایل مدیر را وارد کنید تا کد یک‌بارمصرف برایتان ارسال شود.'
              : 'کد ۵ رقمی پیامک‌شده را وارد کنید.'}
          </p>
        </div>

        {error && (
          <div className="mb-5">
            <Notice tone="critical" onDismiss={() => setError('')}>
              {error}
            </Notice>
          </div>
        )}

        {step === 'PHONE' ? (
          <form onSubmit={handleSendOtp} className="space-y-5">
            <Field
              label="شماره موبایل"
              htmlFor="login-phone"
              hint="کد تایید به همین شماره پیامک می‌شود."
            >
              <Input
                id="login-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                dir="ltr"
                placeholder="09123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="num text-start text-base"
                required
              />
            </Field>

            <Button type="submit" variant="primary" loading={loading} className="w-full">
              {loading ? 'در حال ارسال…' : 'دریافت کد تایید'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface px-4 py-3">
              <p className="text-xs text-muted">
                ارسال‌شده به{' '}
                <span className="num font-semibold text-ink" dir="ltr">
                  {phone}
                </span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep('PHONE');
                  setOtp('');
                  setError('');
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition-colors duration-150 hover:text-accent-strong"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                تغییر شماره
              </button>
            </div>

            <Field label="کد تایید" htmlFor="login-otp" hint="کد تا ۲ دقیقه معتبر است.">
              <input
                id="login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={5}
                dir="ltr"
                placeholder="•••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className={cx(
                  controlClass,
                  'num py-3 text-center text-xl tracking-[0.45em] placeholder:tracking-[0.2em]',
                )}
                autoFocus
                required
              />
            </Field>

            <Button type="submit" variant="primary" loading={loading} className="w-full">
              {loading ? 'در حال بررسی…' : 'ورود'}
            </Button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-faint">
          دسترسی به این پنل محدود به شماره‌های مجاز مدیریت است.
        </p>
      </div>
    </div>
  );
};
