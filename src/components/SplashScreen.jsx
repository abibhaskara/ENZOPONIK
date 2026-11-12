import { useEffect, useState } from 'react';
import './SplashScreen.css';

const SPLASH_STORAGE_KEY = 'enzoponik_splash_shown';

export default function SplashScreen({ onDone }) {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Check if splash already played in this browser session (Ponytail zero-friction UX)
    if (sessionStorage.getItem(SPLASH_STORAGE_KEY)) {
      onDone();
      return;
    }

    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 850);

    const doneTimer = setTimeout(() => {
      try {
        sessionStorage.setItem(SPLASH_STORAGE_KEY, 'true');
      } catch {}
      onDone();
    }, 1150);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div className={`splash ${isFading ? 'splash--fading' : ''}`} aria-label="ENZOPONIK loading">
      <div className="splash__logo-wrap">
        <div className="splash__logo-scale">
          <img
            src="/favicon.png"
            alt="ENZOPONIK"
            className="splash__logo-img"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
