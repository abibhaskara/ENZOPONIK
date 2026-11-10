import { createContext, useContext, useState, useCallback } from 'react';
import { LANGUAGES, translations } from '../locales/translations';

export { LANGUAGES };

const LANG_KEY = 'manik_lang';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY) || localStorage.getItem('haru_lang');
      return LANGUAGES.some(l => l.code === stored) ? stored : 'en';
    } catch {
      return 'en';
    }
  });

  const changeLang = useCallback((newLang) => {
    setLang(newLang);
    localStorage.setItem(LANG_KEY, newLang);
  }, []);

  const t = useCallback((key, fallback) => {
    return translations[lang]?.[key] || translations.en[key] || fallback || key;
  }, [lang]);

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
