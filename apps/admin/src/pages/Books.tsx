import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { Book, Category } from '../services/api';
import { Plus, Trash2, Edit2, ChevronLeft, X, BookOpen, RefreshCw } from 'lucide-react';

export const Books: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [fullDesc, setFullDesc] = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [booksData, catsData] = await Promise.all([
        api.getBooks(),
        api.getCategories(),
      ]);
      setBooks(booksData);
      setCategories(catsData);
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری اطلاعات فهرست');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEditClick = (book: Book) => {
    setEditingBook(book);
    setTitle(book.title);
    setAuthor(book.author);
    setShortDesc(book.short_description);
    setFullDesc(book.full_description);
    setSelectedCategoryIds(book.categories ? book.categories.map(c => c.id) : []);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingBook(null);
    setTitle('');
    setAuthor('');
    setShortDesc('');
    setFullDesc('');
    setSelectedCategoryIds([]);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!title || !author || selectedCategoryIds.length === 0) {
      setError('تکمیل فیلدهای عنوان کتاب، نویسنده و انتخاب حداقل یک دسته‌بندی الزامی است');
      return;
    }

    const payload = {
      title,
      author,
      short_description: shortDesc,
      full_description: fullDesc,
      category_ids: selectedCategoryIds,
    };

    try {
      if (editingBook) {
        await api.updateBook(editingBook.id, payload);
        setSuccess('اطلاعات کتاب با موفقیت به‌روزرسانی شد');
      } else {
        await api.createBook(payload);
        setSuccess('کتاب جدید با موفقیت به فهرست اضافه شد');
      }
      handleCancel();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره‌سازی کتاب');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('آیا از حذف این کتاب اطمینان دارید؟ با حذف کتاب، تمامی فصل‌ها و صفحات زیرمجموعه آن نیز برای همیشه حذف خواهند شد.')) {
      return;
    }
    try {
      await api.deleteBook(id);
      setSuccess('کتاب مورد نظر با موفقیت حذف شد');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف کتاب');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">فهرست کتاب‌ها و داستان‌ها</h2>
          <p className="text-sm text-slate-400 mt-1">تمام کتاب‌ها، فصل‌ها و صفحات سیستم را مدیریت، ویرایش و دسته‌بندی کنید</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-500 hover:text-slate-700 transition"
            title="بارگذاری مجدد"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/15 hover:shadow-indigo-600/25 transition duration-150 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> افزودن کتاب جدید
            </button>
          )}
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

      {/* Form Drawer / Card */}
      {showForm && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md space-y-6 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex justify-between items-center border-b border-slate-50 pb-4">
            <h3 className="text-lg font-bold text-slate-800">
              {editingBook ? 'ویرایش اطلاعات کتاب' : 'ثبت کتاب جدید در فهرست'}
            </h3>
            <button
              onClick={handleCancel}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right">
            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">
                عنوان کتاب
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: تلماسه (Dune)"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            {/* Author */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">
                نویسنده
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="مثال: فرانک هربرت"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            {/* Multi Category Select */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-2">
                دسته‌بندی‌ها (می‌توانید چند مورد انتخاب کنید)
              </label>
              <div className="flex flex-wrap gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3.5 min-h-[50px]">
                {categories.length === 0 ? (
                  <span className="text-xs text-slate-400">ابتدا یک دسته‌بندی در سیستم تعریف کنید</span>
                ) : (
                  categories.map((c) => {
                    const isSelected = selectedCategoryIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedCategoryIds(selectedCategoryIds.filter(id => id !== c.id));
                          } else {
                            setSelectedCategoryIds([...selectedCategoryIds, c.id]);
                          }
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition duration-150 flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span>{c.name}</span>
                        {isSelected && <span className="text-[11px] bg-white/20 rounded-full h-4 w-4 flex items-center justify-center font-black">✓</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Short Description */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-2">
                توضیح کوتاه
              </label>
              <input
                type="text"
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                placeholder="مثال: داستانی حماسی و هیجان‌انگیز در سیاره آراکیز"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            {/* Full Description */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-2">
                توضیحات کامل
              </label>
              <textarea
                value={fullDesc}
                onChange={(e) => setFullDesc(e.target.value)}
                placeholder="خلاصه کامل داستان یا معرفی کتاب را وارد کنید..."
                rows={4}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition resize-none"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 border-t border-slate-50 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-bold transition"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/25 transition duration-150"
              >
                {editingBook ? 'ذخیره تغییرات' : 'ثبت کتاب'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Books Table */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : books.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            هیچ کتابی در سیستم ثبت نشده است. روی «افزودن کتاب جدید» کلیک کنید.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">کتاب</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">نویسنده</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">دسته‌بندی‌ها</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {books.map((book) => (
                  <tr key={book.id} className="hover:bg-slate-50/40 transition group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-lg group-hover:bg-indigo-100 transition-colors shrink-0">
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{book.title}</p>
                          <p className="text-xs text-slate-400 max-w-xs truncate mt-0.5">{book.short_description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-semibold">{book.author}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-xs">
                        {book.categories && book.categories.length > 0 ? (
                          book.categories.map((cat) => (
                            <span
                              key={cat.id}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100"
                            >
                              {cat.name}
                            </span>
                          ))
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">
                            بدون دسته‌بندی
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-left space-x-2 space-x-reverse">
                      <Link
                        to={`/books/${book.id}`}
                        className="inline-flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        title="مدیریت فصل‌ها و صفحات"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleEditClick(book)}
                        className="inline-flex items-center justify-center p-2 text-slate-500 hover:bg-slate-50 rounded-lg transition"
                        title="ویرایش اطلاعات کتاب"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(book.id)}
                        className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="حذف کتاب"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
