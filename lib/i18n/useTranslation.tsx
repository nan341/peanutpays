'use client';

import React, { createContext, useContext, useState } from 'react';
import en from './en.json';
import hi from './hi.json';

type Locale = 'en' | 'hi';
type Messages = typeof en;

const locales: Record<Locale, Messages> = { en, hi };

interface I18nContextType {
  locale: Locale;
  t: (key: keyof Messages, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  t: (key) => en[key],
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');

  const t = (key: keyof Messages, vars?: Record<string, string | number>): string => {
    let str = locales[locale]?.[key] ?? en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  };

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
