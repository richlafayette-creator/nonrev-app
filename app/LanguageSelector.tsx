'use client'

import { localeLabels, locales, type Locale } from '../lib/i18n/messages'
import { useI18n } from './I18nProvider'

export default function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n()

  return (
    <label className={`nonrevy-language-selector${compact ? ' nonrevy-language-selector--compact' : ''}`}>
      <span>{t('language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t('language')}
      >
        {locales.map((item) => (
          <option key={item} value={item}>{localeLabels[item]}</option>
        ))}
      </select>
    </label>
  )
}
