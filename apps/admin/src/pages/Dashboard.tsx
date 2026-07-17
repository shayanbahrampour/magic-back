import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { 
  Tag, 
  BookOpen, 
  Layers, 
  FileText, 
  ArrowLeft,
  TrendingUp
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    categories: 0,
    books: 0,
    chapters: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState(true);

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
      } catch (error) {
        console.error('Failed to load stats', error);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const statCards = [
    { label: 'تعداد دسته‌بندی‌ها', value: stats.categories, icon: Tag, color: 'bg-emerald-500', link: '/categories' },
    { label: 'کتاب‌های موجود', value: stats.books, icon: BookOpen, color: 'bg-indigo-500', link: '/books' },
    { label: 'مجموع فصل‌ها', value: stats.chapters, icon: Layers, color: 'bg-sky-500', link: '/books' },
    { label: 'صفحات ثبت‌شده', value: stats.pages, icon: FileText, color: 'bg-purple-500', link: '/books' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-l from-indigo-600 via-indigo-700 to-purple-800 text-white rounded-3xl p-8 shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-3.5">
          <span className="bg-indigo-500/30 text-indigo-200 px-3.5 py-1 rounded-full text-xs font-bold tracking-wide border border-indigo-400/20 inline-block">
            خلاصه آماری سیستم
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight">سامانه جامع مدیریت کتابخانه مجیک‌بوک</h2>
          <p className="text-indigo-100/90 text-sm leading-relaxed font-medium">
            دسته‌بندی‌های کتاب را مدیریت کنید، کتاب‌های جدید اضافه کنید، آن‌ها را به فصل‌های مختلف تقسیم کنید و صفحات را با متن داستان و تصاویر جذاب غنی کنید.
          </p>
        </div>
        <div className="absolute left-0 bottom-0 top-0 w-1/3 bg-[radial-gradient(circle_at_bottom_left,var(--color-indigo-500),transparent)] opacity-40 hidden md:block"></div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <Link
              key={idx}
              to={card.link}
              className="bg-white p-6 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group flex items-center justify-between"
            >
              <div className="space-y-2">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">
                  {card.label}
                </span>
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">
                  {card.value}
                </h3>
              </div>
              <div className={`${card.color} text-white p-4 rounded-2xl shadow-lg transition-transform group-hover:scale-110 duration-300`}>
                <Icon className="h-6 w-6" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm space-y-6">
        <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-500" /> دسترسی سریع و عملیات کاربردی
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/books"
            className="flex items-center justify-between p-5 border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/20 rounded-2xl group transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="bg-indigo-50 text-indigo-600 p-3.5 rounded-xl group-hover:bg-indigo-100 transition-colors">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">مدیریت کتاب‌ها و داستان‌ها</p>
                <p className="text-xs text-slate-400 mt-0.5">افزودن و ویرایش کتاب‌ها، فصل‌ها و صفحات</p>
              </div>
            </div>
            <ArrowLeft className="h-5 w-5 text-slate-300 group-hover:text-indigo-600 group-hover:-translate-x-1.5 transition-all" />
          </Link>

          <Link
            to="/categories"
            className="flex items-center justify-between p-5 border border-slate-100 hover:border-emerald-100 hover:bg-emerald-50/20 rounded-2xl group transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-xl group-hover:bg-emerald-100 transition-colors">
                <Tag className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">مدیریت دسته‌بندی‌ها</p>
                <p className="text-xs text-slate-400 mt-0.5">دسته‌بندی کتاب‌ها و فیلتر کردن فهرست</p>
              </div>
            </div>
            <ArrowLeft className="h-5 w-5 text-slate-300 group-hover:text-emerald-600 group-hover:-translate-x-1.5 transition-all" />
          </Link>
        </div>
      </div>
    </div>
  );
};
