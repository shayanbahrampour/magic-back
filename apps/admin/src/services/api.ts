const BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token');
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  const contentType = response.headers.get('content-type');

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_phone');
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    let errorMessage = `HTTP error! status: ${response.status}`;
    if (contentType && contentType.includes('application/json')) {
      const errorData = await response.json().catch(() => ({}));
      errorMessage = errorData.error || errorMessage;
    } else {
      const text = await response.text().catch(() => '');
      if (text.includes('<!doctype') || text.includes('<html>')) {
        errorMessage = `Server returned HTML (likely 404 or SPA redirect) instead of JSON for ${url}. Status: ${response.status}`;
      } else {
        errorMessage = text || errorMessage;
      }
    }
    throw new Error(errorMessage);
  }

  // Handle deletion or empty responses
  if (response.status === 204) return {} as T;
  
  const text = await response.text();
  if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html') || text.trim().startsWith('<')) {
    throw new Error(
      `API error: Expected JSON response but received HTML from "${url}". ` +
      `This usually happens when the API endpoint is incorrect (e.g. missing "/api" prefix) ` +
      `or the backend server is misconfigured/down and redirected to the frontend's index.html. ` +
      `Response preview (first 100 chars): ${text.trim().slice(0, 100)}`
    );
  }

  return text ? JSON.parse(text) : ({} as T);
}

export interface Category {
  id: number;
  name: string;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  short_description: string;
  full_description: string;
  cover_image_url?: string | null;
  categories?: Category[];
  /** When false the book is paid and `price_toman` applies. */
  is_free: boolean;
  price_toman: number;
}

export interface Chapter {
  id: number;
  book_id: number;
  title: string;
  chapter_order: number;
  /** Free preview chapter inside a paid book. */
  is_free: boolean;
}

export interface SubscriptionPlan {
  id: number;
  title: string;
  durationMonths: number;
  priceToman: number;
  isActive: boolean;
}

export type SubscriptionPlanInput = {
  title?: string;
  durationMonths: number;
  priceToman: number;
  isActive?: boolean;
};

/** Groups a toman amount in threes for display, e.g. 1500000 → «۱٬۵۰۰٬۰۰۰ تومان». */
export function formatToman(amount: number): string {
  const grouped = Math.max(0, Math.trunc(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return `${toPersianDigits(grouped)} تومان`;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export interface Page {
  id: number;
  chapter_id: number;
  page_number: number;
  text_content: string | null;
  image_urls: string[];
  is_full_page?: boolean;
}

function normalizeUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const backendOrigin = import.meta.env.DEV ? 'http://localhost:5001' : '';

  if (trimmed.includes('/api/files/')) {
    if (trimmed.startsWith('/api/files/')) {
      return `${backendOrigin}${trimmed}`;
    }
    return trimmed;
  }

  // If it's an internal string or matches http://10.220.4.2:9000/magicstore/uploads/... or http://localhost:9000/...
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.port === '9000' || parsed.hostname.startsWith('10.') || parsed.hostname === 'minio' || parsed.hostname === 'localhost' || parsed.pathname.includes('/magicstore/')) {
        let path = parsed.pathname.replace(/^\/+/, '');
        if (path.startsWith('magicstore/')) path = path.slice('magicstore/'.length);
        if (path.startsWith('magicbook/')) path = path.slice('magicbook/'.length);
        if (path.startsWith('uploads/') || path.includes('/uploads/')) {
          const uploadIdx = path.indexOf('uploads/');
          path = path.slice(uploadIdx);
        }
        return `${backendOrigin}/api/files/${path}`;
      }
    } catch {
      // ignore parse errors
    }
  } else if (trimmed.startsWith('/magicstore/') || trimmed.startsWith('magicstore/')) {
    const path = trimmed.replace(/^\/+/, '').slice('magicstore/'.length);
    return `${backendOrigin}/api/files/${path}`;
  } else if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
    const path = trimmed.replace(/^\/+/, '');
    return `${backendOrigin}/api/files/${path}`;
  }

  return trimmed;
}

function normalizeBook(book: Book): Book {
  if (!book) return book;
  return {
    ...book,
    cover_image_url: book.cover_image_url ? normalizeUrl(book.cover_image_url) : null,
  };
}

function normalizePage(page: Page): Page {
  if (!page) return page;
  return {
    ...page,
    image_urls: Array.isArray(page.image_urls) ? page.image_urls.map(normalizeUrl) : [],
    is_full_page: Boolean(page.is_full_page),
  };
}

function normalizeUploadResponse(res: { url: string; urls: string[]; message: string }) {
  return {
    ...res,
    url: normalizeUrl(res.url),
    urls: Array.isArray(res.urls) ? res.urls.map(normalizeUrl) : [],
  };
}

export const api = {
  // Categories CRUD
  getCategories: () => request<Category[]>('/categories'),
  getCategory: (id: number) => request<Category>(`/categories/${id}`),
  createCategory: (name: string) =>
    request<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateCategory: (id: number, name: string) =>
    request<Category>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }),
  deleteCategory: (id: number) =>
    request<{ message: string }>(`/categories/${id}`, {
      method: 'DELETE',
    }),

  // Books CRUD
  getBooks: async (categoryId?: number) => {
    const query = categoryId ? `?categoryId=${categoryId}` : '';
    const books = await request<Book[]>(`/books${query}`);
    return books.map(normalizeBook);
  },
  getBook: async (id: number) => {
    const book = await request<Book>(`/books/${id}`);
    return normalizeBook(book);
  },
  getBookChapters: (bookId: number) => request<Chapter[]>(`/books/${bookId}/chapters`),
  createBook: async (data: { title: string; author: string; short_description: string; full_description: string; cover_image_url?: string | null; category_ids: number[]; is_free?: boolean; price_toman?: number }) => {
    const book = await request<Book>('/books', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return normalizeBook(book);
  },
  updateBook: async (id: number, data: { title?: string; author?: string; short_description?: string; full_description?: string; cover_image_url?: string | null; category_ids?: number[]; is_free?: boolean; price_toman?: number }) => {
    const book = await request<Book>(`/books/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return normalizeBook(book);
  },
  deleteBook: (id: number) =>
    request<{ message: string }>(`/books/${id}`, {
      method: 'DELETE',
    }),

  // Chapters CRUD
  getChapters: (bookId?: number) => {
    const query = bookId ? `?bookId=${bookId}` : '';
    return request<Chapter[]>(`/chapters${query}`);
  },
  getChapter: (id: number) => request<Chapter>(`/chapters/${id}`),
  getChapterPages: async (chapterId: number) => {
    const pages = await request<Page[]>(`/chapters/${chapterId}/pages`);
    return pages.map(normalizePage);
  },
  // `is_free` defaults to false server-side, so new chapters start locked.
  createChapter: (data: Omit<Chapter, 'id' | 'is_free'> & { is_free?: boolean }) =>
    request<Chapter>('/chapters', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateChapter: (id: number, data: Partial<Omit<Chapter, 'id'>>) =>
    request<Chapter>(`/chapters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteChapter: (id: number) =>
    request<{ message: string }>(`/chapters/${id}`, {
      method: 'DELETE',
    }),

  // Pages CRUD
  getPages: async (chapterId?: number) => {
    const query = chapterId ? `?chapterId=${chapterId}` : '';
    const pages = await request<Page[]>(`/pages${query}`);
    return pages.map(normalizePage);
  },
  getPage: async (id: number) => {
    const page = await request<Page>(`/pages/${id}`);
    return normalizePage(page);
  },
  createPage: async (data: Omit<Page, 'id'>) => {
    const page = await request<Page>('/pages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return normalizePage(page);
  },
  updatePage: async (id: number, data: Partial<Omit<Page, 'id'>>) => {
    const page = await request<Page>(`/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return normalizePage(page);
  },
  deletePage: (id: number) =>
    request<{ message: string }>(`/pages/${id}`, {
      method: 'DELETE',
    }),

  // Subscription plans
  getSubscriptionPlans: async () => {
    const res = await request<{ plans: SubscriptionPlan[] }>('/subscriptions/plans/all');
    return res.plans;
  },
  createSubscriptionPlan: (data: SubscriptionPlanInput) =>
    request<SubscriptionPlan>('/subscriptions/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSubscriptionPlan: (id: number, data: Partial<SubscriptionPlanInput>) =>
    request<SubscriptionPlan>(`/subscriptions/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteSubscriptionPlan: (id: number) =>
    request<{ message: string; archived: boolean }>(`/subscriptions/plans/${id}`, {
      method: 'DELETE',
    }),

  // Auth
  sendOtp: (phone: string) =>
    request<{ message: string; phone: string }>('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verifyOtp: (phone: string, otp: string) =>
    request<{ message: string; token: string; user: { phone: string; role: string } }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    }),

  // Upload
  uploadFile: async (file: File): Promise<{ url: string; urls: string[]; message: string }> => {
    const token = localStorage.getItem('admin_token');
    const formData = new FormData();
    formData.append('file', file);
    const url = `${BASE_URL}/upload`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `خطا در آپلود فایل (Status: ${response.status})`);
    }
    const data = await response.json();
    return normalizeUploadResponse(data);
  },
  uploadFiles: async (files: File[] | FileList): Promise<{ url: string; urls: string[]; message: string }> => {
    const token = localStorage.getItem('admin_token');
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append('files', f));
    const url = `${BASE_URL}/upload`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `خطا در آپلود فایل‌ها (Status: ${response.status})`);
    }
    const data = await response.json();
    return normalizeUploadResponse(data);
  },
};
