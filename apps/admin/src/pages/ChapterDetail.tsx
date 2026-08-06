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
  Image as ImageIcon,
  Eye,
  Upload,
  Loader2,
  Maximize2,
  X,
} from 'lucide-react';
import { RichTextEditor, RichTextDisplay } from '../components/RichTextEditor';
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        await api.updatePage(editingPage.id, payload);
        setSuccess('صفحه به‌روزرسانی شد');
      } else {
        await api.createPage(payload);
        setSuccess('صفحه جدید اضافه شد');
      }
      handleCancel();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره‌سازی صفحه');
    } finally {
      setSaving(false);
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

      {showForm && (
        <Panel className="animate-rise overflow-hidden">
          <PanelHeader
            title={editingPage ? `ویرایش صفحه ${editingPage.page_number}` : 'صفحه جدید'}
            onClose={handleCancel}
          />

          <form onSubmit={handleSubmit} className="space-y-6 p-5">
            <Field label="شماره صفحه" htmlFor="page-number" className="max-w-[8rem]">
              <Input
                id="page-number"
                type="number"
                dir="ltr"
                className="num"
                value={pageNumber}
                onChange={(e) => setPageNumber(e.target.value)}
              />
            </Field>

            {/* Illustrations */}
            <Field
              label="تصاویر صفحه"
              hint="فایل‌ها در فضای ذخیره‌سازی S3 آپلود می‌شوند. آدرس تصویر خارجی را هم می‌توانید دستی اضافه کنید."
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition-colors duration-150 ease-out-quart hover:bg-raised">
                    {uploadingImages ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        در حال آپلود…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        آپلود تصویر
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

                  <div className="flex min-w-[16rem] flex-1 gap-2">
                    <Input
                      type="url"
                      dir="ltr"
                      value={currentImageUrl}
                      onChange={(e) => setCurrentImageUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddImageUrl();
                        }
                      }}
                      placeholder="https://example.com/image.jpg"
                      className="num text-xs"
                    />
                    <Button type="button" onClick={handleAddImageUrl}>
                      افزودن
                    </Button>
                  </div>
                </div>

                {imageUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {imageUrls.map((url, idx) => (
                      <div
                        key={idx}
                        className="group relative overflow-hidden rounded-control border border-line bg-raised"
                      >
                        <img
                          src={url}
                          alt={`تصویر ${idx + 1}`}
                          className="h-24 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImageUrl(url)}
                          aria-label="حذف این تصویر"
                          title="حذف این تصویر"
                          className="absolute top-1.5 end-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface/95 text-critical opacity-0 transition-opacity duration-150 ease-out-quart group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <p
                          className="num truncate border-t border-line bg-surface px-2 py-1 text-[0.625rem] text-faint"
                          dir="ltr"
                        >
                          {url}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-control border border-line bg-raised/50 p-3.5">
                  <Checkbox
                    checked={isFullPage}
                    onChange={setIsFullPage}
                    label="نمایش تمام‌صفحه"
                    hint="تصویر این صفحه در اپلیکیشن کلاینت تمام عرض و ارتفاع صفحه را می‌گیرد."
                  />
                </div>
              </div>
            </Field>

            <Field label="متن داستان">
              <RichTextEditor
                value={textContent}
                onChange={setTextContent}
                placeholder="متن این صفحه را بنویسید…"
              />
            </Field>

            <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
              <Button type="button" onClick={handleCancel}>
                انصراف
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {editingPage ? 'ذخیره تغییرات' : 'ثبت صفحه'}
              </Button>
            </div>
          </form>
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
            <Panel key={page.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="num flex h-8 w-8 items-center justify-center rounded-control border border-line bg-raised text-sm font-semibold text-muted">
                    {page.page_number}
                  </span>
                  <span className="num text-xs text-faint">#{page.id}</span>
                  {page.is_full_page && (
                    <Badge tone="accent">
                      <Maximize2 className="h-3 w-3" /> تمام‌صفحه
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <IconButton label="ویرایش صفحه" onClick={() => handleEditClick(page)}>
                    <Edit2 className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="حذف صفحه"
                    tone="danger"
                    onClick={() => handleDelete(page.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              <div className="grid gap-6 p-5 lg:grid-cols-3">
                <div className="min-w-0 space-y-2 lg:col-span-2">
                  <p className="text-xs font-semibold text-muted">متن</p>
                  {page.text_content ? (
                    <RichTextDisplay content={page.text_content} />
                  ) : (
                    <p className="text-xs text-faint">بدون متن — این صفحه فقط تصویر دارد.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <ImageIcon className="h-3.5 w-3.5" />
                    تصاویر <span className="num">({page.image_urls.length})</span>
                  </p>
                  {page.image_urls.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {page.image_urls.map((url, idx) => (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative block aspect-video overflow-hidden rounded-control border border-line bg-raised"
                        >
                          <img
                            src={url}
                            alt={`تصویر ${idx + 1}`}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-white opacity-0 transition-opacity duration-150 ease-out-quart group-hover:opacity-100">
                            <Eye className="h-4 w-4" />
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-faint">بدون تصویر.</p>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
};
