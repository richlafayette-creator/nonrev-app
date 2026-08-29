'use client'

import { useEffect, useRef, useState } from 'react'
import { localeLabels, locales, type Locale } from '../lib/i18n/messages'
import { useI18n } from './I18nProvider'

export default function LanguageSelector({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const { locale, setLocale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    function handlePointerDown(event: PointerEvent) {
      if (shellRef.current && !shellRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  if (mobile) {
    const currentCode = locale.toUpperCase()

    return (
      <div ref={shellRef} className="nonrevy-mobile-language" data-open={open ? 'true' : 'false'}>
        <button
          className="nonrevy-mobile-language__button"
          type="button"
          aria-label={t('language')}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="nonrevy-mobile-language__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21" />
              <path d="M12 3c-2.2 2.4-3.3 5.4-3.3 9s1.1 6.6 3.3 9" />
            </svg>
          </span>
          <span>{currentCode}</span>
        </button>

        {open ? (
          <div className="nonrevy-mobile-language__sheet" role="listbox" aria-label={t('language')}>
            {locales.map((item) => {
              const selected = item === locale
              return (
                <button
                  key={item}
                  className="nonrevy-mobile-language__option"
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setLocale(item)
                    setOpen(false)
                  }}
                >
                  <span>{localeLabels[item]}</span>
                  <strong>{item.toUpperCase()}</strong>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

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
