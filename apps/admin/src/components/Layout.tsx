import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Tag, 
  BookOpen, 
  BookMarked,
  Sparkles,
  LogOut
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  onLogout?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, onLogout }) => {
  const location = useLocation();
  const adminPhone = localStorage.getItem('admin_phone') || '09*********';

  const menuItems = [
    { path: '/', label: 'داشبورد مدیریت', icon: LayoutDashboard },
    { path: '/categories', label: 'دسته‌بندی‌ها', icon: Tag },
    { path: '/books', label: 'فهرست کتاب‌ها', icon: BookOpen },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-800 font-['Vazirmatn']">
      {/* Sidebar (Sits on right side in RTL mode) */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col shadow-xl border-l border-slate-800">
        {/* Brand */}
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="bg-indigo-500 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-500/20">
            <BookMarked className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg leading-none text-white tracking-tight">
              مجیک‌بوک
            </h1>
            <span className="text-xs text-slate-400 font-medium">پنل مدیریت محتوا</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = 
              location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-inner text-sm shrink-0">
              مدیر
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-200 truncate">مدیر ارشد سیستم</p>
              <p className="text-xs text-slate-400 font-mono truncate" dir="ltr">{adminPhone}</p>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              title="خروج از حساب مدیریت"
              className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 shadow-sm z-10">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
            <span className="text-sm font-bold text-slate-600">
              به سیستم مدیریت کتاب و داستان‌های تعاملی خوش آمدید
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="px-3.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200 flex items-center gap-1.5 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
              نشست فعال
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50">
          <div className="max-w-6xl mx-auto space-y-6 animate-[fadeIn_0.3s_ease-out]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
