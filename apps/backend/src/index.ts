import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import categoriesRouter from './routes/categories';
import booksRouter from './routes/books';
import chaptersRouter from './routes/chapters';
import pagesRouter from './routes/pages';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Serve static files from the React frontend app
const frontendPath = path.join(__dirname, '../../admin/dist');
app.use(express.static(frontendPath));

// Routes
app.use('/api/categories', categoriesRouter);
app.use('/api/books', booksRouter);
app.use('/api/chapters', chaptersRouter);
app.use('/api/pages', pagesRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// For any other request, serve index.html (SPA routing)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next(); // Let it fall through to the default 404 handler
  }
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      next();
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});

