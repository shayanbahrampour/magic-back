import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Categories } from './pages/Categories';
import { Books } from './pages/Books';
import { BookDetail } from './pages/BookDetail';
import { ChapterDetail } from './pages/ChapterDetail';
import { Subscriptions } from './pages/Subscriptions';
import { Login } from './pages/Login';

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('admin_token'));

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const handleLoginSuccess = (newToken: string) => {
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_phone');
    setToken(null);
  };

  if (!token) {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  return (
    <BrowserRouter>
      <Layout onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/books" element={<Books />} />
          <Route path="/books/:id" element={<BookDetail />} />
          <Route path="/books/:bookId/chapters/:chapterId" element={<ChapterDetail />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
