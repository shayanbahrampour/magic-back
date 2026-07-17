import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import categoriesRouter from './routes/categories';
import booksRouter from './routes/books';
import chaptersRouter from './routes/chapters';
import pagesRouter from './routes/pages';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/categories', categoriesRouter);
app.use('/api/books', booksRouter);
app.use('/api/chapters', chaptersRouter);
app.use('/api/pages', pagesRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
