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
}

export interface Chapter {
  id: number;
  book_id: number;
  title: string;
  chapter_order: number;
}

export interface Page {
  id: number;
  chapter_id: number;
  page_number: number;
  text_content: string | null;
  image_urls: string[];
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
  getBooks: (categoryId?: number) => {
    const query = categoryId ? `?categoryId=${categoryId}` : '';
    return request<Book[]>(`/books${query}`);
  },
  getBook: (id: number) => request<Book>(`/books/${id}`),
  getBookChapters: (bookId: number) => request<Chapter[]>(`/books/${bookId}/chapters`),
  createBook: (data: { title: string; author: string; short_description: string; full_description: string; cover_image_url?: string | null; category_ids: number[] }) =>
    request<Book>('/books', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateBook: (id: number, data: { title?: string; author?: string; short_description?: string; full_description?: string; cover_image_url?: string | null; category_ids?: number[] }) =>
    request<Book>(`/books/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
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
  getChapterPages: (chapterId: number) => request<Page[]>(`/chapters/${chapterId}/pages`),
  createChapter: (data: Omit<Chapter, 'id'>) =>
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
  getPages: (chapterId?: number) => {
    const query = chapterId ? `?chapterId=${chapterId}` : '';
    return request<Page[]>(`/pages${query}`);
  },
  getPage: (id: number) => request<Page>(`/pages/${id}`),
  createPage: (data: Omit<Page, 'id'>) =>
    request<Page>('/pages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePage: (id: number, data: Partial<Omit<Page, 'id'>>) =>
    request<Page>(`/pages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deletePage: (id: number) =>
    request<{ message: string }>(`/pages/${id}`, {
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
    return response.json();
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
    return response.json();
  },
};
