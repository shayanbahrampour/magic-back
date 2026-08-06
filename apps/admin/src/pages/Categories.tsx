import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Category } from '../services/api';
import { Edit2, Trash2, RefreshCw, Tag } from 'lucide-react';
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Notice,
  PageHeader,
  Panel,
  SkeletonRows,
  Table,
  Td,
  Th,
  Tr,
} from '../components/ui';

export const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [formName, setFormName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری دسته‌بندی‌ها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!formName.trim()) {
      setError('نام دسته‌بندی نمی‌تواند خالی باشد');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, formName.trim());
        setSuccess('دسته‌بندی به‌روزرسانی شد');
      } else {
        await api.createCategory(formName.trim());
        setSuccess('دسته‌بندی جدید ایجاد شد');
      }
      setFormName('');
      setEditingCategory(null);
      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'عملیات با خطا مواجه شد');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormName(category.name);
    setError('');
    setSuccess('');
  };

  const handleDelete = async (id: number) => {
    if (
      !window.confirm(
        'آیا از حذف این دسته‌بندی اطمینان دارید؟ تمامی کتاب‌های مرتبط این دسته‌بندی را از دست خواهند داد.',
      )
    ) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.deleteCategory(id);
      setSuccess('دسته‌بندی حذف شد');
      if (editingCategory?.id === id) {
        setEditingCategory(null);
        setFormName('');
      }
      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف دسته‌بندی');
    }
  };

  const handleCancel = () => {
    setEditingCategory(null);
    setFormName('');
    setError('');
    setSuccess('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="دسته‌بندی‌ها"
        description="دسته‌بندی‌ها تعیین می‌کنند کتاب‌ها در اپلیکیشن چطور گروه‌بندی و فیلتر شوند."
        actions={
          <IconButton label="بارگذاری مجدد" onClick={loadCategories} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </IconButton>
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

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Panel className="overflow-hidden lg:col-span-2">
          {loading ? (
            <SkeletonRows rows={4} />
          ) : categories.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="هنوز دسته‌بندی‌ای تعریف نشده"
              hint="با فرم کنار صفحه اولین دسته‌بندی را بسازید. تا وقتی حداقل یک دسته‌بندی وجود نداشته باشد، امکان ثبت کتاب نیست."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-20">شناسه</Th>
                  <Th>عنوان</Th>
                  <Th className="w-28 text-end">عملیات</Th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <Tr key={category.id}>
                    <Td className="num text-xs text-faint">{category.id}</Td>
                    <Td className="text-sm font-medium text-ink">{category.name}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          label="ویرایش دسته‌بندی"
                          tone="accent"
                          onClick={() => handleEdit(category)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="حذف دسته‌بندی"
                          tone="danger"
                          onClick={() => handleDelete(category.id)}
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

        <Panel className="sticky top-6 p-5">
          <h3 className="text-[0.9375rem] font-bold text-ink">
            {editingCategory ? 'ویرایش دسته‌بندی' : 'دسته‌بندی جدید'}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {editingCategory
              ? `در حال ویرایش «${editingCategory.name}»`
              : 'یک عنوان کوتاه و قابل تشخیص انتخاب کنید.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <Field label="نام دسته‌بندی" htmlFor="category-name">
              <Input
                id="category-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="مثال: علمی‌تخیلی"
              />
            </Field>

            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={saving} className="flex-1">
                {editingCategory ? 'ذخیره' : 'افزودن'}
              </Button>
              {editingCategory && (
                <Button type="button" onClick={handleCancel}>
                  انصراف
                </Button>
              )}
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
};
