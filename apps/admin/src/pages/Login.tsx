import React, { useState } from 'react';
import { api } from '../services/api';
import { BookMarked, Sparkles, Phone, KeyRound, ArrowRight, Loader2 } from 'lucide-react';

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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 font-['Vazirmatn'] text-slate-100" dir="rtl">
      {/* Decorative background glow */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-xl border border-slate-700/60 rounded-3xl p-8 shadow-2xl relative z-10 animate-[fadeIn_0.3s_ease-out]">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-4 rounded-2xl text-white shadow-lg shadow-indigo-500/30 mb-4">
            <BookMarked className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            ورود به پنل مدیریت مجیک‌بوک
            <Sparkles className="h-5 w-5 text-amber-400 animate-pulse" />
          </h1>
          <p className="text-sm text-slate-400 mt-2 font-medium">
            لطفاً برای دسترسی به پنل مدیریت، احراز هویت کنید.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-sm font-medium leading-relaxed animate-[shake_0.2s_ease-in-out]">
            {error}
          </div>
        )}

        {step === 'PHONE' ? (
          <form onSubmit={handleSendOtp} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2">
                شماره موبایل
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="09123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-2xl py-3.5 px-4 pr-12 text-left text-white font-mono text-lg focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600"
                  required
                />
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                کد تایید یک‌بارمصرف (OTP) به شماره وارد شده پیامک می‌شود.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>در حال ارسال کد...</span>
                </>
              ) : (
                <>
                  <span>دریافت کد تایید</span>
                  <ArrowRight className="h-5 w-5 rotate-180" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 text-center">
              <p className="text-sm text-indigo-300 font-medium">
                کد تایید به شماره <span className="font-mono font-bold text-white" dir="ltr">{phone}</span> ارسال شد.
              </p>
              <div className="mt-2 inline-block px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold">
                کد تایید تستی: <span className="font-mono text-sm">11111</span>
              </div>
              <button
                type="button"
                onClick={() => setStep('PHONE')}
                className="block mx-auto mt-2 text-xs text-slate-400 hover:text-indigo-300 transition-colors underline"
              >
                ویرایش شماره موبایل
              </button>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2 text-center">
                کد ۵ رقمی تایید
              </label>
              <div className="relative max-w-xs mx-auto">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  dir="ltr"
                  placeholder="•••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-2xl py-3.5 px-4 pr-12 text-center text-white font-mono text-2xl tracking-[0.5em] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-600 placeholder:tracking-normal"
                  autoFocus
                  required
                />
                <KeyRound className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-600/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>در حال بررسی...</span>
                </>
              ) : (
                <span>ورود به پنل مدیریت</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
