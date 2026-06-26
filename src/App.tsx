import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Landing from '@/pages/Landing';
import Auth from '@/pages/Auth';
import Cockpit from '@/pages/Cockpit';
import AshaApp from '@/pages/AshaApp';
import NotFound from '@/pages/NotFound';
import { RequireAuth } from '@/components/RequireAuth';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Toaster position="top-center" richColors />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/cockpit/*"
              element={
                <RequireAuth role={['rmp', 'admin']}>
                  <Cockpit />
                </RequireAuth>
              }
            />
            <Route
              path="/asha/*"
              element={
                <RequireAuth>
                  <AshaApp />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
