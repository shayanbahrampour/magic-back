import React, { useEffect, useState } from 'react';
import { api, formatToman, toPersianDigits } from '../services/api';
import type { SubscriptionPlan } from '../services/api';
import { CreditCard, Plus, X, Edit2, Trash2, Archive, CalendarClock } from 'lucide-react';

// Common periods offered as one-click presets. An admin can still type any
// number of months, which is the point of keeping `duration_months` free-form.
const PRESETS = [1, 3, 6, 12];

function presetLabel(months: number): string {
  if (months === 12) return 'یک ساله';
  return `${toPersianDigits(months)} ماهه`;
}

export const Subscriptions: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [title, setTitle] = useState('');
  const [months, setMonths] = useState('1');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    try {
      setPlans(await api.getSubscriptionPlans());
      setError('');
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری پلن‌های اشتراک');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setTitle('');
    setMonths('1');
    setPrice('');
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (plan: SubscriptionPlan) => {
    setEditing(plan);
    setShowForm(true);
    setTitle(plan.title);
    setMonths(String(plan.durationMonths));
    setPrice(String(plan.priceToman));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const durationMonths = Number(months);
    const priceToman = Number(price);
    if (!Number.isInteger(durationMonths) || durationMonths < 1) {
      setError('مدت اشتراک باید عددی صحیح و بزرگ‌تر از صفر باشد.');
      return;
    }
    if (!Number.isInteger(priceToman) || priceToman < 0) {
      setError('قیمت باید یک عدد صحیح و نامنفی (به تومان) باشد.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.updateSubscriptionPlan(editing.id, { title, durationMonths, priceToman });
        setSuccess('پلن اشتراک با موفقیت به‌روزرسانی شد.');
      } else {
        await api.createSubscriptionPlan({ title, durationMonths, priceToman });
        setSuccess('پلن اشتراک جدید ایجاد شد.');
      }
      resetForm();
      await loadPlans();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره پلن اشتراک');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    setError('');
    setSuccess('');
    try {
      await api.updateSubscriptionPlan(plan.id, { isActive: !plan.isActive } as any);
      setSuccess(plan.isActive ? 'پلن بایگانی شد.' : 'پلن دوباره فعال شد.');
      await loadPlans();
    } catch (err: any) {
      setError(err.message || 'خطا در تغییر وضعیت پلن');
    }
  };

  const handleDelete = async (plan: SubscriptionPlan) => {
    if (!window.confirm(`آیا از حذف پلن «${plan.title}» اطمینان دارید؟`)) return;
    setError('');
    setSuccess('');
    try {
      const res = await api.deleteSubscriptionPlan(plan.id);
      setSuccess(res.message);
      await loadPlans();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف پلن');
    }
  };

  return (
    <div className="space-y-6 text-right">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2.5 tracking-tight">
            <CreditCard className="h-6 w-6 text-indigo-500" /> پلن‌های اشتراک
          </h2>
          <p className="text-sm text-slate-500 mt-1.5">
            کاربران دارای اشتراک فعال به تمام کتاب‌ها دسترسی دارند.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={startCreate}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/25 transition duration-150 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> افزودن پلن جدید
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-sm font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-100 text-sm font-medium">
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md space-y-5 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex justify-between items-center pb-2 border-b border-slate-50">
            <h4 className="font-bold text-slate-800 text-sm">
              {editing ? 'ویرایش پلن اشتراک' : 'ایجاد پلن اشتراک جدید'}
            </h4>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">مدت اشتراک (ماه)</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonths(String(m))}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                      Number(months) === m
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {presetLabel(m)}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                placeholder="مثال: ۲ برای اشتراک دو ماهه"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
              <p className="text-xs text-slate-400 mt-1.5">
                هر تعداد ماه دلخواه قابل تعریف است، نه فقط گزینه‌های بالا.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">قیمت (تومان)</label>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="مثال: 1000000"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
              {price !== '' && Number.isFinite(Number(price)) && (
                <p className="text-xs text-indigo-600 font-bold mt-1.5">{formatToman(Number(price))}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">
                عنوان نمایشی (اختیاری)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`اگر خالی بماند: «اشتراک ${months || '۱'} ماهه»`}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-50">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/10 transition"
              >
                {saving ? 'در حال ذخیره...' : editing ? 'ذخیره تغییرات' : 'ایجاد پلن'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : plans.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <CalendarClock className="h-8 w-8 text-slate-300" />
            <p>هنوز هیچ پلن اشتراکی تعریف نشده است. روی «افزودن پلن جدید» کلیک کنید.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`px-6 py-4 flex justify-between items-center gap-4 transition duration-150 ${
                  plan.isActive ? 'hover:bg-slate-50/50' : 'bg-slate-50/60 opacity-70'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="h-11 w-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center border border-indigo-100 shrink-0">
                    <CalendarClock className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-800 text-sm truncate">{plan.title}</h4>
                      {!plan.isActive && (
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded-full">
                          بایگانی‌شده
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      مدت: {toPersianDigits(plan.durationMonths)} ماه ·{' '}
                      <span className="font-bold text-indigo-600">{formatToman(plan.priceToman)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(plan)}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition"
                    title={plan.isActive ? 'بایگانی کردن پلن' : 'فعال کردن پلن'}
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => startEdit(plan)}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition"
                    title="ویرایش پلن"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(plan)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition"
                    title="حذف پلن"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
