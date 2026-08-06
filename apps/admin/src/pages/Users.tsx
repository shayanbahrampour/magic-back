import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  daysUntil,
  formatJalali,
  formatToman,
  toPersianDigits,
} from '../services/api';
import type {
  AdminUser,
  BookPurchaseRecord,
  SubscriptionPlan,
  UserHistory,
  UserSubscriptionRecord,
} from '../services/api';
import {
  ChevronDown,
  Search,
  RefreshCw,
  Users as UsersIcon,
  CalendarPlus,
  BookOpen,
  Award,
  CreditCard,
  Flame,
} from 'lucide-react';
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
  Select,
  Skeleton,
  SkeletonRows,
  Table,
  Td,
  Th,
  cx,
} from '../components/ui';

const PAGE_SIZE = 25;

function fullName(user: AdminUser): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.phone;
}

/** Two-letter monogram for users with no uploaded avatar. */
function initials(user: AdminUser): string {
  const first = user.firstName?.trim()?.[0] ?? '';
  const last = user.lastName?.trim()?.[0] ?? '';
  return (first + last).trim() || '؟';
}

/** Describes an active window as "N روز باقی‌مانده", or when it starts if queued. */
function subscriptionSummary(sub: UserSubscriptionRecord): string {
  const startsIn = daysUntil(sub.startsAt);
  if (startsIn > 0) {
    return `از ${formatJalali(sub.startsAt)} آغاز می‌شود`;
  }
  const left = daysUntil(sub.expiresAt);
  if (left <= 0) return `در ${formatJalali(sub.expiresAt)} منقضی شد`;
  return `${toPersianDigits(left)} روز باقی‌مانده`;
}

export const Users: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  // Row expansion. Only one row is open at a time: two open detail panes make
  // the table impossible to scan.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [histories, setHistories] = useState<Record<number, UserHistory>>({});
  const [historyLoading, setHistoryLoading] = useState<number | null>(null);

  // Grant form state, scoped to whichever row is open.
  const [grantOpenFor, setGrantOpenFor] = useState<number | null>(null);
  const [grantPlanId, setGrantPlanId] = useState('');
  const [grantMonths, setGrantMonths] = useState('');
  const [granting, setGranting] = useState(false);

  const loadUsers = useCallback(async (opts: { q: string; page: number }) => {
    setLoading(true);
    try {
      const res = await api.getUsers({ q: opts.q, page: opts.page, pageSize: PAGE_SIZE });
      setUsers(res.users);
      setTotal(res.total);
      setError('');
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری فهرست کاربران');
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the search so typing a phone number doesn't fire a request a digit.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadUsers({ q: query, page });
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, page, loadUsers]);

  useEffect(() => {
    api.getSubscriptionPlans().then(
      (all) => setPlans(all.filter((p) => p.isActive)),
      () => setPlans([]),
    );
  }, []);

  // `force` refetches an already-cached history, which is what a fresh grant
  // needs. Without it the cache check below reads a stale closure and the
  // detail pane would keep showing the pre-grant history.
  const loadHistory = async (userId: number, force = false) => {
    if (!force && histories[userId]) return;
    setHistoryLoading(userId);
    try {
      const history = await api.getUserHistory(userId);
      setHistories((prev) => ({ ...prev, [userId]: history }));
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری سوابق کاربر');
    } finally {
      setHistoryLoading(null);
    }
  };

  const toggleExpand = (userId: number) => {
    const next = expandedId === userId ? null : userId;
    setExpandedId(next);
    setGrantOpenFor(null);
    if (next !== null) loadHistory(next);
  };

  const openGrant = (userId: number) => {
    setExpandedId(userId);
    setGrantOpenFor(userId);
    setGrantPlanId(plans[0] ? String(plans[0].id) : '');
    setGrantMonths('');
    loadHistory(userId);
  };

  const handleGrant = async (e: React.FormEvent, user: AdminUser) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const planId = grantPlanId ? Number(grantPlanId) : undefined;
    const months = grantMonths.trim() ? Number(grantMonths) : undefined;

    if (planId === undefined && months === undefined) {
      setError('یک پلن انتخاب کنید یا مدت اشتراک را وارد کنید.');
      return;
    }
    if (months !== undefined && (!Number.isInteger(months) || months < 1 || months > 120)) {
      setError('مدت اشتراک باید عددی صحیح بین ۱ تا ۱۲۰ ماه باشد.');
      return;
    }

    setGranting(true);
    try {
      const res = await api.grantSubscription(user.id, { planId, durationMonths: months });
      setSuccess(
        res.extended
          ? `اشتراک به «${fullName(user)}» افزوده شد و پس از پایان اشتراک فعلی آغاز می‌شود (تا ${formatJalali(res.subscription.expiresAt)}).`
          : `اشتراک «${fullName(user)}» تا ${formatJalali(res.subscription.expiresAt)} فعال شد.`,
      );
      setGrantOpenFor(null);
      // The row badge and the history pane both derive from the server, so
      // refetch rather than patching two copies of the same fact.
      await Promise.all([loadUsers({ q: query, page }), loadHistory(user.id, true)]);
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت اشتراک');
    } finally {
      setGranting(false);
    }
  };

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="کاربران"
        description="فهرست کاربران اپلیکیشن، وضعیت اشتراک و سوابق خرید آن‌ها."
        actions={
          <IconButton
            label="بارگذاری مجدد"
            onClick={() => loadUsers({ q: query, page })}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
          </IconButton>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="جستجو بر اساس نام یا شماره موبایل"
            className="ps-9"
            aria-label="جستجوی کاربر"
          />
        </div>
        {!loading && (
          <p className="text-xs text-muted">{toPersianDigits(total)} کاربر</p>
        )}
      </div>

      <Panel className="overflow-hidden">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={query ? 'کاربری با این مشخصات پیدا نشد' : 'هنوز کاربری ثبت‌نام نکرده'}
            hint={
              query
                ? 'بخشی از نام یا شماره موبایل را امتحان کنید.'
                : 'کاربران با اولین ورود از طریق اپلیکیشن اینجا ظاهر می‌شوند.'
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-10" />
                <Th>کاربر</Th>
                <Th className="hidden md:table-cell">شماره موبایل</Th>
                <Th className="hidden lg:table-cell">امتیاز</Th>
                <Th>اشتراک</Th>
                <Th className="w-40 text-end">عملیات</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const expanded = expandedId === user.id;
                return (
                  <React.Fragment key={user.id}>
                    <tr
                      className={cx(
                        'border-b border-line-soft transition-colors duration-150 ease-out-quart',
                        expanded ? 'bg-raised/60' : 'hover:bg-raised/50',
                      )}
                    >
                      <Td>
                        <IconButton
                          label={expanded ? 'بستن جزئیات' : 'نمایش جزئیات'}
                          aria-expanded={expanded}
                          onClick={() => toggleExpand(user.id)}
                        >
                          <ChevronDown
                            className={cx(
                              'h-4 w-4 transition-transform duration-150 ease-out-quart',
                              expanded && 'rotate-180',
                            )}
                          />
                        </IconButton>
                      </Td>

                      <Td>
                        <div className="flex items-center gap-3">
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-full border border-line object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold text-muted">
                              {initials(user)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="text-xs text-muted">
                              عضویت از {formatJalali(user.createdAt)}
                            </p>
                          </div>
                        </div>
                      </Td>

                      <Td className="num hidden text-xs text-muted md:table-cell" dir="ltr">
                        {user.phone}
                      </Td>

                      <Td className="hidden lg:table-cell">
                        <div className="flex items-center gap-3 text-xs text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Award className="h-3.5 w-3.5 text-faint" />
                            <span className="num">{user.totalXp}</span>
                          </span>
                          {user.currentStreak > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Flame className="h-3.5 w-3.5 text-faint" />
                              <span className="num">{user.currentStreak}</span>
                            </span>
                          )}
                        </div>
                      </Td>

                      <Td>
                        {user.isSubscribed && user.activeSubscription ? (
                          <div className="space-y-1">
                            <Badge tone="positive">اشتراک فعال</Badge>
                            <p className="text-xs text-muted">
                              {subscriptionSummary(user.activeSubscription)}
                            </p>
                          </div>
                        ) : (
                          <Badge>بدون اشتراک</Badge>
                        )}
                      </Td>

                      <Td>
                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => openGrant(user.id)}>
                            <CalendarPlus className="h-3.5 w-3.5" />
                            افزودن اشتراک
                          </Button>
                        </div>
                      </Td>
                    </tr>

                    {expanded && (
                      <tr className="border-b border-line-soft">
                        <td colSpan={6} className="bg-raised/30 p-0">
                          <div className="animate-rise space-y-5 px-5 py-5">
                            {grantOpenFor === user.id && (
                              <form
                                onSubmit={(e) => handleGrant(e, user)}
                                className="flex flex-col gap-4 rounded-control border border-line bg-surface p-4 sm:flex-row sm:items-end"
                              >
                                <Field label="پلن" htmlFor={`plan-${user.id}`} className="flex-1">
                                  <Select
                                    id={`plan-${user.id}`}
                                    value={grantPlanId}
                                    onChange={(e) => setGrantPlanId(e.target.value)}
                                  >
                                    <option value="">بدون پلن (مدت دلخواه)</option>
                                    {plans.map((plan) => (
                                      <option key={plan.id} value={plan.id}>
                                        {plan.title} — {formatToman(plan.priceToman)}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>

                                <Field
                                  label="مدت (ماه)"
                                  htmlFor={`months-${user.id}`}
                                  className="sm:w-36"
                                >
                                  <Input
                                    id={`months-${user.id}`}
                                    type="number"
                                    min={1}
                                    max={120}
                                    dir="ltr"
                                    className="num"
                                    value={grantMonths}
                                    onChange={(e) => setGrantMonths(e.target.value)}
                                    placeholder={
                                      plans.find((p) => String(p.id) === grantPlanId)
                                        ? String(
                                            plans.find((p) => String(p.id) === grantPlanId)!
                                              .durationMonths,
                                          )
                                        : '1'
                                    }
                                  />
                                </Field>

                                <div className="flex gap-2">
                                  <Button type="button" onClick={() => setGrantOpenFor(null)}>
                                    انصراف
                                  </Button>
                                  <Button type="submit" variant="primary" loading={granting}>
                                    ثبت اشتراک
                                  </Button>
                                </div>
                              </form>
                            )}

                            {grantOpenFor === user.id && (
                              <p className="text-xs text-muted">
                                اگر کاربر اشتراک فعال داشته باشد، مدت جدید به انتهای آن افزوده
                                می‌شود و از همان زمان آغاز خواهد شد.
                              </p>
                            )}

                            {historyLoading === user.id ? (
                              <div className="grid gap-6 lg:grid-cols-2">
                                <div className="space-y-2">
                                  <Skeleton className="h-3 w-24" />
                                  <Skeleton className="h-12 w-full" />
                                  <Skeleton className="h-12 w-full" />
                                </div>
                                <div className="space-y-2">
                                  <Skeleton className="h-3 w-24" />
                                  <Skeleton className="h-12 w-full" />
                                </div>
                              </div>
                            ) : (
                              <div className="grid gap-6 lg:grid-cols-2">
                                <SubscriptionHistory
                                  records={histories[user.id]?.subscriptions ?? []}
                                />
                                <PurchaseHistory records={histories[user.id]?.purchases ?? []} />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted">
            صفحه {toPersianDigits(page)} از {toPersianDigits(lastPage)}
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              قبلی
            </Button>
            <Button size="sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

function HistorySection({
  icon: Icon,
  title,
  count,
  empty,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Icon className="h-3.5 w-3.5 text-faint" />
        {title} ({toPersianDigits(count)})
      </h4>
      {count === 0 ? (
        <p className="rounded-control border border-dashed border-line px-4 py-3 text-xs text-faint">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-control border border-line bg-surface">
          {children}
        </ul>
      )}
    </section>
  );
}

function SubscriptionHistory({ records }: { records: UserSubscriptionRecord[] }) {
  return (
    <HistorySection
      icon={CreditCard}
      title="سوابق اشتراک"
      count={records.length}
      empty="این کاربر تاکنون اشتراکی نداشته است."
    >
      {records.map((sub) => (
        <li key={sub.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-ink">
                {sub.plan ? sub.plan.title : 'اشتراک دستی'}
              </p>
              {sub.isActive && <Badge tone="positive">فعال</Badge>}
            </div>
            <p className="text-xs text-muted">
              {formatJalali(sub.startsAt)} تا {formatJalali(sub.expiresAt)}
            </p>
          </div>
          {sub.plan && (
            <span className="text-xs text-muted">{formatToman(sub.plan.priceToman)}</span>
          )}
        </li>
      ))}
    </HistorySection>
  );
}

function PurchaseHistory({ records }: { records: BookPurchaseRecord[] }) {
  return (
    <HistorySection
      icon={BookOpen}
      title="کتاب‌های خریداری‌شده"
      count={records.length}
      empty="این کاربر تاکنون کتابی نخریده است."
    >
      {records.map((purchase) => (
        <li key={purchase.id} className="flex items-center gap-3 px-4 py-3">
          {purchase.coverImageUrl ? (
            <img
              src={purchase.coverImageUrl}
              alt=""
              className="h-11 w-8 shrink-0 rounded-[5px] border border-line object-cover"
            />
          ) : (
            <span className="flex h-11 w-8 shrink-0 items-center justify-center rounded-[5px] border border-line bg-raised text-faint">
              <BookOpen className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{purchase.bookTitle}</p>
            <p className="text-xs text-muted">{formatJalali(purchase.createdAt)}</p>
          </div>
          {purchase.pointsSpent > 0 ? (
            <Badge tone="accent">
              <Award className="h-3 w-3" />
              {toPersianDigits(purchase.pointsSpent)} امتیاز
            </Badge>
          ) : (
            <Badge tone="caution">{formatToman(purchase.priceToman)}</Badge>
          )}
        </li>
      ))}
    </HistorySection>
  );
}
