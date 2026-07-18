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
  book?: Book;
}

export interface Page {
  id: number;
  chapter_id: number;
  page_number: number;
  text_content: string | null;
  image_urls: string[]; // store as json string in SQLite or string array in client
  chapter?: Chapter;
}

// Create/Update inputs for API requests
export interface CreateCategoryInput {
  name: string;
}

export interface UpdateCategoryInput {
  name?: string;
}

export interface CreateBookInput {
  title: string;
  author: string;
  short_description: string;
  full_description: string;
  cover_image_url?: string | null;
  category_ids: number[];
}

export interface UpdateBookInput {
  title?: string;
  author?: string;
  short_description?: string;
  full_description?: string;
  cover_image_url?: string | null;
  category_ids?: number[];
}

export interface CreateChapterInput {
  book_id: number;
  title: string;
  chapter_order: number;
}

export interface UpdateChapterInput {
  book_id?: number;
  title?: string;
  chapter_order?: number;
}

export interface CreatePageInput {
  chapter_id: number;
  page_number: number;
  text_content?: string | null;
  image_urls?: string[] | null;
}

export interface UpdatePageInput {
  chapter_id?: number;
  page_number?: number;
  text_content?: string | null;
  image_urls?: string[] | null;
}
