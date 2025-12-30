import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './config/wagmi';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Layout } from './components/layout';

// Lazy load pages for better performance
const Home = lazy(() => import('./pages/Home'));
const BingoLive = lazy(() => import('./pages/BingoLive'));
const MyCards = lazy(() => import('./pages/MyCards'));
const Admin = lazy(() => import('./pages/Admin'));

const queryClient = new QueryClient();

// Loading fallback
const PageLoader = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: '#0a0a0f',
    color: '#fff'
  }}>
    <div className="loading-spinner">Cargando...</div>
  </div>
);

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SocketProvider>
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public routes with layout */}
                  <Route element={<Layout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/bingo-live" element={<BingoLive />} />
                    <Route path="/mis-cartones" element={<MyCards />} />
                  </Route>

                  {/* Admin route (no layout) */}
                  <Route path="/admin" element={<Admin />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </SocketProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
