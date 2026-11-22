import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import enzoponikLogo from '../assets/logo_splash.png';
import LiquidGlassLogoReveal from './ui/LiquidGlassLogoReveal';
import './SplashScreen.css';

const SPLASH_STORAGE_KEY = 'enzoponik_splash_shown';

export default function SplashScreen({ onDone }) {
  const [isFading, setIsFading] = useState(false);
  const doneRef = useRef(false);
  const fadeTimerRef = useRef(null);
  const maxTimerRef = useRef(null);
  const readySafetyTimerRef = useRef(null);
  const completeTimerRef = useRef(null);

  const finishSplash = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(maxTimerRef.current);
    clearTimeout(readySafetyTimerRef.current);
    clearTimeout(completeTimerRef.current);
    document.documentElement.classList.remove('boot-splash-bg');
    document.getElementById('boot-splash')?.remove();
    setIsFading(true);
    fadeTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(SPLASH_STORAGE_KEY, 'true');
      } catch {}
      onDone();
    }, 450);
  }, [onDone]);

  const handleEngineReady = useCallback(() => {
    if (readySafetyTimerRef.current || doneRef.current) return;
    clearTimeout(maxTimerRef.current);
    readySafetyTimerRef.current = setTimeout(finishSplash, 3800);
  }, [finishSplash]);

  const handleEngineComplete = useCallback(() => {
    if (doneRef.current || completeTimerRef.current) return;
    completeTimerRef.current = setTimeout(finishSplash, 180);
  }, [finishSplash]);

  useEffect(() => {
    document.getElementById('boot-splash')?.remove();
    if (sessionStorage.getItem(SPLASH_STORAGE_KEY)) {
      document.documentElement.classList.remove('boot-splash-bg');
      onDone();
      return;
    }

    document.documentElement.classList.add('boot-splash-bg');
    // Hard ceiling if image download or WebGL context stalls on slow mobile connections
    maxTimerRef.current = setTimeout(finishSplash, 6500);
    return () => {
      document.documentElement.classList.remove('boot-splash-bg');
      clearTimeout(maxTimerRef.current);
      clearTimeout(readySafetyTimerRef.current);
      clearTimeout(completeTimerRef.current);
      clearTimeout(fadeTimerRef.current);
    };
  }, [finishSplash, onDone]);

  return createPortal(
    <div
      className={`splash ${isFading ? 'splash--fading' : ''}`}
      aria-label="ENZOPONIK loading"
      onClick={finishSplash}
    >
      <LiquidGlassLogoReveal
        logo={enzoponikLogo}
        label="ENZOPONIK"
        look="light"
        background="#ffffff"
        logoColor="#0c5e4a"
        originalColors
        tileSize={240}
        logoScale={0.72}
        finalScale={0.74}
        loop={false}
        speed={1.35}
        tuning={{ startZoom: 2.3, shadow: 0 }}
        onReady={handleEngineReady}
        onComplete={handleEngineComplete}
        className="splash__glass-canvas"
      />
    </div>,
    document.body
  );
}
