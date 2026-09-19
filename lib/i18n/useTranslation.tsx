"use client";

import React, { createContext, useContext, useState } from "react";
import en from "./en.json";
import hi from "./hi.json";

type Locale = "en" | "hi";
type Messages = typeof en;

const locales: Record<Locale, Messages> = { en, hi };

interface I18nContextType {
  locale: Locale;
  t: (key: keyof Messages) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  t: (key) => en[key],
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  const t = (key: keyof Messages): string => {
    return locales[locale][key] ?? key;
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
