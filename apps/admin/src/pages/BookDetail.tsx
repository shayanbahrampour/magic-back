import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, formatToman } from '../services/api';
import type { Book, Chapter } from '../services/api';
import {
  ArrowRight,
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  Layers,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Notice,
  Panel,
  PanelHeader,
  Skeleton,
  SkeletonRows,
  cx,
} from '../components/ui';

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
  const [saving, setSaving] = useState(false);

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
      const nextOrder =
        chaptersData.length > 0 ? Math.max(...chaptersData.map((c) => c.chapter_order)) + 1 : 1;
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

    setSaving(true);
    try {
      await api.createChapter({
        book_id: bookId,
        title: newTitle,
        chapter_order: Number(newOrder),
      });
      setSuccess('فصل جدید ایجاد شد');
      setNewTitle('');
      setShowAddForm(false);
      await loadBookData();
    } catch (err: any) {
      setError(err.message || 'خطا در ایجاد فصل');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (chapter: Chapter) => {
    setShowAddForm(false);
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

    setSaving(true);
    try {
      await api.updateChapter(editingChapter.id, {
        book_id: bookId,
        title: editTitle,
        chapter_order: Number(editOrder),
      });
      setSuccess('فصل به‌روزرسانی شد');
      setEditingChapter(null);
      await loadBookData();
    } catch (err: any) {
      setError(err.message || 'خطا در ویرایش فصل');
    } finally {
      setSaving(false);
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
        prev.map((c) => (c.id === chapter.id ? { ...c, is_free: !c.is_free } : c)),
      );
      setSuccess(
        chapter.is_free
          ? `فصل «${chapter.title}» دیگر رایگان نیست.`
          : `فصل «${chapter.title}» به‌عنوان پیش‌نمایش رایگان تنظیم شد.`,
      );
    } catch (err: any) {
      setError(err.message || 'خطا در تغییر وضعیت رایگان بودن فصل');
    }
  };

  const handleDelete = async (chapterId: number) => {
    if (
      !window.confirm(
        'آیا از حذف این فصل اطمینان دارید؟ تمامی صفحات داخل این فصل نیز برای همیشه حذف خواهند شد.',
      )
    ) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.deleteChapter(chapterId);
      setSuccess('فصل حذف شد');
      await loadBookData();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف فصل');
    }
  };

  if (loading && !book) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-40" />
        <Panel className="p-5">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="mt-3 h-4 w-40" />
        </Panel>
        <Panel className="overflow-hidden">
          <SkeletonRows rows={4} />
        </Panel>
      </div>
    );
  }

  if (!book) {
    return <Notice tone="critical">کتاب مورد نظر یافت نشد.</Notice>;
  }

  const backLink = (
    <Link
      to="/books"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors duration-150 hover:text-ink"
    >
      <ArrowRight className="h-4 w-4" />
      کتاب‌ها
    </Link>
  );

  return (
    <div className="space-y-6">
      {backLink}

      {/* Book summary */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {book.cover_image_url ? (
          <img
            src={book.cover_image_url}
            alt=""
            className="h-40 w-28 shrink-0 rounded-panel border border-line object-cover"
          />
        ) : (
          <span className="flex h-40 w-28 shrink-0 items-center justify-center rounded-panel border border-line bg-raised text-faint">
            <Layers className="h-6 w-6" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {book.categories?.map((cat) => (
              <Badge key={cat.id}>{cat.name}</Badge>
            ))}
            {book.is_free ? (
              <Badge tone="positive">
                <Unlock className="h-3 w-3" /> رایگان
              </Badge>
            ) : (
              <Badge tone="caution">
                <Lock className="h-3 w-3" /> {formatToman(book.price_toman)}
              </Badge>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink">{book.title}</h2>
            <p className="text-sm text-muted">
              اثر {book.author} · شناسه <span className="num">{book.id}</span>
            </p>
          </div>

          {(book.short_description || book.full_description) && (
            <div className="max-w-[70ch] space-y-1.5 border-t border-line-soft pt-3">
              {book.short_description && (
                <p className="text-sm text-ink">{book.short_description}</p>
              )}
              {book.full_description && (
                <p className="text-xs leading-relaxed text-muted">{book.full_description}</p>
              )}
            </div>
          )}
        </div>
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

      {/* Chapters */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <h3 className="text-[0.9375rem] font-bold text-ink">
          فصل‌ها <span className="num text-muted">({chapters.length})</span>
        </h3>
        {!showAddForm && !editingChapter && (
          <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4" />
            فصل جدید
          </Button>
        )}
      </div>

      {(showAddForm || editingChapter) && (
        <Panel className="animate-rise overflow-hidden">
          <PanelHeader
            title={editingChapter ? 'ویرایش فصل' : 'فصل جدید'}
            onClose={() => {
              setShowAddForm(false);
              setEditingChapter(null);
            }}
          />
          <form
            onSubmit={editingChapter ? handleEditSubmit : handleAddSubmit}
            className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end"
          >
            <Field label="عنوان فصل" htmlFor="chapter-title" className="flex-1">
              <Input
                id="chapter-title"
                value={editingChapter ? editTitle : newTitle}
                onChange={(e) =>
                  editingChapter ? setEditTitle(e.target.value) : setNewTitle(e.target.value)
                }
                placeholder="مثال: فصل اول — ورود به آراکیز"
              />
            </Field>
            <Field label="ترتیب" htmlFor="chapter-order" className="sm:w-28">
              <Input
                id="chapter-order"
                type="number"
                dir="ltr"
                className="num"
                value={editingChapter ? editOrder : newOrder}
                onChange={(e) =>
                  editingChapter ? setEditOrder(e.target.value) : setNewOrder(e.target.value)
                }
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingChapter(null);
                }}
              >
                انصراف
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {editingChapter ? 'ذخیره' : 'افزودن'}
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        {chapters.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="این کتاب هنوز فصلی ندارد"
            hint="یک فصل بسازید، سپس داخل آن صفحات را با متن و تصویر پر کنید."
            action={
              !showAddForm && (
                <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
                  <Plus className="h-4 w-4" />
                  فصل جدید
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {chapters.map((chapter) => (
              <li
                key={chapter.id}
                className="flex flex-wrap items-center gap-4 px-5 py-3.5 transition-colors duration-150 ease-out-quart hover:bg-raised/50"
              >
                <span className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-raised text-sm font-semibold text-muted">
                  {chapter.chapter_order}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{chapter.title}</p>
                    {!book.is_free && chapter.is_free && (
                      <Badge tone="positive">
                        <Unlock className="h-2.5 w-2.5" /> پیش‌نمایش
                      </Badge>
                    )}
                  </div>
                  <p className="num text-xs text-faint">#{chapter.id}</p>
                </div>

                <div className="flex items-center gap-1">
                  {!book.is_free && (
                    <button
                      type="button"
                      onClick={() => handleToggleFree(chapter)}
                      aria-pressed={chapter.is_free}
                      title={
                        chapter.is_free
                          ? 'این فصل رایگان است — برای قفل کردن کلیک کنید'
                          : 'این فصل قفل است — برای رایگان کردن کلیک کنید'
                      }
                      className={cx(
                        'inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-xs font-semibold',
                        'transition-colors duration-150 ease-out-quart',
                        chapter.is_free
                          ? 'border-positive-line bg-positive-soft text-positive'
                          : 'border-line bg-surface text-muted hover:bg-raised',
                      )}
                    >
                      {chapter.is_free ? (
                        <Unlock className="h-3.5 w-3.5" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" />
                      )}
                      {chapter.is_free ? 'رایگان' : 'قفل'}
                    </button>
                  )}

                  <Link
                    to={`/books/${bookId}/chapters/${chapter.id}`}
                    className="inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-xs font-semibold text-accent transition-colors duration-150 ease-out-quart hover:bg-accent-soft"
                  >
                    صفحات
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Link>

                  <IconButton label="ویرایش فصل" onClick={() => handleEditClick(chapter)}>
                    <Edit2 className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="حذف فصل"
                    tone="danger"
                    onClick={() => handleDelete(chapter.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};
