import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  LANGUAGES,
  LANG_STORAGE_KEY,
  getStoredLang,
  getHtmlLang,
  translateKey,
} from '../locales/translations';

export { LANGUAGES };

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      localStorage.removeItem('haru_lang');
    } catch {}
    return getStoredLang();
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = getHtmlLang(lang);
    }
  }, [lang]);

  const changeLang = useCallback((newLang) => {
    if (!LANGUAGES.some((l) => l.code === newLang)) return;
    setLang(newLang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, newLang);
    } catch {}
  }, []);

  const t = useCallback(
    (key, fallbackOrParams, fallback) => translateKey(lang, key, fallbackOrParams, fallback),
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, changeLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
