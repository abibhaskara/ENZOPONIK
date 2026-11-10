import { useState } from 'react';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import {
  Leaf,
  Globe,
  ArrowRight,
  ShieldCheck,
  LogIn,
  AlertCircle
} from 'lucide-react';
import './Onboarding.css';

export default function Onboarding() {
  const { googleUser, loginWithGoogle, updateUser } = useUser();
  const { lang, changeLang, t } = useLang();

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  const handleGoogleSignIn = async () => {
    try {
      setAuthLoading(true);
      setAuthError(null);
      await loginWithGoogle();
      // On success, UserContext sets onboarded: true, redirecting directly to Dashboard
    } catch (err) {
      setAuthError(err.message || 'Gagal login dengan Google');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEnterDashboard = () => {
    updateUser({ onboarded: true });
  };

  return (
    <div className="onboard-bg">
      <div className="onboard-container">
        
        {/* Header & Language Selector */}
        <div className="onboard-header">
          <div className="onboard-logo-area">
            <div className="onboard-icon-wrap">
              <Leaf size={18} />
            </div>
            <span className="onboard-logo-text">HARU</span>
          </div>

          <div className="onboard-lang-select">
            <Globe size={14} style={{ color: 'rgba(255,255,255,0.6)' }} />
            <select value={lang} onChange={(e) => changeLang(e.target.value)}>
              <option value="id">Indonesia</option>
              <option value="en">English</option>
              <option value="ban">Basa Bali</option>
            </select>
          </div>
        </div>

        {/* Main Card */}
        <div className="onboard-card glass-card">
          <div className="onboard-card__head">
            <h1 className="onboard-title">
              {t('onboarding_title') || 'Selamat Datang di HARU'}
            </h1>
            <p className="onboard-subtitle">
              Sistem monitoring cerdas hidroponik presisi berbasis IoT & AI.
            </p>
          </div>

          <div className="onboard-content">
            <div className="step-content animate-in">
              {googleUser ? (
                <div className="onboard-auth-connected">
                  <div className="onboard-user-badge">
                    <ShieldCheck size={28} color="#0c5e4a" />
                    <div>
                      <strong>{googleUser.displayName || 'Akun Google Terhubung'}</strong>
                      <p>{googleUser.email}</p>
                    </div>
                  </div>
                  <button
                    className="onboard-btn-next"
                    onClick={handleEnterDashboard}
                    style={{ width: '100%', marginTop: '16px', background: '#0c5e4a' }}
                  >
                    <span>Buka Dashboard</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="onboard-auth-options">
                  <button
                    className="onboard-google-btn"
                    onClick={handleGoogleSignIn}
                    disabled={authLoading}
                  >
                    <LogIn size={18} />
                    <span>{authLoading ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
                  </button>

                  {authError && (
                    <div className="quota-warning" style={{ marginTop: '12px' }}>
                      <AlertCircle size={15} />
                      <span>{authError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
