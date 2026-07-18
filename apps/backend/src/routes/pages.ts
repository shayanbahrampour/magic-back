import { Router } from 'express';
import prisma from '../db';
import { requireAuth } from '../middleware/auth';
import { normalizeFileUrl } from '../utils/s3';

const router = Router();
router.use(requireAuth);

// Function to safely parse image_urls from string back to array of strings
function parsePageImages(page: any, req?: any) {
  let urls: string[] = [];
  try {
    urls = page.image_urls ? JSON.parse(page.image_urls) : [];
  } catch (e) {
    urls = [];
  }
  return {
    ...page,
    image_urls: urls.map((u: string) => normalizeFileUrl(u, req) || u),
    is_full_page: Boolean(page.is_full_page),
  };
}

// ADMIN: GET /pages (List pages, optional chapterId filter)
router.get('/', async (req, res) => {
  const { chapterId } = req.query;
  try {
    const filter = chapterId ? { chapter_id: Number(chapterId) } : {};
    const pages = await prisma.page.findMany({
      where: filter,
      orderBy: { page_number: 'asc' },
    });
    res.json(pages.map(p => parsePageImages(p, req)));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

// ADMIN: GET /pages/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const page = await prisma.page.findUnique({
      where: { id: Number(id) },
    });
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json(parsePageImages(page, req));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch page' });
  }
});

// ADMIN: POST /pages
router.post('/', async (req, res) => {
  const { chapter_id, page_number, text_content, image_urls, is_full_page } = req.body;
  if (!chapter_id || page_number === undefined) {
    return res.status(400).json({ error: 'chapter_id and page_number are required' });
  }
  try {
    const cleanUrls = Array.isArray(image_urls)
      ? image_urls.map((u: string) => normalizeFileUrl(u, req) || u)
      : [];
    const urlsString = JSON.stringify(cleanUrls);
    const newPage = await prisma.page.create({
      data: {
        chapter_id: Number(chapter_id),
        page_number: Number(page_number),
        text_content: text_content || null,
        image_urls: urlsString,
        is_full_page: Boolean(is_full_page),
      },
    });
    res.status(201).json(parsePageImages(newPage, req));
  } catch (error) {
    res.status(500).json({ error: 'Failed to create page' });
  }
});

// ADMIN: PUT /pages/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { chapter_id, page_number, text_content, image_urls, is_full_page } = req.body;
  try {
    const data: any = {};
    if (chapter_id !== undefined) data.chapter_id = Number(chapter_id);
    if (page_number !== undefined) data.page_number = Number(page_number);
    if (text_content !== undefined) data.text_content = text_content;
    if (image_urls !== undefined) {
      const cleanUrls = Array.isArray(image_urls)
        ? image_urls.map((u: string) => normalizeFileUrl(u, req) || u)
        : [];
      data.image_urls = JSON.stringify(cleanUrls);
    }
    if (is_full_page !== undefined) data.is_full_page = Boolean(is_full_page);

    const updatedPage = await prisma.page.update({
      where: { id: Number(id) },
      data,
    });
    res.json(parsePageImages(updatedPage, req));
  } catch (error) {
    res.status(500).json({ error: 'Failed to update page' });
  }
});

// ADMIN: DELETE /pages/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.page.delete({
      where: { id: Number(id) },
    });
    res.json({ message: 'Page deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

export default router;
