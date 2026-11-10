import { useState, createContext, useContext, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion'; 
import { DataProvider } from './context/DataContext';
import { UserProvider, useUser } from './context/UserContext';
import { LanguageProvider } from './context/LanguageContext';
import LivingNavbar from './components/LivingNavbar';
import AIChatbot from './components/AIChatbot';
import SplashScreen from './components/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

// Code-split routes for instant initial load (Ponytail P1)
const Dashboard  = lazy(() => import('./pages/Dashboard'));
const Analysis   = lazy(() => import('./pages/Analysis'));
const Settings   = lazy(() => import('./pages/Settings'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const CropConfig = lazy(() => import('./pages/CropConfig'));

// Backward-compatible lightweight NavDirectionContext
export const NavDirectionContext = createContext({ direction: 0, onNavChange: () => {} });
export function useNavDirection() { return useContext(NavDirectionContext); }

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
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{ width: '100%', willChange: 'opacity, transform' }}
        >
          <Routes location={location}>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/analysis"    element={<Analysis />} />
            <Route path="/settings"    element={<Settings />} />
            <Route path="/crop-config" element={<CropConfig />} />
            <Route path="/account"     element={<Navigate to="/settings" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </Suspense>
  );
}

function AppShell() {
  const { user } = useUser();

  if (!user?.onboarded) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <NavDirectionContext.Provider value={{ direction: 0, onNavChange: () => {} }}>
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
    </NavDirectionContext.Provider>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem('manik_splash_shown');
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
