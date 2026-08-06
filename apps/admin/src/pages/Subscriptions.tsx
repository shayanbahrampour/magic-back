import React, { useEffect, useState } from 'react';
import { api, formatToman, toPersianDigits } from '../services/api';
import type { SubscriptionPlan } from '../services/api';
import { Plus, Edit2, Trash2, Archive, ArchiveRestore, CalendarClock } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  SegmentedControl,
  SkeletonRows,
  cx,
} from '../components/ui';

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
        setSuccess('پلن اشتراک به‌روزرسانی شد.');
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
    <div className="space-y-6">
      <PageHeader
        title="اشتراک‌ها"
        description="کاربران دارای اشتراک فعال به تمام کتاب‌ها دسترسی دارند، صرف‌نظر از قیمت هر کتاب."
        actions={
          !showForm && (
            <Button variant="primary" onClick={startCreate}>
              <Plus className="h-4 w-4" />
              پلن جدید
            </Button>
          )
        }
      />

      {error && (
        <Notice tone="critical" onDismiss={() => setError('')}>
          {error}
        </Notice>
      )}
      {success && (
        <Notice tone="positive" onDismiss={() => setSuccess('')}>
          {success}
        </Notice>
      )}

      {showForm && (
        <Panel className="animate-rise overflow-hidden">
          <PanelHeader
            title={editing ? 'ویرایش پلن' : 'پلن جدید'}
            hint={editing ? `شناسه ${editing.id}` : undefined}
            onClose={resetForm}
          />

          <form onSubmit={handleSubmit} className="space-y-5 p-5">
            <Field
              label="مدت اشتراک (ماه)"
              htmlFor="plan-months"
              hint="هر تعداد ماه دلخواه قابل تعریف است، نه فقط گزینه‌های بالا."
            >
              <div className="mb-3">
                <SegmentedControl
                  ariaLabel="مدت اشتراک"
                  value={Number(months)}
                  onChange={(next) => setMonths(String(next))}
                  options={PRESETS.map((m) => ({ value: m, label: presetLabel(m) }))}
                />
              </div>
              <Input
                id="plan-months"
                type="number"
                min={1}
                dir="ltr"
                className="num max-w-[10rem]"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </Field>

            <Field label="قیمت (تومان)" htmlFor="plan-price">
              <Input
                id="plan-price"
                type="number"
                min={0}
                dir="ltr"
                className="num max-w-[16rem]"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1000000"
              />
              {price !== '' && Number.isFinite(Number(price)) && (
                <p className="mt-1.5 text-xs font-semibold text-accent">
                  {formatToman(Number(price))}
                </p>
              )}
            </Field>

            <Field label="عنوان نمایشی (اختیاری)" htmlFor="plan-title">
              <Input
                id="plan-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`اگر خالی بماند: «اشتراک ${toPersianDigits(months || '1')} ماهه»`}
              />
            </Field>

            <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
              <Button type="button" onClick={resetForm}>
                انصراف
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {editing ? 'ذخیره تغییرات' : 'ایجاد پلن'}
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : plans.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="هیچ پلن اشتراکی تعریف نشده"
            hint="تا وقتی پلنی وجود نداشته باشد، کاربران فقط می‌توانند کتاب‌ها را تکی بخرند."
            action={
              !showForm && (
                <Button variant="primary" size="sm" onClick={startCreate}>
                  <Plus className="h-4 w-4" />
                  پلن جدید
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className={cx(
                  'flex flex-wrap items-center gap-4 px-5 py-4 transition-colors duration-150 ease-out-quart',
                  plan.isActive ? 'hover:bg-raised/50' : 'bg-raised/40',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4
                      className={cx(
                        'text-sm font-semibold',
                        plan.isActive ? 'text-ink' : 'text-muted',
                      )}
                    >
                      {plan.title}
                    </h4>
                    {!plan.isActive && <Badge>بایگانی‌شده</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {toPersianDigits(plan.durationMonths)} ماه ·{' '}
                    <span className="font-semibold text-ink">{formatToman(plan.priceToman)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <IconButton
                    label={plan.isActive ? 'بایگانی کردن پلن' : 'فعال کردن پلن'}
                    onClick={() => handleToggleActive(plan)}
                  >
                    {plan.isActive ? (
                      <Archive className="h-4 w-4" />
                    ) : (
                      <ArchiveRestore className="h-4 w-4" />
                    )}
                  </IconButton>
                  <IconButton label="ویرایش پلن" onClick={() => startEdit(plan)}>
                    <Edit2 className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="حذف پلن" tone="danger" onClick={() => handleDelete(plan)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};
