import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import type { Book, Chapter, Page } from '../services/api';
import { 
  ArrowRight, 
  FileText, 
  Plus, 
  Trash2, 
  Edit2, 
  X, 
  Image as ImageIcon, 
  Eye, 
  AlertCircle,
  Upload,
  Loader2
} from 'lucide-react';

export const ChapterDetail: React.FC = () => {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>();
  const bId = Number(bookId);
  const cId = Number(chapterId);

  const [book, setBook] = useState<Book | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [pageNumber, setPageNumber] = useState('');
  const [textContent, setTextContent] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [currentImageUrl, setCurrentImageUrl] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [bookData, chapterData, pagesData] = await Promise.all([
        api.getBook(bId),
        api.getChapter(cId),
        api.getChapterPages(cId),
      ]);
      setBook(bookData);
      setChapter(chapterData);
      setPages(pagesData);
      
      // Auto-suggest next page number
      const nextPage = pagesData.length > 0 
        ? Math.max(...pagesData.map(p => p.page_number)) + 1 
        : 1;
      setPageNumber(nextPage.toString());
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری اطلاعات صفحات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [bId, cId]);

  const handleAddImageUrl = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!currentImageUrl.trim()) return;
    if (!imageUrls.includes(currentImageUrl.trim())) {
      setImageUrls([...imageUrls, currentImageUrl.trim()]);
    }
    setCurrentImageUrl('');
  };

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError('');
    setUploadingImages(true);
    try {
      const res = await api.uploadFiles(Array.from(files));
      // res.urls contains all uploaded urls
      const newUrls = res.urls ? res.urls : [res.url];
      const combined = [...imageUrls, ...newUrls].filter((item, index, self) => self.indexOf(item) === index);
      setImageUrls(combined);
      setSuccess(`${newUrls.length} تصویر با موفقیت در MinIO / S3 آپلود شد`);
    } catch (err: any) {
      setError(err.message || 'خطا در آپلود تصاویر به سرور');
    } finally {
      setUploadingImages(false);
      e.target.value = ''; // Reset input
    }
  };

  const handleRemoveImageUrl = (urlToRemove: string) => {
    setImageUrls(imageUrls.filter(url => url !== urlToRemove));
  };

  const handleEditClick = (page: Page) => {
    setEditingPage(page);
    setPageNumber(page.page_number.toString());
    setTextContent(page.text_content || '');
    setImageUrls(page.image_urls);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingPage(null);
    setTextContent('');
    setImageUrls([]);
    setCurrentImageUrl('');
    setUploadingImages(false);
    setError('');
    const nextPage = pages.length > 0 
      ? Math.max(...pages.map(p => p.page_number)) + 1 
      : 1;
    setPageNumber(nextPage.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!pageNumber) {
      setError('شماره صفحه الزامی است');
      return;
    }

    const payload = {
      chapter_id: cId,
      page_number: Number(pageNumber),
      text_content: textContent.trim() || null,
      image_urls: imageUrls,
    };

    try {
      if (editingPage) {
        await api.updatePage(editingPage.id, payload);
        setSuccess('صفحه با موفقیت به‌روزرسانی شد');
      } else {
        await api.createPage(payload);
        setSuccess('صفحه جدید با موفقیت اضافه شد');
      }
      handleCancel();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره‌سازی صفحه');
    }
  };

  const handleDelete = async (pageId: number) => {
    if (!window.confirm('آیا از حذف این صفحه اطمینان دارید؟')) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.deletePage(pageId);
      setSuccess('صفحه با موفقیت حذف شد');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف صفحه');
    }
  };

  if (loading && !chapter) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!book || !chapter) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100">
        اطلاعات کتاب یا فصل مورد نظر یافت نشد.
      </div>
    );
  }

  return (
    <div className="space-y-6 text-right">
      {/* Back link */}
      <Link to={`/books/${bId}`} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition">
        <ArrowRight className="h-4 w-4" /> بازگشت به فصل‌های کتاب
      </Link>

      {/* Title Header Card */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-purple-50 text-purple-600 p-3 rounded-2xl shrink-0">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-indigo-600 font-bold uppercase tracking-wider block">
              {book.title}
            </span>
            <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">
              {chapter.title}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full border border-slate-200/50">
            شماره ترتیب فصل: {chapter.chapter_order}
          </span>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/15 hover:shadow-indigo-600/25 transition duration-150 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> افزودن صفحه جدید
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

      {/* Create / Edit Page Form */}
      {showForm && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-md space-y-6 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex justify-between items-center border-b border-slate-50 pb-4">
            <h3 className="text-lg font-bold text-slate-800">
              {editingPage ? `ویرایش صفحه شماره ${editingPage.page_number}` : 'افزودن صفحه جدید به این فصل'}
            </h3>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Page Number */}
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  شماره صفحه
                </label>
                <input
                  type="number"
                  value={pageNumber}
                  onChange={(e) => setPageNumber(e.target.value)}
                  placeholder="مثال: 1"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              {/* Image Upload & URL Section */}
              <div className="md:col-span-3 space-y-3">
                <label className="block text-xs font-bold text-slate-500">
                  تصاویر صفحه (آپلود مستقیم در MinIO / S3 یا افزودن دستی لینک)
                </label>
                
                {/* Upload Button Zone */}
                <div className="flex flex-wrap items-center gap-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                  <label className="cursor-pointer px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-2 shrink-0">
                    {uploadingImages ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>در حال آپلود در MinIO / S3...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        <span>انتخاب و آپلود تصاویر (تکی یا گروهی)</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleUploadImages}
                      disabled={uploadingImages}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs text-slate-500">
                    یا می‌توانید آدرس تصویر را به‌صورت دستی در کادر زیر وارد کنید:
                  </span>
                </div>

                {/* Manual Link Input */}
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={currentImageUrl}
                    onChange={(e) => setCurrentImageUrl(e.target.value)}
                    placeholder="لینک تصویر خارجی، مثلا: https://example.com/image.jpg"
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold transition shrink-0"
                  >
                    افزودن لینک
                  </button>
                </div>
              </div>
            </div>

            {/* List of Image URL Cards/Badges */}
            {imageUrls.length > 0 && (
              <div className="space-y-3 p-4 bg-slate-50/70 border border-slate-200 rounded-2xl">
                <span className="block text-xs font-bold text-slate-600">
                  تصاویر متصل‌شده به این صفحه ({imageUrls.length}) - برای حذف روی ضربدر کلیک کنید:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {imageUrls.map((url, idx) => (
                    <div 
                      key={idx} 
                      className="relative group bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col"
                    >
                      <div className="h-28 bg-slate-100 overflow-hidden relative">
                        <img
                          src={url}
                          alt={`Preview ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <button 
                          type="button" 
                          onClick={() => handleRemoveImageUrl(url)}
                          className="absolute top-1.5 right-1.5 bg-rose-600 text-white hover:bg-rose-700 rounded-full p-1.5 shadow transition"
                          title="حذف این تصویر"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="p-2 text-[10px] font-mono text-slate-500 truncate bg-white" dir="ltr">
                        {url}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Text Content */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">
                متن داستان
              </label>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="متن داستان مربوط به این صفحه را بنویسید..."
                rows={6}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition resize-none leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-50 pt-4">
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
                {editingPage ? 'ذخیره تغییرات' : 'ثبت صفحه'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pages list layout */}
      <div className="space-y-4">
        {pages.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <AlertCircle className="h-8 w-8 text-slate-300 animate-bounce" />
            <p>هنوز هیچ صفحه‌ای برای این فصل ثبت نشده است. روی «افزودن صفحه جدید» کلیک کنید.</p>
          </div>
        ) : (
          pages.map((page) => (
            <div 
              key={page.id} 
              className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-4"
            >
              {/* Page Card Header */}
              <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 bg-indigo-50 text-indigo-600 font-bold rounded-xl flex items-center justify-center text-sm shadow-sm shrink-0">
                    {page.page_number}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">شناسه صفحه: {page.id}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditClick(page)}
                    className="inline-flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    title="ویرایش صفحه"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(page.id)}
                    className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="حذف صفحه"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Page Contents Details */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Text Content */}
                <div className="lg:col-span-2 space-y-2">
                  <span className="block text-xs font-bold text-slate-500">متن داستان</span>
                  {page.text_content ? (
                    <p className="text-sm text-slate-700 leading-relaxed font-normal bg-slate-50/50 p-4 rounded-2xl border border-slate-100 whitespace-pre-wrap">
                      {page.text_content}
                    </p>
                  ) : (
                    <p className="text-xs italic text-slate-400">بدون متن (این صفحه فقط حاوی تصویرسازی است).</p>
                  )}
                </div>

                {/* Illustrations Preview */}
                <div className="space-y-2">
                  <span className="block text-xs font-bold text-slate-500 flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 shrink-0" /> تصاویر متصل ({page.image_urls.length})
                  </span>
                  {page.image_urls.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {page.image_urls.map((url, idx) => (
                        <div key={idx} className="relative group/img rounded-xl overflow-hidden border border-slate-100 aspect-video bg-slate-50">
                          <img 
                            src={url} 
                            alt={`تصویر شماره ${idx + 1}`}
                            className="object-cover w-full h-full hover:scale-110 transition duration-300"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <a 
                            href={url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition duration-200 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-400">بدون تصویر (این صفحه فقط حاوی متن است).</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
