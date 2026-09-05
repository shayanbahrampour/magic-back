import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import type { Book, Chapter, Page } from '../services/api';
import {
  ArrowRight,
  FileText,
  Plus,
  Trash2,
  Edit2,
  Upload,
  Loader2,
  Maximize2,
  X,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { RichTextEditor } from '../components/RichTextEditor';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  IconButton,
  Input,
  Notice,
  Panel,
  PanelHeader,
  Skeleton,
  SkeletonRows,
} from '../components/ui';

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
  const [isFullPage, setIsFullPage] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitIntent = useRef<'close' | 'next'>('close');

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
      const nextPage =
        pagesData.length > 0 ? Math.max(...pagesData.map((p) => p.page_number)) + 1 : 1;
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

  const handleAddImageUrl = () => {
    const url = currentImageUrl.trim();
    if (!url) return;
    if (!imageUrls.includes(url)) {
      setImageUrls([...imageUrls, url]);
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
      const combined = [...imageUrls, ...newUrls].filter(
        (item, index, self) => self.indexOf(item) === index,
      );
      setImageUrls(combined);
      setSuccess(`${newUrls.length} تصویر آپلود شد`);
    } catch (err: any) {
      setError(err.message || 'خطا در آپلود تصاویر به سرور');
    } finally {
      setUploadingImages(false);
      e.target.value = ''; // Reset input
    }
  };

  const handleRemoveImageUrl = (urlToRemove: string) => {
    setImageUrls(imageUrls.filter((url) => url !== urlToRemove));
  };

  const handleEditClick = (page: Page) => {
    setEditingPage(page);
    setPageNumber(page.page_number.toString());
    setTextContent(page.text_content || '');
    setImageUrls(page.image_urls);
    setIsFullPage(Boolean(page.is_full_page));
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingPage(null);
    setTextContent('');
    setImageUrls([]);
    setCurrentImageUrl('');
    setIsFullPage(false);
    setUploadingImages(false);
    setError('');
    const nextPage = pages.length > 0 ? Math.max(...pages.map((p) => p.page_number)) + 1 : 1;
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
      is_full_page: isFullPage,
    };

    setSaving(true);
    try {
      if (editingPage) {
        const updated = await api.updatePage(editingPage.id, payload);
        setPages((current) =>
          current
            .map((page) => (page.id === updated.id ? updated : page))
            .sort((a, b) => a.page_number - b.page_number),
        );
        setSuccess('صفحه به‌روزرسانی شد');
        const currentIndex = pages.findIndex((page) => page.id === editingPage.id);
        const nextPage = pages[currentIndex + 1];
        if (submitIntent.current === 'next' && nextPage) {
          handleEditClick(nextPage);
        } else {
          handleCancel();
        }
      } else {
        const created = await api.createPage(payload);
        setPages((current) => [...current, created].sort((a, b) => a.page_number - b.page_number));
        setSuccess('صفحه جدید اضافه شد');
        handleCancel();
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره‌سازی صفحه');
    } finally {
      setSaving(false);
    }
  };

  const editingIndex = editingPage
    ? pages.findIndex((page) => page.id === editingPage.id)
    : -1;

  const moveToPage = (offset: number) => {
    const target = pages[editingIndex + offset];
    if (target) handleEditClick(target);
  };

  const pageForm = (
    <form onSubmit={handleSubmit} className="space-y-5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="شماره صفحه" htmlFor="page-number" className="max-w-[8rem]">
          <Input id="page-number" type="number" dir="ltr" className="num" value={pageNumber} onChange={(e) => setPageNumber(e.target.value)} />
        </Field>
        {editingPage && (
          <div className="flex gap-1" aria-label="جابجایی بین صفحات">
            <IconButton label="صفحه قبلی" onClick={() => moveToPage(-1)} disabled={editingIndex <= 0}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
            <IconButton label="صفحه بعدی" onClick={() => moveToPage(1)} disabled={editingIndex >= pages.length - 1}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
          </div>
        )}
      </div>

      <Field label="متن داستان">
        <RichTextEditor value={textContent} onChange={setTextContent} placeholder="متن این صفحه را بنویسید…" />
      </Field>

      <details className="rounded-control border border-line bg-raised/40">
        <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-muted">
          تصاویر صفحه <span className="num">({imageUrls.length})</span> و تنظیم نمایش
        </summary>
        <div className="space-y-3 border-t border-line-soft p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-sm font-semibold text-ink hover:bg-raised">
              {uploadingImages ? <><Loader2 className="h-4 w-4 animate-spin" />در حال آپلود…</> : <><Upload className="h-4 w-4" />آپلود تصویر</>}
              <input type="file" accept="image/*" multiple onChange={handleUploadImages} disabled={uploadingImages} className="hidden" />
            </label>
            <div className="flex min-w-[16rem] flex-1 gap-2">
              <Input type="url" dir="ltr" value={currentImageUrl} onChange={(e) => setCurrentImageUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddImageUrl(); } }} placeholder="https://example.com/image.jpg" className="num text-xs" />
              <Button type="button" onClick={handleAddImageUrl}>افزودن</Button>
            </div>
          </div>
          {imageUrls.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {imageUrls.map((url, idx) => (
                <div key={url} className="group relative overflow-hidden rounded-control border border-line bg-raised">
                  <img src={url} alt={`تصویر ${idx + 1}`} className="h-24 w-full object-cover" />
                  <button type="button" onClick={() => handleRemoveImageUrl(url)} aria-label="حذف این تصویر" className="absolute top-1.5 end-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface/95 text-critical"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <Checkbox checked={isFullPage} onChange={setIsFullPage} label="نمایش تمام‌صفحه" hint="تصویر در اپلیکیشن کلاینت تمام عرض و ارتفاع صفحه را می‌گیرد." />
        </div>
      </details>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
        <Button type="button" onClick={handleCancel}>انصراف</Button>
        {editingPage && editingIndex < pages.length - 1 && (
          <Button type="submit" onClick={() => { submitIntent.current = 'next'; }} loading={saving}>ذخیره و صفحه بعد</Button>
        )}
        <Button type="submit" variant="primary" onClick={() => { submitIntent.current = 'close'; }} loading={saving}>
          {editingPage ? 'ذخیره تغییرات' : 'ثبت صفحه'}
        </Button>
      </div>
    </form>
  );

  const handleDelete = async (pageId: number) => {
    if (!window.confirm('آیا از حذف این صفحه اطمینان دارید؟')) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.deletePage(pageId);
      setSuccess('صفحه حذف شد');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف صفحه');
    }
  };

  if (loading && !chapter) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-40" />
        <Panel className="p-5">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-3 h-4 w-32" />
        </Panel>
        <Panel className="overflow-hidden">
          <SkeletonRows rows={3} />
        </Panel>
      </div>
    );
  }

  if (!book || !chapter) {
    return <Notice tone="critical">اطلاعات کتاب یا فصل مورد نظر یافت نشد.</Notice>;
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/books/${bId}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors duration-150 hover:text-ink"
      >
        <ArrowRight className="h-4 w-4" />
        فصل‌های «{book.title}»
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">
            فصل <span className="num">{chapter.chapter_order}</span>
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-ink">{chapter.title}</h2>
          <p className="mt-1 text-sm text-muted">
            <span className="num">{pages.length}</span> صفحه ثبت شده
          </p>
        </div>
        {!showForm && (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            صفحه جدید
          </Button>
        )}
      </div>

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

      {showForm && !editingPage && (
        <Panel className="animate-rise overflow-hidden">
          <PanelHeader title="صفحه جدید" onClose={handleCancel} />
          {pageForm}
        </Panel>
      )}

      {pages.length === 0 ? (
        <Panel>
          <EmptyState
            icon={FileText}
            title="این فصل هنوز صفحه‌ای ندارد"
            hint="هر صفحه می‌تواند متن، تصویر یا هر دو را داشته باشد."
            action={
              !showForm && (
                <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4" />
                  صفحه جدید
                </Button>
              )
            }
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {pages.map((page) => (
            <Panel
              key={page.id}
              className={editingPage?.id === page.id ? 'overflow-hidden border-accent-line' : 'overflow-hidden'}
            >
              <div
                className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-raised/50"
                role="button"
                tabIndex={0}
                onClick={() => handleEditClick(page)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleEditClick(page);
                  }
                }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="num flex h-8 w-8 items-center justify-center rounded-control border border-line bg-raised text-sm font-semibold text-muted">
                    {page.page_number}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {page.text_content
                        ? page.text_content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
                        : 'بدون متن — این صفحه فقط تصویر دارد.'}
                    </p>
                    <p className="text-xs text-faint">
                      <span className="num">#{page.id}</span>
                      {' · '}
                      <span className="num">{page.image_urls.length}</span> تصویر
                    </p>
                  </div>
                  {page.is_full_page && (
                    <Badge tone="accent">
                      <Maximize2 className="h-3 w-3" /> تمام‌صفحه
                    </Badge>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                  <Button size="sm" onClick={() => handleEditClick(page)}>
                    <Edit2 className="h-4 w-4" />
                    ویرایش متن
                  </Button>
                  <IconButton
                    label="حذف صفحه"
                    tone="danger"
                    onClick={() => handleDelete(page.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
              {editingPage?.id === page.id && (
                <div className="animate-rise border-t border-line-soft">{pageForm}</div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
};
