import en from '../../messages/en.json'
import es from '../../messages/es.json'
import fr from '../../messages/fr.json'
import de from '../../messages/de.json'
import it from '../../messages/it.json'
import pt from '../../messages/pt.json'
import ja from '../../messages/ja.json'
import ko from '../../messages/ko.json'
import zh from '../../messages/zh.json'

export const DEFAULT_LOCALE = 'en' as const
export const localeStorageKey = 'nonrevy.locale.v1'
export const locales = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'] as const

export type Locale = (typeof locales)[number]
export type Messages = typeof en
export type CommonTranslationKey = keyof Messages['common']

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ja: '日本語',
  ko: '한국어',
  zh: '简体中文'
}

export const localeHtmlLang: Record<Locale, string> = {
  en: 'en',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  pt: 'pt',
  ja: 'ja',
  ko: 'ko',
  zh: 'zh-Hans'
}

export const messages: Record<Locale, Messages> = {
  en,
  es,
  fr,
  de,
  it,
  pt,
  ja,
  ko,
  zh
}

export function isLocale(value: string | undefined | null): value is Locale {
  return locales.includes(value as Locale)
}

export function normalizeLocale(value: string | undefined | null): Locale {
  if (!value) return DEFAULT_LOCALE
  const normalized = value.toLowerCase()
  if (isLocale(normalized)) return normalized
  if (normalized.startsWith('zh')) return 'zh'
  const base = normalized.split('-')[0]
  return isLocale(base) ? base : DEFAULT_LOCALE
}

export function translateCommonKey(locale: Locale, key: string) {
  const translated = messages[locale]?.common[key as CommonTranslationKey]
  if (typeof translated === 'string' && translated.trim()) return translated
  const fallback = messages[DEFAULT_LOCALE].common[key as CommonTranslationKey]
  return typeof fallback === 'string' && fallback.trim() ? fallback : ''
}

export function translateCommon(locale: Locale, key: CommonTranslationKey) {
  return translateCommonKey(locale, key)
}
