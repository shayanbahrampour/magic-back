import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Category } from '../services/api';
import { Edit2, Trash2, RefreshCw, CheckCircle2 } from 'lucide-react';

export const Categories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [formName, setFormName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
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

    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, formName.trim());
        setSuccess('دسته‌بندی با موفقیت به‌روزرسانی شد');
      } else {
        await api.createCategory(formName.trim());
        setSuccess('دسته‌بندی جدید با موفقیت ایجاد شد');
      }
      setFormName('');
      setEditingCategory(null);
      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'عملیات با خطا مواجه شد');
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormName(category.name);
    setError('');
    setSuccess('');
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('آیا از حذف این دسته‌بندی اطمینان دارید؟ تمامی کتاب‌های مرتبط این دسته‌بندی را از دست خواهند داد.')) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.deleteCategory(id);
      setSuccess('دسته‌بندی با موفقیت حذف شد');
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">مدیریت دسته‌بندی‌ها</h2>
          <p className="text-sm text-slate-400 mt-1">دسته‌بندی‌های کتاب را برای سازماندهی و فیلتر دقیق‌تر مدیریت کنید</p>
        </div>
        <button
          onClick={loadCategories}
          className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-500 hover:text-slate-700 transition"
          title="بارگذاری مجدد"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-sm font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-100 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Categories List (Right in RTL - 2 Cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : categories.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              هیچ دسته‌بندی یافت نشد. از فرم سمت چپ برای ایجاد اولین دسته‌بندی استفاده کنید.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">شناسه</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">عنوان دسته‌بندی</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {categories.map((category) => (
                    <tr key={category.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-6 py-4 text-sm font-mono text-slate-400">{category.id}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">{category.name}</td>
                      <td className="px-6 py-4 text-sm text-left space-x-2 space-x-reverse">
                        <button
                          onClick={() => handleEdit(category)}
                          className="inline-flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="ویرایش دسته‌بندی"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="حذف دسته‌بندی"
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

        {/* Create/Edit Form (Left in RTL - 1 Col) */}
        <div>
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-6 sticky top-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {editingCategory ? 'ویرایش دسته‌بندی' : 'ایجاد دسته‌بندی جدید'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {editingCategory
                  ? 'نام دسته‌بندی انتخاب‌شده را ویرایش کنید'
                  : 'یک عنوان جدید برای دسته‌بندی کتاب‌ها تعریف کنید'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  نام دسته‌بندی
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: علمی‌تخیلی، رمان، تاریخی"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/15 hover:shadow-indigo-600/25 transition duration-150 flex items-center justify-center gap-2"
                >
                  {editingCategory ? 'ذخیره تغییرات' : 'افزودن دسته‌بندی'}
                </button>
                {editingCategory && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-bold transition"
                  >
                    انصراف
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
