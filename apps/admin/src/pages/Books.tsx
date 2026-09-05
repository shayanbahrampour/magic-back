import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatToman, toPersianDigits } from '../services/api';
import type { Book, Category } from '../services/api';
import {
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  X,
  BookOpen,
  RefreshCw,
  Upload,
  Loader2,
  Image as ImageIcon,
  Lock,
  Unlock,
  Award,
} from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  SegmentedControl,
  SkeletonRows,
  Table,
  Td,
  Textarea,
  Th,
  Tr,
} from '../components/ui';

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
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [booksData, catsData] = await Promise.all([api.getBooks(), api.getCategories()]);
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
      setSuccess('تصویر جلد آپلود شد');
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

    setSaving(true);
    try {
      if (editingBook) {
        await api.updateBook(editingBook.id, payload);
        setSuccess('اطلاعات کتاب به‌روزرسانی شد');
      } else {
        await api.createBook(payload);
        setSuccess('کتاب جدید به فهرست اضافه شد');
      }
      handleCancel();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره‌سازی کتاب');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !window.confirm(
        'آیا از حذف این کتاب اطمینان دارید؟ با حذف کتاب، تمامی فصل‌ها و صفحات زیرمجموعه آن نیز برای همیشه حذف خواهند شد.',
      )
    ) {
      return;
    }
    try {
      await api.deleteBook(id);
      setSuccess('کتاب حذف شد');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف کتاب');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="کتاب‌ها"
        description="هر کتاب از چند فصل و هر فصل از چند صفحه تشکیل می‌شود. برای ویرایش محتوا وارد جزئیات کتاب شوید."
        actions={
          <>
            <IconButton label="بارگذاری مجدد" onClick={loadData} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            {!showForm && (
              <Button variant="primary" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                کتاب جدید
              </Button>
            )}
          </>
        }
      />

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
            title={editingBook ? 'ویرایش کتاب' : 'ثبت کتاب جدید'}
            hint={editingBook ? `شناسه ${editingBook.id}` : undefined}
            onClose={handleCancel}
          />

          <form onSubmit={handleSubmit} className="space-y-6 p-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="عنوان کتاب" htmlFor="book-title">
                <Input
                  id="book-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: تلماسه"
                />
              </Field>

              <Field label="نویسنده" htmlFor="book-author">
                <Input
                  id="book-author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="مثال: فرانک هربرت"
                />
              </Field>
            </div>

            {/* Cover */}
            <Field label="تصویر جلد" hint="فایل مستقیماً در فضای ذخیره‌سازی S3 آپلود می‌شود.">
              <div className="flex flex-col items-start gap-4 rounded-control border border-line bg-raised/50 p-4 sm:flex-row sm:items-center">
                {coverImageUrl ? (
                  <div className="relative shrink-0">
                    <img
                      src={coverImageUrl}
                      alt="پیش‌نمایش جلد"
                      className="h-28 w-20 rounded-control border border-line object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImageUrl('')}
                      aria-label="حذف تصویر جلد"
                      title="حذف تصویر جلد"
                      className="absolute -top-2 -end-2 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-critical transition-colors duration-150 hover:bg-critical-soft"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line bg-surface text-faint">
                    <ImageIcon className="h-5 w-5" />
                    <span className="text-[0.625rem]">بدون جلد</span>
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-3 text-xs font-semibold text-ink transition-colors duration-150 ease-out-quart hover:bg-raised">
                    {uploadingCover ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        در حال آپلود…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        {coverImageUrl ? 'تغییر تصویر' : 'انتخاب تصویر'}
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
                  {coverImageUrl && (
                    <p className="num truncate text-[0.6875rem] text-faint" dir="ltr">
                      {coverImageUrl}
                    </p>
                  )}
                </div>
              </div>
            </Field>

            {/* Categories */}
            <Field
              label="دسته‌بندی‌ها"
              hint={categories.length > 0 ? 'حداقل یک مورد باید انتخاب شود.' : undefined}
            >
              {categories.length === 0 ? (
                <p className="rounded-control border border-dashed border-line px-4 py-3 text-xs text-muted">
                  ابتدا در صفحه دسته‌بندی‌ها حداقل یک مورد بسازید.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => {
                    const isSelected = selectedCategoryIds.includes(c.id);
                    return (
                      <Chip
                        key={c.id}
                        selected={isSelected}
                        onClick={() =>
                          setSelectedCategoryIds(
                            isSelected
                              ? selectedCategoryIds.filter((id) => id !== c.id)
                              : [...selectedCategoryIds, c.id],
                          )
                        }
                      >
                        {c.name}
                      </Chip>
                    );
                  })}
                </div>
              )}
            </Field>

            <Field label="توضیح کوتاه" htmlFor="book-short">
              <Input
                id="book-short"
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                placeholder="یک جمله که در فهرست اپلیکیشن دیده می‌شود"
              />
            </Field>

            <Field label="توضیحات کامل" htmlFor="book-full">
              <Textarea
                id="book-full"
                value={fullDesc}
                onChange={(e) => setFullDesc(e.target.value)}
                placeholder="معرفی کامل کتاب…"
                rows={4}
              />
            </Field>

            {/* Access & pricing */}
            <div className="space-y-4 rounded-control border border-line bg-raised/50 p-4">
              <Field label="دسترسی">
                <SegmentedControl
                  ariaLabel="نوع دسترسی کتاب"
                  value={isFree ? 'free' : 'paid'}
                  onChange={(next) => setIsFree(next === 'free')}
                  options={[
                    {
                      value: 'free',
                      label: (
                        <>
                          <Unlock className="h-3.5 w-3.5" /> رایگان
                        </>
                      ),
                    },
                    {
                      value: 'paid',
                      label: (
                        <>
                          <Lock className="h-3.5 w-3.5" /> پولی
                        </>
                      ),
                    },
                  ]}
                />
              </Field>

              {!isFree && (
                <div className="animate-rise space-y-4">
                  <Field
                    label="قیمت (تومان)"
                    htmlFor="book-price"
                    hint="کاربران دارای اشتراک فعال بدون پرداخت این مبلغ دسترسی دارند. برای رایگان کردن چند فصل، به جزئیات کتاب بروید."
                  >
                    <Input
                      id="book-price"
                      type="number"
                      min={0}
                      value={priceToman}
                      onChange={(e) => setPriceToman(e.target.value)}
                      placeholder="250000"
                      className="num"
                      dir="ltr"
                    />
                    {priceToman !== '' && Number.isFinite(Number(priceToman)) && (
                      <p className="mt-1.5 text-xs font-semibold text-accent">
                        {formatToman(Number(priceToman))}
                      </p>
                    )}
                  </Field>

                  <div className="border-t border-line pt-4">
                    <Checkbox
                      checked={pointsEnabled}
                      onChange={setPointsEnabled}
                      label="خرید با امتیاز فعال باشد"
                      hint="کاربر می‌تواند این کتاب را با امتیازهایی که از مطالعه و آزمون‌ها به دست آورده باز کند. دسترسی دائمی خواهد بود."
                    />

                    {pointsEnabled && (
                      <div className="animate-rise mt-4">
                        <Field label="امتیاز لازم" htmlFor="book-points">
                          <Input
                            id="book-points"
                            type="number"
                            min={0}
                            value={pointsPrice}
                            onChange={(e) => setPointsPrice(e.target.value)}
                            placeholder="500"
                            className="num"
                            dir="ltr"
                          />
                          {pointsPrice !== '' && Number.isFinite(Number(pointsPrice)) && (
                            <p className="mt-1.5 text-xs font-semibold text-accent">
                              {toPersianDigits(Number(pointsPrice))} امتیاز
                            </p>
                          )}
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
              <Button type="button" onClick={handleCancel}>
                انصراف
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                {editingBook ? 'ذخیره تغییرات' : 'ثبت کتاب'}
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        {loading ? (
          <SkeletonRows rows={5} />
        ) : books.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="هنوز کتابی ثبت نشده"
            hint="اولین کتاب را بسازید، سپس داخل جزئیات آن فصل‌ها و صفحات را اضافه کنید."
            action={
              !showForm && (
                <Button variant="primary" onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4" />
                  کتاب جدید
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>کتاب</Th>
                <Th className="hidden md:table-cell">نویسنده</Th>
                <Th className="hidden lg:table-cell">دسته‌بندی</Th>
                <Th>دسترسی</Th>
                <Th className="w-32 text-end">عملیات</Th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <Tr key={book.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      {book.cover_image_url ? (
                        <img
                          src={book.cover_image_url}
                          alt=""
                          className="h-14 w-10 shrink-0 rounded-[6px] border border-line object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-[6px] border border-line bg-raised text-faint">
                          <BookOpen className="h-4 w-4" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{book.title}</p>
                        <p className="max-w-xs truncate text-xs text-muted">
                          {book.short_description}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="hidden text-sm text-muted md:table-cell">{book.author}</Td>
                  <Td className="hidden lg:table-cell">
                    <div className="flex max-w-[16rem] flex-wrap gap-1.5">
                      {book.categories && book.categories.length > 0 ? (
                        book.categories.map((cat) => (
                          <Badge key={cat.id}>{cat.name}</Badge>
                        ))
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {book.is_free ? (
                      <Badge tone="positive">
                        <Unlock className="h-3 w-3" /> رایگان
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="caution">
                          <Lock className="h-3 w-3" /> {formatToman(book.price_toman)}
                        </Badge>
                        {book.points_price > 0 && (
                          <Badge tone="accent">
                            <Award className="h-3 w-3" />
                            {toPersianDigits(book.points_price)} امتیاز
                          </Badge>
                        )}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/books/${book.id}`}
                        title="مدیریت فصل‌ها و صفحات"
                        aria-label="مدیریت فصل‌ها و صفحات"
                        className="inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-xs font-semibold text-accent transition-colors duration-150 ease-out-quart hover:bg-accent-soft"
                      >
                        ویرایش محتوا
                        <ChevronLeft className="h-4 w-4" />
                      </Link>
                      <IconButton label="ویرایش کتاب" onClick={() => handleEditClick(book)}>
                        <Edit2 className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="حذف کتاب"
                        tone="danger"
                        onClick={() => handleDelete(book.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
};
