import en from '../../messages/en.json'
import es from '../../messages/es.json'
import ja from '../../messages/ja.json'

export const DEFAULT_LOCALE = 'en' as const
export const locales = ['en', 'es', 'ja'] as const

export type Locale = (typeof locales)[number]
export type Messages = typeof en
export type CommonTranslationKey = keyof Messages['common']

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  ja: '日本語'
}

export const messages: Record<Locale, Messages> = {
  en,
  es,
  ja
}

export function isLocale(value: string | undefined | null): value is Locale {
  return locales.includes(value as Locale)
}

export function translateCommon(locale: Locale, key: CommonTranslationKey) {
  return messages[locale]?.common[key] || messages[DEFAULT_LOCALE].common[key] || key
}
