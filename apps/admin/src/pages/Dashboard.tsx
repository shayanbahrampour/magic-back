import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Tag, BookOpen, Layers, FileText, ChevronLeft, CreditCard } from 'lucide-react';
import { Notice, PageHeader, Panel, Skeleton } from '../components/ui';

interface Stats {
  categories: number;
  books: number;
  chapters: number;
  pages: number;
}

const SHORTCUTS = [
  {
    to: '/books',
    icon: BookOpen,
    title: 'کتاب‌ها، فصل‌ها و صفحات',
    hint: 'افزودن کتاب، تقسیم آن به فصل و نوشتن متن صفحات',
  },
  {
    to: '/categories',
    icon: Tag,
    title: 'دسته‌بندی‌ها',
    hint: 'سازماندهی کتاب‌ها برای فیلتر شدن در اپلیکیشن',
  },
  {
    to: '/subscriptions',
    icon: CreditCard,
    title: 'پلن‌های اشتراک',
    hint: 'تعریف مدت و قیمت اشتراک‌های فعال',
  },
];

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  // Without this the tiles would sit on their loading skeletons forever when
  // the request fails, which reads as "still working" rather than "broken".
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    async function loadStats() {
      try {
        const [cats, books, chaps, pages] = await Promise.all([
          api.getCategories(),
          api.getBooks(),
          api.getChapters(),
          api.getPages(),
        ]);
        setStats({
          categories: cats.length,
          books: books.length,
          chapters: chaps.length,
          pages: pages.length,
        });
      } catch (err: any) {
        setError(err.message || 'خطا در بارگذاری آمار سیستم');
        setFailed(true);
      }
    }
    loadStats();
  }, []);

  const cells = [
    { label: 'دسته‌بندی', value: stats?.categories, icon: Tag, to: '/categories' },
    { label: 'کتاب', value: stats?.books, icon: BookOpen, to: '/books' },
    { label: 'فصل', value: stats?.chapters, icon: Layers, to: '/books' },
    { label: 'صفحه', value: stats?.pages, icon: FileText, to: '/books' },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="داشبورد"
        description="نمای کلی محتوای کتابخانه و میان‌برهای مدیریت."
      />

      {error && <Notice tone="critical">{error}</Notice>}

      {/* One panel split into cells. The gap-px trick draws the dividers, so
          they stay correct at every wrap point without RTL-specific borders. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
        {cells.map((cell) => {
          const Icon = cell.icon;
          return (
            <Link
              key={cell.label}
              to={cell.to}
              className="group bg-surface p-5 transition-colors duration-150 ease-out-quart hover:bg-raised/60"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-muted">
                <Icon className="h-3.5 w-3.5 text-faint" />
                {cell.label}
              </span>
              {cell.value === undefined && !failed ? (
                <Skeleton className="mt-3 h-8 w-14" />
              ) : (
                <span className="num mt-2 block text-[2rem] font-semibold leading-tight text-ink">
                  {cell.value ?? '—'}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <section className="space-y-3">
        <h3 className="text-[0.9375rem] font-bold text-ink">میان‌برها</h3>
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {SHORTCUTS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 ease-out-quart hover:bg-raised/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-raised text-muted transition-colors duration-150 group-hover:bg-accent-soft group-hover:text-accent">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{item.title}</span>
                      <span className="block text-xs text-muted">{item.hint}</span>
                    </span>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-faint transition-transform duration-150 ease-out-quart group-hover:-translate-x-0.5 group-hover:text-accent" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>
    </div>
  );
};
