import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import { api, formatJalali, formatToman, toPersianDigits } from '../services/api';
import type {
  Book,
  Category,
  SalesFilters,
  SalesGroupBy,
  SalesKind,
  SalesReport,
  SalesSource,
  SalesStatus,
  SubscriptionPlan,
} from '../services/api';
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
  Select,
  Skeleton,
  SkeletonRows,
  Table,
  Td,
  Th,
  Tr,
} from '../components/ui';

const PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const TEHRAN_OFFSET_MS = 210 * 60 * 1000;

/** `YYYY-MM-DD` of the Tehran calendar day `daysAgo` days before today. */
function tehranDay(daysAgo = 0): string {
  return new Date(Date.now() + TEHRAN_OFFSET_MS - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

const PRESETS = [
  { key: '7', label: '۷ روز', days: 7 },
  { key: '30', label: '۳۰ روز', days: 30 },
  { key: '90', label: '۹۰ روز', days: 90 },
  { key: '365', label: 'یک سال', days: 365 },
  { key: 'all', label: 'همه', days: null },
] as const;

const STATUS_LABELS: Record<string, string> = {
  verified: 'موفق',
  paid: 'پرداخت‌شده (در انتظار تأیید)',
  pending: 'در انتظار',
  failed: 'ناموفق',
};

const STATUS_TONES: Record<string, 'positive' | 'caution' | 'neutral' | 'critical'> = {
  verified: 'positive',
  paid: 'caution',
  pending: 'neutral',
  failed: 'critical',
};

type FilterState = Required<Pick<SalesFilters, 'kind' | 'source' | 'status' | 'groupBy'>> & {
  from: string;
  to: string;
  bookId: string;
  planId: string;
  categoryId: string;
  q: string;
};

const DEFAULT_FILTERS: FilterState = {
  from: tehranDay(29),
  to: tehranDay(0),
  kind: 'all',
  source: 'all',
  status: 'verified',
  groupBy: 'day',
  bookId: '',
  planId: '',
  categoryId: '',
  q: '',
};

function periodLabel(period: string, groupBy: SalesGroupBy): string {
  if (groupBy === 'month') return toPersianDigits(period);
  const label = formatJalali(`${period}T12:00:00Z`);
  return groupBy === 'week' ? `هفته‌ی ${label}` : label;
}

function formatPercent(ratio: number | null): string {
  if (ratio === null) return '—';
  return `${toPersianDigits(Math.round(ratio * 100))}٪`;
}

export const Sales: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  // The search box applies on submit, not per keystroke.
  const [qDraft, setQDraft] = useState('');
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  useEffect(() => {
    Promise.all([api.getBooks(), api.getCategories(), api.getSubscriptionPlans()])
      .then(([b, c, p]) => {
        setBooks(b);
        setCategories(c);
        setPlans(p);
      })
      .catch(() => {
        // The report still works without the dropdown options.
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getSales({
        from: filters.from || undefined,
        to: filters.to || undefined,
        kind: filters.kind,
        source: filters.source,
        status: filters.status,
        groupBy: filters.groupBy,
        bookId: filters.bookId ? Number(filters.bookId) : undefined,
        planId: filters.planId ? Number(filters.planId) : undefined,
        categoryId: filters.categoryId ? Number(filters.categoryId) : undefined,
        q: filters.q || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری گزارش فروش');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Any filter change returns to the first page of transactions.
  const update = (patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const activePreset = PRESETS.find((p) =>
    p.days === null
      ? !filters.from && !filters.to
      : filters.from === tehranDay(p.days - 1) && filters.to === tehranDay(0),
  )?.key;

  const isFiltered =
    filters.kind !== 'all' ||
    filters.source !== 'all' ||
    filters.status !== 'verified' ||
    filters.bookId !== '' ||
    filters.planId !== '' ||
    filters.categoryId !== '' ||
    filters.q !== '';

  const summary = report?.summary;
  const totalPages = report ? Math.max(1, Math.ceil(report.transactions.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="گزارش فروش"
        description="درآمد درگاه پرداخت و خریدهای امتیازی، با فیلتر بر اساس بازه، نوع فروش، کتاب، دسته‌بندی، پلن، وضعیت و خریدار."
        actions={
          <Button onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" /> به‌روزرسانی
          </Button>
        }
      />

      {/* Filters */}
      <Panel className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="بازه‌ی زمانی">
            <SegmentedControl
              ariaLabel="بازه‌ی زمانی"
              value={activePreset ?? 'custom'}
              onChange={(key) => {
                const preset = PRESETS.find((p) => p.key === key);
                if (!preset) return;
                update(
                  preset.days === null
                    ? { from: '', to: '' }
                    : { from: tehranDay(preset.days - 1), to: tehranDay(0) },
                );
              }}
              options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
            />
          </Field>
          <Field label="از تاریخ" htmlFor="sales-from">
            <Input
              id="sales-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => update({ from: e.target.value })}
              dir="ltr"
              className="w-40"
            />
          </Field>
          <Field label="تا تاریخ" htmlFor="sales-to">
            <Input
              id="sales-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => update({ to: e.target.value })}
              dir="ltr"
              className="w-40"
            />
          </Field>
          <Field label="گروه‌بندی نمودار">
            <SegmentedControl<SalesGroupBy>
              ariaLabel="گروه‌بندی نمودار"
              value={filters.groupBy}
              onChange={(groupBy) => update({ groupBy })}
              options={[
                { value: 'day', label: 'روزانه' },
                { value: 'week', label: 'هفتگی' },
                { value: 'month', label: 'ماهانه' },
              ]}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="نوع فروش" htmlFor="sales-kind">
            <Select
              id="sales-kind"
              value={filters.kind}
              onChange={(e) => update({ kind: e.target.value as SalesKind })}
            >
              <option value="all">همه</option>
              <option value="book">کتاب</option>
              <option value="subscription">اشتراک</option>
            </Select>
          </Field>
          <Field label="روش پرداخت" htmlFor="sales-source">
            <Select
              id="sales-source"
              value={filters.source}
              onChange={(e) => update({ source: e.target.value as SalesSource })}
            >
              <option value="all">همه</option>
              <option value="gateway">درگاه پرداخت (تومان)</option>
              <option value="points">امتیاز</option>
            </Select>
          </Field>
          <Field label="وضعیت" htmlFor="sales-status">
            <Select
              id="sales-status"
              value={filters.status}
              onChange={(e) => update({ status: e.target.value as SalesStatus })}
            >
              <option value="verified">موفق</option>
              <option value="all">همه وضعیت‌ها</option>
              <option value="paid">پرداخت‌شده (در انتظار تأیید)</option>
              <option value="pending">در انتظار</option>
              <option value="failed">ناموفق</option>
            </Select>
          </Field>
          <Field label="دسته‌بندی" htmlFor="sales-category">
            <Select
              id="sales-category"
              value={filters.categoryId}
              onChange={(e) => update({ categoryId: e.target.value })}
            >
              <option value="">همه دسته‌بندی‌ها</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="کتاب" htmlFor="sales-book">
            <Select
              id="sales-book"
              value={filters.bookId}
              onChange={(e) => update({ bookId: e.target.value })}
            >
              <option value="">همه کتاب‌ها</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="پلن اشتراک" htmlFor="sales-plan">
            <Select
              id="sales-plan"
              value={filters.planId}
              onChange={(e) => update({ planId: e.target.value })}
            >
              <option value="">همه پلن‌ها</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="خریدار" htmlFor="sales-q" className="sm:col-span-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                update({ q: qDraft.trim() });
              }}
            >
              <Input
                id="sales-q"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                placeholder="شماره موبایل یا نام"
              />
              <Button type="submit">
                <Search className="h-4 w-4" /> جستجو
              </Button>
            </form>
          </Field>
        </div>

        {isFiltered && (
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setQDraft('');
                update({ ...DEFAULT_FILTERS, from: filters.from, to: filters.to, groupBy: filters.groupBy });
              }}
            >
              <X className="h-4 w-4" /> حذف فیلترها
            </Button>
          </div>
        )}
      </Panel>

      {error && <Notice tone="critical">{error}</Notice>}

      {/* Headline numbers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="درآمد"
          value={summary ? formatToman(summary.revenueToman) : null}
          hint={summary ? `${toPersianDigits(summary.orders)} سفارش موفق` : undefined}
        />
        <StatTile
          label="میانگین هر سفارش"
          value={summary ? formatToman(summary.averageOrderToman) : null}
          hint={summary ? `${toPersianDigits(summary.uniqueBuyers)} خریدار یکتا` : undefined}
        />
        <StatTile
          label="فروش کتاب"
          value={summary ? formatToman(summary.bookRevenueToman) : null}
          hint={summary ? `${toPersianDigits(summary.bookOrders)} سفارش` : undefined}
        />
        <StatTile
          label="فروش اشتراک"
          value={summary ? formatToman(summary.subscriptionRevenueToman) : null}
          hint={summary ? `${toPersianDigits(summary.subscriptionOrders)} سفارش` : undefined}
        />
        <StatTile
          label="خرید با امتیاز"
          value={summary ? `${toPersianDigits(summary.pointsPurchases)} کتاب` : null}
          hint={summary ? `${toPersianDigits(summary.pointsSpent)} امتیاز خرج شده` : undefined}
        />
        <StatTile
          label="نرخ موفقیت پرداخت"
          value={summary ? formatPercent(summary.conversionRate) : null}
          hint="سهم پرداخت‌های درگاه که تأیید شده‌اند"
        />
        {(['failed', 'pending'] as const).map((s) => {
          const row = report?.byStatus.find((r) => r.status === s);
          return (
            <StatTile
              key={s}
              label={`پرداخت‌های ${STATUS_LABELS[s]}`}
              value={row ? toPersianDigits(row.count) : null}
              hint={row ? formatToman(row.amountToman) : undefined}
            />
          );
        })}
      </div>

      {/* Revenue over time */}
      <Panel className="overflow-hidden">
        <PanelHeader
          title="درآمد در طول زمان"
          hint="فقط فروش‌های موفق درگاه؛ جزئیات هر ستون با نگه داشتن نشانگر روی آن نمایش داده می‌شود."
        />
        {loading && !report ? (
          <div className="p-5">
            <Skeleton className="h-48 w-full" />
          </div>
        ) : report && report.timeseries.length > 0 ? (
          <RevenueChart data={report.timeseries} groupBy={filters.groupBy} />
        ) : (
          <EmptyState icon={BarChart3} title="فروشی در این بازه ثبت نشده است" hint="بازه یا فیلترها را تغییر دهید." />
        )}
      </Panel>

      {/* Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownPanel
          title="بر اساس کتاب"
          loading={loading && !report}
          rows={(report?.byBook ?? []).map((b) => ({
            key: b.bookId,
            label: b.title,
            revenue: b.revenueToman,
            detail: `${toPersianDigits(b.orders)} سفارش${b.pointsPurchases ? ` · ${toPersianDigits(b.pointsPurchases)} با امتیاز` : ''}`,
            onSelect: () => update({ bookId: String(b.bookId) }),
          }))}
        />
        <BreakdownPanel
          title="بر اساس دسته‌بندی"
          hint="کتابی که در چند دسته است در هر کدام شمرده می‌شود."
          loading={loading && !report}
          rows={(report?.byCategory ?? []).map((c) => ({
            key: c.categoryId,
            label: c.name,
            revenue: c.revenueToman,
            detail: `${toPersianDigits(c.orders)} سفارش${c.pointsPurchases ? ` · ${toPersianDigits(c.pointsPurchases)} با امتیاز` : ''}`,
            onSelect: () => update({ categoryId: String(c.categoryId) }),
          }))}
        />
        <BreakdownPanel
          title="بر اساس پلن اشتراک"
          loading={loading && !report}
          rows={(report?.byPlan ?? []).map((p) => ({
            key: p.planId ?? 'deleted',
            label: p.title,
            revenue: p.revenueToman,
            detail: `${toPersianDigits(p.orders)} سفارش`,
            onSelect: p.planId ? () => update({ planId: String(p.planId) }) : undefined,
          }))}
        />
        <BreakdownPanel
          title="بر اساس وضعیت پرداخت"
          hint="همه‌ی تلاش‌های پرداخت درگاه در این بازه، صرف‌نظر از فیلتر وضعیت."
          loading={loading && !report}
          rows={(report?.byStatus ?? []).map((s) => ({
            key: s.status,
            label: STATUS_LABELS[s.status] ?? s.status,
            revenue: s.amountToman,
            detail: `${toPersianDigits(s.count)} تراکنش`,
            onSelect: () => update({ status: s.status as SalesStatus }),
          }))}
        />
      </div>

      {/* Ledger */}
      <Panel className="overflow-hidden">
        <PanelHeader
          title="تراکنش‌ها"
          hint={report ? `${toPersianDigits(report.transactions.total)} مورد` : undefined}
        />
        {loading && !report ? (
          <SkeletonRows rows={6} />
        ) : !report || report.transactions.rows.length === 0 ? (
          <EmptyState icon={BarChart3} title="تراکنشی با این فیلترها یافت نشد" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>تاریخ</Th>
                  <Th>خریدار</Th>
                  <Th>مورد</Th>
                  <Th>مبلغ</Th>
                  <Th>وضعیت</Th>
                  <Th className="hidden lg:table-cell">کد رهگیری</Th>
                </tr>
              </thead>
              <tbody>
                {report.transactions.rows.map((t) => (
                  <Tr key={t.id}>
                    <Td className="whitespace-nowrap text-sm text-muted">{formatJalali(t.createdAt)}</Td>
                    <Td>
                      <p className="text-sm font-semibold text-ink">{t.user.name || '—'}</p>
                      <p className="font-mono text-xs text-muted" dir="ltr">
                        {t.user.phone}
                      </p>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={t.kind === 'book' ? 'accent' : 'neutral'}>
                          {t.kind === 'book' ? 'کتاب' : 'اشتراک'}
                        </Badge>
                        <span className="text-sm text-ink">
                          {t.book?.title ?? t.plan?.title ?? (t.kind === 'subscription' ? 'پلن حذف‌شده' : 'کتاب حذف‌شده')}
                        </span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-sm font-semibold text-ink">
                      {t.source === 'points'
                        ? `${toPersianDigits(t.pointsSpent)} امتیاز`
                        : formatToman(t.amountToman)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONES[t.status] ?? 'neutral'}>
                        {STATUS_LABELS[t.status] ?? t.status}
                      </Badge>
                    </Td>
                    <Td className="hidden font-mono text-xs text-muted lg:table-cell" dir="ltr">
                      {t.trackId ?? '—'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-line-soft px-5 py-3">
                <p className="text-xs text-muted">
                  صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)}
                </p>
                <div className="flex gap-1">
                  {/* RTL: "previous" points right. */}
                  <IconButton label="صفحه قبل" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="صفحه بعد" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
};

function StatTile({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <Panel className="p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      {value === null ? (
        <Skeleton className="mt-2 h-7 w-2/3" />
      ) : (
        <p className="mt-1.5 text-xl font-bold tracking-tight text-ink">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </Panel>
  );
}

function RevenueChart({ data, groupBy }: { data: SalesReport['timeseries']; groupBy: SalesGroupBy }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.revenueToman));
  const active = hovered !== null ? data[hovered] : null;

  return (
    <div className="p-5">
      {/* Readout: the hovered bucket, or a prompt when nothing is hovered. */}
      <div className="mb-3 min-h-[2.75rem] text-xs text-muted" aria-live="polite">
        {active ? (
          <>
            <p className="font-semibold text-ink">
              {periodLabel(active.period, groupBy)} — {formatToman(active.revenueToman)}
            </p>
            <p>
              کتاب {formatToman(active.bookRevenueToman)} · اشتراک {formatToman(active.subscriptionRevenueToman)} ·{' '}
              {toPersianDigits(active.orders)} سفارش
              {active.pointsPurchases > 0 && ` · ${toPersianDigits(active.pointsPurchases)} خرید امتیازی`}
            </p>
          </>
        ) : (
          <p>بیشترین: {formatToman(max)}</p>
        )}
      </div>
      <div
        className="flex h-48 items-end gap-[2px] border-b border-line"
        dir="ltr"
        onMouseLeave={() => setHovered(null)}
      >
        {data.map((d, i) => (
          <button
            key={d.period}
            type="button"
            aria-label={`${periodLabel(d.period, groupBy)}: ${formatToman(d.revenueToman)}`}
            onMouseEnter={() => setHovered(i)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            className="flex h-full min-w-0 flex-1 items-end focus:outline-none"
          >
            <span
              className={`block w-full rounded-t-[4px] transition-colors duration-150 ${
                hovered === i ? 'bg-accent-strong' : 'bg-accent'
              }`}
              style={{ height: `${Math.max(d.revenueToman > 0 ? 2 : 0, (d.revenueToman / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[0.6875rem] text-faint" dir="ltr">
        <span>{periodLabel(data[0].period, groupBy)}</span>
        {data.length > 1 && <span>{periodLabel(data[data.length - 1].period, groupBy)}</span>}
      </div>
    </div>
  );
}

function BreakdownPanel({
  title,
  hint,
  loading,
  rows,
}: {
  title: string;
  hint?: string;
  loading: boolean;
  rows: { key: string | number; label: string; revenue: number; detail: string; onSelect?: () => void }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title={title} hint={hint} />
      {loading ? (
        <SkeletonRows rows={4} />
      ) : rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-muted">داده‌ای برای نمایش نیست.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.slice(0, 10).map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={r.onSelect}
                disabled={!r.onSelect}
                title={r.onSelect ? 'فیلتر بر اساس این مورد' : undefined}
                className="block w-full px-5 py-3 text-start transition-colors hover:bg-raised/60 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-ink">{r.label}</span>
                  <span className="shrink-0 text-sm text-ink">{formatToman(r.revenue)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${(r.revenue / max) * 100}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-xs text-muted">{r.detail}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
