import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/Home';
import { WorkspacePage } from './pages/Workspace';
import { useDocStore } from './store/docStore';
import { applyThemeToDocument } from './lib/theme';

export default function App() {
  const hydrate = useDocStore((s) => s.hydrate);
  const theme = useDocStore((s) => s.theme);
  const setSyncState = useDocStore((s) => s.setSyncState);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const onOnline = () => setSyncState('synced');
    const onOffline = () => setSyncState('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setSyncState]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/doc/:id" element={<WorkspacePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
