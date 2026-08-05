import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatToman, toPersianDigits } from '../services/api';
import type { Book, Category } from '../services/api';
import { Plus, Trash2, Edit2, ChevronLeft, X, BookOpen, RefreshCw, Upload, Loader2, Image as ImageIcon, Lock, Unlock, Sparkles } from 'lucide-react';

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
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [isFree, setIsFree] = useState(true);
  const [priceToman, setPriceToman] = useState('');
  // Points purchasing: the toggle mirrors "points_price > 0" on the server.
  const [pointsEnabled, setPointsEnabled] = useState(false);
  const [pointsPrice, setPointsPrice] = useState('');

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
    setCoverImageUrl(book.cover_image_url || '');
    setSelectedCategoryIds(book.categories ? book.categories.map((c) => c.id) : []);
    setIsFree(book.is_free);
    setPriceToman(book.price_toman ? String(book.price_toman) : '');
    setPointsEnabled(Boolean(book.points_price));
    setPointsPrice(book.points_price ? String(book.points_price) : '');
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
    setCoverImageUrl('');
    setUploadingCover(false);
    setSelectedCategoryIds([]);
    setIsFree(true);
    setPriceToman('');
    setPointsEnabled(false);
    setPointsPrice('');
    setError('');
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setUploadingCover(true);
    try {
      const res = await api.uploadFile(file);
      setCoverImageUrl(res.url);
      setSuccess('تصویر جلد با موفقیت آپلود شد');
    } catch (err: any) {
      setError(err.message || 'خطا در آپلود تصویر جلد');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!title || !author || selectedCategoryIds.length === 0) {
      setError('تکمیل فیلدهای عنوان کتاب، نویسنده و انتخاب حداقل یک دسته‌بندی الزامی است');
      return;
    }

    const price = priceToman === '' ? 0 : Number(priceToman);
    if (!Number.isInteger(price) || price < 0) {
      setError('قیمت باید یک عدد صحیح و نامنفی (به تومان) باشد');
      return;
    }
    if (!isFree && price <= 0) {
      setError('برای کتاب غیررایگان باید قیمتی بزرگ‌تر از صفر تعیین کنید');
      return;
    }

    // A free book is never points-purchasable, so send 0 rather than a leftover value.
    const points = !isFree && pointsEnabled ? Number(pointsPrice === '' ? 0 : pointsPrice) : 0;
    if (!Number.isInteger(points) || points < 0) {
      setError('امتیاز لازم باید یک عدد صحیح و نامنفی باشد');
      return;
    }
    if (!isFree && pointsEnabled && points <= 0) {
      setError('برای خرید با امتیاز باید تعداد امتیاز بزرگ‌تر از صفر تعیین کنید');
      return;
    }

    const payload = {
      title,
      author,
      short_description: shortDesc,
      full_description: fullDesc,
      cover_image_url: coverImageUrl || null,
      category_ids: selectedCategoryIds,
      is_free: isFree,
      price_toman: price,
      points_price: points,
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

            {/* Cover Image Upload Zone */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-2">
                تصویر جلد کتاب (آپلود در MinIO / S3)
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                {coverImageUrl ? (
                  <div className="relative group shrink-0">
                    <img
                      src={coverImageUrl}
                      alt="Cover Preview"
                      className="w-24 h-32 object-cover rounded-xl border border-slate-300 shadow-md"
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImageUrl('')}
                      className="absolute -top-2 -right-2 bg-rose-600 text-white p-1.5 rounded-full shadow hover:bg-rose-700 transition"
                      title="حذف تصویر جلد"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-32 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 bg-white shrink-0">
                    <ImageIcon className="h-6 w-6 mb-1 text-slate-300" />
                    <span className="text-[10px] font-bold">بدون تصویر</span>
                  </div>
                )}

                <div className="flex-1 flex flex-col justify-center gap-2 text-center sm:text-right">
                  <p className="text-xs text-slate-600 font-semibold">
                    برای آپلود تصویر جلد یا تغییر تصویر کنونی، یک فایل عکس انتخاب کنید.
                  </p>
                  <div className="flex items-center gap-3 justify-center sm:justify-start mt-1">
                    <label className="cursor-pointer px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-2">
                      {uploadingCover ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>در حال آپلود...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          <span>انتخاب و آپلود تصویر جلد</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCoverUpload}
                        disabled={uploadingCover}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {coverImageUrl && (
                    <p className="text-[11px] text-slate-400 font-mono truncate max-w-md" dir="ltr">
                      {coverImageUrl}
                    </p>
                  )}
                </div>
              </div>
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
                            setSelectedCategoryIds(selectedCategoryIds.filter((id) => id !== c.id));
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

            {/* Pricing */}
            <div className="md:col-span-2 bg-slate-50/70 border border-slate-100 rounded-2xl p-5 space-y-4">
              <label className="block text-xs font-bold text-slate-500">دسترسی و قیمت</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsFree(true)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition flex items-center gap-2 ${
                    isFree
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-600/20'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Unlock className="h-3.5 w-3.5" /> رایگان
                </button>
                <button
                  type="button"
                  onClick={() => setIsFree(false)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition flex items-center gap-2 ${
                    !isFree
                      ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" /> پولی
                </button>
              </div>

              {!isFree && (
                <div className="animate-[fadeIn_0.2s_ease-out]">
                  <label className="block text-xs font-bold text-slate-500 mb-2">قیمت کتاب (تومان)</label>
                  <input
                    type="number"
                    min={0}
                    value={priceToman}
                    onChange={(e) => setPriceToman(e.target.value)}
                    placeholder="مثال: 250000"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition"
                  />
                  {priceToman !== '' && Number.isFinite(Number(priceToman)) && (
                    <p className="text-xs text-indigo-600 font-bold mt-2">
                      {formatToman(Number(priceToman))}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    کاربران دارای اشتراک فعال بدون پرداخت این مبلغ به کتاب دسترسی دارند. برای رایگان
                    کردن تعدادی از فصل‌ها، به صفحه جزئیات کتاب بروید.
                  </p>

                  {/* Points purchasing — independent of the toman price. */}
                  <div className="mt-5 pt-5 border-t border-slate-200">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pointsEnabled}
                        onChange={(e) => setPointsEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                        خرید با امتیاز کاربران فعال باشد
                      </span>
                    </label>

                    {pointsEnabled && (
                      <div className="mt-3 animate-[fadeIn_0.2s_ease-out]">
                        <label className="block text-xs font-bold text-slate-500 mb-2">
                          امتیاز لازم برای خرید
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={pointsPrice}
                          onChange={(e) => setPointsPrice(e.target.value)}
                          placeholder="مثال: 500"
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition"
                        />
                        {pointsPrice !== '' && Number.isFinite(Number(pointsPrice)) && (
                          <p className="text-xs text-indigo-600 font-bold mt-2">
                            {toPersianDigits(Number(pointsPrice))} امتیاز
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                          کاربر می‌تواند این کتاب را با امتیازهایی که از مطالعه و آزمون‌ها به دست
                          آورده باز کند. امتیاز مصرف‌شده از موجودی قابل خرج او کم می‌شود و دسترسی
                          دائمی خواهد بود.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">کتاب و جلد</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">نویسنده</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">دسته‌بندی‌ها</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">قیمت</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {books.map((book) => (
                  <tr key={book.id} className="hover:bg-slate-50/40 transition group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {book.cover_image_url ? (
                          <img
                            src={book.cover_image_url}
                            alt={book.title}
                            className="w-11 h-14 object-cover rounded-lg border border-slate-200 shadow-sm shrink-0"
                          />
                        ) : (
                          <div className="bg-indigo-50 text-indigo-600 p-3 rounded-xl group-hover:bg-indigo-100 transition-colors shrink-0 flex items-center justify-center w-11 h-14">
                            <BookOpen className="h-5 w-5" />
                          </div>
                        )}
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
                    <td className="px-6 py-4">
                      {book.is_free ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          <Unlock className="h-3 w-3" /> رایگان
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap">
                            <Lock className="h-3 w-3" /> {formatToman(book.price_toman)}
                          </span>
                          {book.points_price > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                              <Sparkles className="h-3 w-3" /> {toPersianDigits(book.points_price)} امتیاز
                            </span>
                          )}
                        </div>
                      )}
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

