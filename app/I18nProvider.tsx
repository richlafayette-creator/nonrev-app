'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_LOCALE, isLocale, translateCommon, type CommonTranslationKey, type Locale } from '../lib/i18n/messages'

const LOCALE_STORAGE_KEY = 'nonrevyLocale'

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: CommonTranslationKey) => string
  formatDateTime: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children, locale = DEFAULT_LOCALE }: { children: ReactNode; locale?: string }) {
  const initialLocale = isLocale(locale) ? locale : DEFAULT_LOCALE
  const [selectedLocale, setSelectedLocale] = useState<Locale>(initialLocale)

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isLocale(storedLocale)) setSelectedLocale(storedLocale)
  }, [])

  useEffect(() => {
    document.documentElement.lang = selectedLocale
    window.localStorage.setItem(LOCALE_STORAGE_KEY, selectedLocale)
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
    setLocale: () => undefined,
    t: (key: CommonTranslationKey) => translateCommon(DEFAULT_LOCALE, key),
    formatDateTime: (input: string | number | Date, options?: Intl.DateTimeFormatOptions) => {
      const date = input instanceof Date ? input : new Date(input)
      if (Number.isNaN(date.getTime())) return String(input)
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, options || { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    }
  }
}
