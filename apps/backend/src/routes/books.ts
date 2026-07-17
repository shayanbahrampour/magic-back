import { Router } from 'express';
import prisma from '../db';

const router = Router();

// CLIENT: GET /books (with optional categoryId filter)
router.get('/', async (req, res) => {
  const { categoryId } = req.query;
  try {
    const filter = categoryId
      ? {
          categories: {
            some: {
              id: Number(categoryId),
            },
          },
        }
      : {};

    const books = await prisma.book.findMany({
      where: filter,
      include: {
        categories: true,
      },
      orderBy: { id: 'desc' },
    });
    res.json(books);
  } catch (error) {
    console.error('Failed to fetch books:', error);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

// CLIENT & ADMIN: GET /books/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const book = await prisma.book.findUnique({
      where: { id: Number(id) },
      include: {
        categories: true,
      },
    });
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    res.json(book);
  } catch (error) {
    console.error('Failed to fetch book:', error);
    res.status(500).json({ error: 'Failed to fetch book' });
  }
});

// CLIENT: GET /books/:id/chapters
router.get('/:id/chapters', async (req, res) => {
  const { id } = req.params;
  try {
    const chapters = await prisma.chapter.findMany({
      where: { book_id: Number(id) },
      orderBy: { chapter_order: 'asc' },
    });
    res.json(chapters);
  } catch (error) {
    console.error('Failed to fetch book chapters:', error);
    res.status(500).json({ error: 'Failed to fetch book chapters' });
  }
});

// ADMIN: POST /books (Create book)
router.post('/', async (req, res) => {
  const { title, author, short_description, full_description, category_ids } = req.body;
  if (!title || !author || !Array.isArray(category_ids) || category_ids.length === 0) {
    return res.status(400).json({ error: 'Title, author, and at least one category (category_ids array) are required' });
  }
  try {
    const newBook = await prisma.book.create({
      data: {
        title,
        author,
        short_description: short_description || '',
        full_description: full_description || '',
        categories: {
          connect: category_ids.map((cid: number) => ({ id: Number(cid) })),
        },
      },
      include: {
        categories: true,
      },
    });
    res.status(201).json(newBook);
  } catch (error) {
    console.error('Failed to create book:', error);
    res.status(500).json({ error: 'Failed to create book' });
  }
});

// ADMIN: PUT /books/:id (Update book)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, author, short_description, full_description, category_ids } = req.body;
  try {
    const data: any = {
      title,
      author,
      short_description,
      full_description,
    };

    if (Array.isArray(category_ids)) {
      data.categories = {
        set: category_ids.map((cid: number) => ({ id: Number(cid) })),
      };
    }

    const updatedBook = await prisma.book.update({
      where: { id: Number(id) },
      data,
      include: {
        categories: true,
      },
    });
    res.json(updatedBook);
  } catch (error) {
    console.error('Failed to update book:', error);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// ADMIN: DELETE /books/:id (Delete book)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.book.delete({
      where: { id: Number(id) },
    });
    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Failed to delete book:', error);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

export default router;
