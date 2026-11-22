import { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { UserProvider, useUser } from './context/UserContext';
import { LanguageProvider } from './context/LanguageContext';
import LivingNavbar from './components/LivingNavbar';
import AIChatbot from './components/AIChatbot';
import SplashScreen from './components/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';

const Dashboard  = lazy(() => import('./pages/Dashboard'));
const Analysis   = lazy(() => import('./pages/Analysis'));
const Settings   = lazy(() => import('./pages/Settings'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const CropConfig = lazy(() => import('./pages/CropConfig'));

function PageFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '70vh',
      width: '100%'
    }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '3px solid rgba(16, 185, 129, 0.15)',
        borderTopColor: '#10b981',
        animation: 'spin 0.7s linear infinite'
      }} />
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<PageFallback />}>
      <div key={location.pathname} className="route-transition">
        <Routes location={location}>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/analysis"    element={<Analysis />} />
          <Route path="/settings"    element={<Settings />} />
          <Route path="/crop-config" element={<CropConfig />} />
          <Route path="/account"     element={<Navigate to="/settings" replace />} />
        </Routes>
      </div>
    </Suspense>
  );
}

function AppShell() {
  const { user } = useUser();

  if (!user?.isAuthenticated || !user?.onboarded) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <>
      <div className="app-container" style={{ overflowX: 'hidden', overflowY: 'auto', position: 'relative', minHeight: '100dvh' }}>
        <AnimatedRoutes />
      </div>
      <div className="fixed-overlay-wrapper">
        <div className="fixed-overlay-content">
          <div className="fixed-nav-cluster">
            <LivingNavbar />
            <AIChatbot />
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem('enzoponik_splash_shown');
    } catch {
      return false;
    }
  });

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <UserProvider>
          <LanguageProvider>
            <DataProvider>
              <AppShell />
              {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
            </DataProvider>
          </LanguageProvider>
        </UserProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
