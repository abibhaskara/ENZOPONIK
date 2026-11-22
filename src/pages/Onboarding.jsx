import { useState, useRef } from 'react';
import { ChevronLeft, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useLang } from '../context/LanguageContext';
import { resetAccountPassword } from '../lib/authService';
import './Onboarding.css';

const REMEMBER_EMAIL_KEY = 'enzoponik_remember_email';

function FieldIcon({ kind }) {
  if (kind === 'user') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="auth-field__icon" aria-hidden="true">
        <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2.25c-4.41 0-8 2.46-8 5.5 0 .69.56 1.25 1.25 1.25h13.5c.69 0 1.25-.56 1.25-1.25 0-3.04-3.59-5.5-8-5.5Z" />
      </svg>
    );
  }
  if (kind === 'mail') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="auth-field__icon" aria-hidden="true">
        <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z" />
        <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="auth-field__icon" aria-hidden="true">
      <path d="M17 9h-1V7a4 4 0 1 0-8 0v2H7a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-7a3 3 0 0 0-3-3Zm-7-2a2 2 0 1 1 4 0v2h-4V7Zm3 8.73V17a1 1 0 1 1-2 0v-1.27a2 2 0 1 1 2 0Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.3 0 6.08-1.09 8.105-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.225 1.18-3.25 0-6.01-2.19-6.995-5.14H1.01v3.14C3.05 21.22 7.21 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.005 14.03a7.17 7.17 0 0 1 0-4.06V6.83H1.01a12.01 12.01 0 0 0 0 10.34l3.995-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.83c1.8 0 3.41.62 4.68 1.83l3.51-3.51C18.075 1.19 15.295 0 12 0 7.21 0 3.05 2.78 1.01 6.83l3.995 3.14c.985-2.95 3.745-5.14 6.995-5.14Z"
      />
    </svg>
  );
}

export default function Onboarding() {
  const { loginWithGoogle, loginWithEmailAccount, registerWithEmailAccount } = useUser();
  const { t } = useLang();

  const [view, setView] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_EMAIL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotLocalMode, setForgotLocalMode] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return Boolean(localStorage.getItem(REMEMBER_EMAIL_KEY));
    } catch {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const confirmRef = useRef(null);
  const copy = {
    title: t(`auth_${view}_title`),
    subtitle: t(`auth_${view}_sub`),
    submitLabel: t(`auth_${view}_btn`),
    loadingLabel: t(`auth_${view}_loading`),
  };

  const switchView = (nextView) => {
    setView(nextView);
    setError(null);
    setNotice(null);
    setForgotLocalMode(false);
    setPassword('');
    setConfirmPassword('');
    setNewPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleBack = () => {
    if (view !== 'login') {
      switchView('login');
      return;
    }
    setError(null);
    setNotice(null);
  };

  const persistRememberPreference = (cleanEmail) => {
    try {
      if (rememberMe && cleanEmail) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, cleanEmail);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
    } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (view === 'signup' && password !== confirmPassword) {
      setError(t('auth_password_mismatch'));
      confirmRef.current?.focus();
      return;
    }

    try {
      setLoading(true);
      const cleanEmail = email.trim();

      if (view === 'login') {
        persistRememberPreference(cleanEmail);
        await loginWithEmailAccount(cleanEmail, password);
      } else if (view === 'signup') {
        await registerWithEmailAccount(name, cleanEmail, password);
      } else {
        const res = await resetAccountPassword(cleanEmail, forgotLocalMode ? newPassword : null);
        if (res.mode === 'email_sent') {
          setNotice(t('auth_reset_link_sent', { email: cleanEmail }));
        } else if (res.mode === 'local_updated') {
          setNotice(t('auth_password_updated'));
          setForgotLocalMode(false);
          setNewPassword('');
        } else {
          setForgotLocalMode(true);
          setNotice(t('auth_enter_new_password'));
        }
      }
    } catch (err) {
      setError(err?.message || t('auth_request_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      setLoading(true);
      setError(null);
      setNotice(null);
      await loginWithGoogle();
    } catch (err) {
      setError(err?.message || t('auth_google_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-screen">
      <div className="auth-shell">
        <div className="auth-topbar">
          <button
            type="button"
            className="auth-back-btn"
            onClick={handleBack}
            aria-label={t('back')}
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
        </div>

        <header className="auth-header">
          <h1 id="auth-heading" className="auth-title">{copy.title}</h1>
          <p className="auth-subtitle">{copy.subtitle}</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit} aria-labelledby="auth-heading">
          {view === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-name" className="visually-hidden">{t('auth_name_placeholder')}</label>
              <FieldIcon kind="user" />
              <input
                id="auth-name"
                name="name"
                type="text"
                autoComplete="name"
                enterKeyHint="next"
                placeholder={t('auth_name_placeholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email" className="visually-hidden">{t('auth_email_placeholder')}</label>
            <FieldIcon kind="mail" />
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="username"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              enterKeyHint={view === 'forgot' && !forgotLocalMode ? 'done' : 'next'}
              placeholder={t('auth_email_placeholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {(view === 'login' || view === 'signup') && (
            <div className="auth-field">
              <label htmlFor="auth-password" className="visually-hidden">{t('auth_password_placeholder')}</label>
              <FieldIcon kind="lock" />
              <input
                id="auth-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                enterKeyHint={view === 'signup' ? 'next' : 'done'}
                minLength={6}
                placeholder={t('auth_password_placeholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? t('hide_password') : t('show_password')}
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          )}

          {view === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-confirm-password" className="visually-hidden">{t('auth_confirm_password_placeholder')}</label>
              <FieldIcon kind="lock" />
              <input
                ref={confirmRef}
                id="auth-confirm-password"
                name="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                enterKeyHint="done"
                minLength={6}
                placeholder={t('auth_confirm_password_placeholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-pressed={showConfirmPassword}
                aria-label={showConfirmPassword ? t('hide_password') : t('show_password')}
              >
                {showConfirmPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          )}

          {view === 'forgot' && forgotLocalMode && (
            <div className="auth-field">
              <label htmlFor="auth-new-password" className="visually-hidden">{t('auth_new_password_placeholder')}</label>
              <FieldIcon kind="lock" />
              <input
                id="auth-new-password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                enterKeyHint="done"
                minLength={6}
                placeholder={t('auth_new_password_placeholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? t('hide_password') : t('show_password')}
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          )}

          {view === 'login' && (
            <div className="auth-options-row">
              <label htmlFor="remember-me" className="auth-remember">
                <input
                  id="remember-me"
                  name="remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>{t('auth_remember_me')}</span>
              </label>
              <button
                type="button"
                className="auth-link-muted"
                onClick={() => switchView('forgot')}
              >
                {t('auth_forgot_link')}
              </button>
            </div>
          )}

          {error && (
            <div className="auth-feedback auth-feedback--error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="auth-feedback auth-feedback--success" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? copy.loadingLabel : copy.submitLabel}
          </button>
        </form>

        {view !== 'forgot' && (
          <>
            <p className="auth-switch-text">
              {view === 'login' ? (
                <>
                  {t('auth_no_account')}{' '}
                  <button type="button" className="auth-switch-link" onClick={() => switchView('signup')}>
                    {t('auth_signup_link')}
                  </button>
                </>
              ) : (
                <>
                  {t('auth_has_account')}{' '}
                  <button type="button" className="auth-switch-link" onClick={() => switchView('login')}>
                    {t('auth_signin_link')}
                  </button>
                </>
              )}
            </p>

            <div className="auth-divider" aria-hidden="true" />

            <p className="auth-social-label">{t('auth_or_continue')}</p>

            <div className="auth-social-row">
              <button
                type="button"
                className="auth-social-btn"
                onClick={handleGoogleAuth}
                disabled={loading}
                aria-label="Continue with Google"
              >
                <GoogleIcon />
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
