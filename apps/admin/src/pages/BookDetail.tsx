import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatToman } from '../services/api';
import type { Book, Chapter } from '../services/api';
import {
  ArrowRight,
  Layers,
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  X,
  BookOpen,
  Layers3,
  Lock,
  Unlock
} from 'lucide-react';

export const BookDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const bookId = Number(id);

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newOrder, setNewOrder] = useState('');
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editOrder, setEditOrder] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadBookData = async () => {
    setLoading(true);
    try {
      const [bookData, chaptersData] = await Promise.all([
        api.getBook(bookId),
        api.getBookChapters(bookId),
      ]);
      setBook(bookData);
      setChapters(chaptersData);
      // Auto-suggest next order number
      const nextOrder = chaptersData.length > 0 
        ? Math.max(...chaptersData.map(c => c.chapter_order)) + 1 
        : 1;
      setNewOrder(nextOrder.toString());
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری اطلاعات کتاب');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookData();
  }, [bookId]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newTitle || !newOrder) {
      setError('تکمیل عنوان فصل و شماره ترتیب الزامی است');
      return;
    }

    try {
      await api.createChapter({
        book_id: bookId,
        title: newTitle,
        chapter_order: Number(newOrder),
      });
      setSuccess('فصل جدید با موفقیت ایجاد شد');
      setNewTitle('');
      setShowAddForm(false);
      await loadBookData();
    } catch (err: any) {
      setError(err.message || 'خطا در ایجاد فصل');
    }
  };

  const handleEditClick = (chapter: Chapter) => {
    setEditingChapter(chapter);
    setEditTitle(chapter.title);
    setEditOrder(chapter.chapter_order.toString());
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChapter) return;
    setError('');
    setSuccess('');

    if (!editTitle || !editOrder) {
      setError('تکمیل عنوان و شماره ترتیب الزامی است');
      return;
    }

    try {
      await api.updateChapter(editingChapter.id, {
        book_id: bookId,
        title: editTitle,
        chapter_order: Number(editOrder),
      });
      setSuccess('فصل با موفقیت به‌روزرسانی شد');
      setEditingChapter(null);
      await loadBookData();
    } catch (err: any) {
      setError(err.message || 'خطا در ویرایش فصل');
    }
  };

  // Free-preview toggle. Only meaningful for a paid book — every chapter of a
  // free book is readable regardless of this flag.
  const handleToggleFree = async (chapter: Chapter) => {
    setError('');
    setSuccess('');
    try {
      await api.updateChapter(chapter.id, { is_free: !chapter.is_free });
      // Update in place so the list doesn't jump while the admin toggles.
      setChapters((prev) =>
        prev.map((c) => (c.id === chapter.id ? { ...c, is_free: !c.is_free } : c))
      );
      setSuccess(
        chapter.is_free
          ? `فصل «${chapter.title}» دیگر رایگان نیست.`
          : `فصل «${chapter.title}» به‌عنوان پیش‌نمایش رایگان تنظیم شد.`
      );
    } catch (err: any) {
      setError(err.message || 'خطا در تغییر وضعیت رایگان بودن فصل');
    }
  };

  const handleDelete = async (chapterId: number) => {
    if (!window.confirm('آیا از حذف این فصل اطمینان دارید؟ تمامی صفحات داخل این فصل نیز برای همیشه حذف خواهند شد.')) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.deleteChapter(chapterId);
      setSuccess('فصل مورد نظر با موفقیت حذف شد');
      await loadBookData();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف فصل');
    }
  };

  if (loading && !book) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100">
        کتاب مورد نظر یافت نشد.
      </div>
    );
  }

  return (
    <div className="space-y-6 text-right">
      {/* Back link */}
      <Link to="/books" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition">
        <ArrowRight className="h-4 w-4" /> بازگشت به فهرست کتاب‌ها
      </Link>

      {/* Book Summary Card */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-start">
        <div className="bg-indigo-50 text-indigo-600 p-5 rounded-2xl shrink-0">
          <BookOpen className="h-10 w-10" />
        </div>
        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {book.categories && book.categories.length > 0 ? (
              book.categories.map((cat) => (
                <span
                  key={cat.id}
                  className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100"
                >
                  {cat.name}
                </span>
              ))
            ) : (
              <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
                بدون دسته‌بندی
              </span>
            )}
            <span className="text-xs text-slate-400 font-medium ml-2">شناسه کتاب: {book.id}</span>
            {book.is_free ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                <Unlock className="h-3 w-3" /> رایگان
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                <Lock className="h-3 w-3" /> {formatToman(book.price_toman)}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">{book.title}</h2>
          <p className="text-sm font-bold text-slate-500">اثر {book.author}</p>
          <div className="border-t border-slate-50 pt-3 mt-3 text-sm text-slate-600 space-y-2">
            <p className="italic text-slate-500">«{book.short_description}»</p>
            <p className="text-xs text-slate-400 leading-relaxed">{book.full_description}</p>
          </div>
        </div>
      </div>

      {/* Notifications */}
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

      {/* Chapters Section Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <Layers className="h-5 w-5 text-indigo-500 shrink-0" /> فصل‌های کتاب ({chapters.length})
        </h3>
        {!showAddForm && !editingChapter && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/25 transition duration-150 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> افزودن فصل جدید
          </button>
        )}
      </div>

      {/* Add Chapter Form */}
      {showAddForm && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md space-y-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex justify-between items-center pb-2 border-b border-slate-50">
            <h4 className="font-bold text-slate-800 text-sm">افزودن فصل جدید به کتاب</h4>
            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleAddSubmit} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 mb-2">عنوان فصل</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="مثال: فصل اول: ورود به آراکیز"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-bold text-slate-500 mb-2">شماره ترتیب</label>
              <input
                type="number"
                value={newOrder}
                onChange={(e) => setNewOrder(e.target.value)}
                placeholder="ترتیب"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/10 transition"
              >
                افزودن
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Chapter Form */}
      {editingChapter && (
        <div className="bg-indigo-50/40 border border-indigo-100 rounded-3xl p-6 shadow-sm space-y-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex justify-between items-center pb-2 border-b border-indigo-100/55">
            <h4 className="font-bold text-indigo-900 text-sm">ویرایش اطلاعات فصل</h4>
            <button onClick={() => setEditingChapter(null)} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleEditSubmit} className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-indigo-700 mb-2">عنوان فصل</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-bold text-indigo-700 mb-2">شماره ترتیب</label>
              <input
                type="number"
                value={editOrder}
                onChange={(e) => setEditOrder(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingChapter(null)}
                className="px-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/10 transition"
              >
                ذخیره
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Chapters list */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        {chapters.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <Layers3 className="h-8 w-8 text-slate-300" />
            <p>هنوز هیچ فصلی برای این کتاب تعریف نشده است. روی «افزودن فصل جدید» کلیک کنید.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {chapters.map((chapter) => (
              <div 
                key={chapter.id} 
                className="px-6 py-4 hover:bg-slate-50/50 flex justify-between items-center group transition duration-150"
              >
                <div className="flex items-center gap-4">
                  <span className="h-9 w-9 bg-slate-100 text-slate-600 font-mono text-sm font-bold rounded-xl flex items-center justify-center border border-slate-200/50 shadow-inner shrink-0">
                    {chapter.chapter_order}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-800 text-sm">{chapter.title}</h4>
                      {!book.is_free && chapter.is_free && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          <Unlock className="h-2.5 w-2.5" /> پیش‌نمایش رایگان
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">شناسه فصل: {chapter.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!book.is_free && (
                    <button
                      onClick={() => handleToggleFree(chapter)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border ${
                        chapter.is_free
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                      title={
                        chapter.is_free
                          ? 'این فصل رایگان است — برای قفل کردن کلیک کنید'
                          : 'این فصل قفل است — برای رایگان کردن کلیک کنید'
                      }
                    >
                      {chapter.is_free ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      <span>{chapter.is_free ? 'رایگان' : 'قفل'}</span>
                    </button>
                  )}
                  <Link
                    to={`/books/${bookId}/chapters/${chapter.id}`}
                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                  >
                    <span>مدیریت صفحات</span>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={() => handleEditClick(chapter)}
                    className="p-2 text-slate-500 hover:bg-slate-50 rounded-xl transition"
                    title="ویرایش عنوان یا ترتیب فصل"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(chapter.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition"
                    title="حذف فصل"
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
