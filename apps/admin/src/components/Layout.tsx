import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Tag,
  BookOpen,
  BookMarked,
  CreditCard,
  Users,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { cx, IconButton } from './ui';

interface LayoutProps {
  children: React.ReactNode;
  onLogout?: () => void;
}

const MENU = [
  { path: '/', label: 'داشبورد', icon: LayoutDashboard },
  { path: '/categories', label: 'دسته‌بندی‌ها', icon: Tag },
  { path: '/books', label: 'کتاب‌ها', icon: BookOpen },
  { path: '/users', label: 'کاربران', icon: Users },
  { path: '/subscriptions', label: 'اشتراک‌ها', icon: CreditCard },
];

export const Layout: React.FC<LayoutProps> = ({ children, onLogout }) => {
  const location = useLocation();
  const adminPhone = localStorage.getItem('admin_phone') || '09*********';
  const [navOpen, setNavOpen] = useState(false);

  // The drawer is a small-screen affordance only; navigating dismisses it.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  const nav = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-line-soft px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent text-white">
          <BookMarked className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-ink">مجیک‌بوک</p>
          <p className="text-xs leading-tight text-faint">پنل مدیریت محتوا</p>
        </div>
        <IconButton
          label="بستن منو"
          onClick={() => setNavOpen(false)}
          className="ms-auto lg:hidden"
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {MENU.map((item) => {
            const Icon = item.icon;
            const active =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));

            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium',
                    'transition-colors duration-150 ease-out-quart',
                    active
                      ? 'bg-accent-soft font-semibold text-accent-strong'
                      : 'text-muted hover:bg-raised hover:text-ink',
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-3 border-t border-line-soft p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold text-muted">
          مد
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">مدیر سیستم</p>
          <p className="num truncate text-xs text-faint" dir="ltr">
            {adminPhone}
          </p>
        </div>
        {onLogout && (
          <IconButton label="خروج از حساب" tone="danger" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
          </IconButton>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-ink">
      {/* Persistent from lg up, drawer below it. */}
      <aside className="hidden w-60 shrink-0 flex-col border-e border-line bg-surface lg:flex">
        {nav}
      </aside>

      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="بستن منو"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-ink/25"
          />
          <aside className="animate-rise absolute inset-y-0 end-0 flex w-60 flex-col border-s border-line bg-surface">
            {nav}
          </aside>
        </div>
      )}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <IconButton label="باز کردن منو" onClick={() => setNavOpen(true)}>
            <Menu className="h-5 w-5" />
          </IconButton>
          <span className="text-sm font-bold text-ink">مجیک‌بوک</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] px-6 py-8 lg:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
};
