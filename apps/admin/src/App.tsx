import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Categories } from './pages/Categories';
import { Books } from './pages/Books';
import { BookDetail } from './pages/BookDetail';
import { ChapterDetail } from './pages/ChapterDetail';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/books" element={<Books />} />
          <Route path="/books/:id" element={<BookDetail />} />
          <Route path="/books/:bookId/chapters/:chapterId" element={<ChapterDetail />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
