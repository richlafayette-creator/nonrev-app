'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_LOCALE, localeHtmlLang, localeStorageKey, normalizeLocale, translateCommon, type CommonTranslationKey, type Locale } from '../lib/i18n/messages'

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: CommonTranslationKey) => string
  formatDateTime: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children, locale = DEFAULT_LOCALE }: { children: ReactNode; locale?: string }) {
  const [selectedLocale, setSelectedLocale] = useState<Locale>(() => normalizeLocale(locale))

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(localeStorageKey)
      const next = normalizeLocale(stored || window.navigator.language || selectedLocale)
      setSelectedLocale(next)
    } catch {
      setSelectedLocale(normalizeLocale(locale))
    }
  }, [locale])

  useEffect(() => {
    document.documentElement.lang = localeHtmlLang[selectedLocale] || localeHtmlLang[DEFAULT_LOCALE]
    try {
      window.localStorage.setItem(localeStorageKey, selectedLocale)
    } catch {
      // Browser preference persistence is beta-safe best effort.
    }
  }, [selectedLocale])

  const value = useMemo<I18nContextValue>(() => ({
    locale: selectedLocale,
    setLocale: setSelectedLocale,
    t: (key) => translateCommon(selectedLocale, key),
    formatDateTime: (input, options = { dateStyle: 'medium', timeStyle: 'short' }) => {
      const date = input instanceof Date ? input : new Date(input)
      if (Number.isNaN(date.getTime())) return String(input)
      return new Intl.DateTimeFormat(selectedLocale, options).format(date)
    }
  }), [selectedLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (value) return value

  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    t: (key: CommonTranslationKey) => translateCommon(DEFAULT_LOCALE, key),
    formatDateTime: (input: string | number | Date, options?: Intl.DateTimeFormatOptions) => {
      const date = input instanceof Date ? input : new Date(input)
      if (Number.isNaN(date.getTime())) return String(input)
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, options || { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    }
  }
}
