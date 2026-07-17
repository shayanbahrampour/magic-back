const BASE_URL = 'http://localhost:5001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  // Handle deletion or empty responses
  if (response.status === 204) return {} as T;
  const text = await response.text();
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
  createBook: (data: { title: string; author: string; short_description: string; full_description: string; category_ids: number[] }) =>
    request<Book>('/books', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateBook: (id: number, data: { title?: string; author?: string; short_description?: string; full_description?: string; category_ids?: number[] }) =>
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
};
