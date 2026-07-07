'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { locales, type CommonTranslationKey, type Locale } from '../lib/i18n/messages'
import { useI18n } from './I18nProvider'

const menuItems = [
  { labelKey: 'home', href: '/' },
  { labelKey: 'search', href: '/results' },
  { labelKey: 'plan', href: '/plan' }
] satisfies { labelKey: CommonTranslationKey; href: string }[]

const drawerItems = [
  { labelKey: 'watchlist', href: '/watchlist' },
  { labelKey: 'alerts', href: '/alerts' },
  { labelKey: 'trips', href: '/outcomes' },
  { labelKey: 'community', href: '/load-reports' },
  { labelKey: 'routeIntelligence', href: '/intelligence' },
  { labelKey: 'settings', href: '/notification-preferences' },
  { labelKey: 'aiSearch', href: '/agent' },
  { labelKey: 'betaFeedback', href: '/beta-feedback' },
  { labelKey: 'savedSearches', href: '/saved-searches' },
  { labelKey: 'profile', href: '/profile' },
  { labelKey: 'account', href: '/account' }
] satisfies { labelKey: CommonTranslationKey; href: string }[]

const localeLabelKeys: Record<Locale, CommonTranslationKey> = {
  en: 'english',
  es: 'spanish',
  ja: 'japanese'
}

export default function AppNavigation() {
  const [open, setOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [message, setMessage] = useState('')
  const pathname = usePathname()
  const drawerRef = useRef<HTMLElement | null>(null)
  const { locale, setLocale, t } = useI18n()

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser()
      setUserEmail(data.user?.email || '')
    }

    loadUser()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || '')
      setMessage('')
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    function handlePointerDown(event: PointerEvent) {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
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

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  async function logout() {
    await supabase.auth.signOut()
    setUserEmail('')
    setMessage(t('loggedOut'))
  }

  function renderLink({ labelKey, href }: { labelKey: CommonTranslationKey; href: string }) {
    const active = href === '/' ? pathname === href : pathname?.startsWith(href)
    return (
      <a key={href} href={href} aria-current={active ? 'page' : undefined}>{t(labelKey)}</a>
    )
  }

  return (
    <aside ref={drawerRef} className={`app-menu ${open ? 'app-menu--open' : ''}`} aria-label={t('navigation')}>
      <button
        className="app-menu__summary"
        type="button"
        aria-label={open ? t('closeDrawer') : t('openDrawer')}
        aria-expanded={open}
        aria-controls="app-menu-drawer"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="app-menu__icon" aria-hidden="true">{open ? '×' : '☰'}</span>
        <span className="app-menu__brand">NONREVY</span>
      </button>
      {open ? (
        <div id="app-menu-drawer" className="app-menu__drawer" role="dialog" aria-modal="false" aria-label={t('nonrevyMenu')}>
          <div className="app-menu__section app-menu__section--account">
            <span className="app-menu__eyebrow">{t('account')}</span>
            <strong>{userEmail || t('guest')}</strong>
            <div className="app-menu__account-actions">
              {!userEmail ? <a href="/login">{t('login')}</a> : <button type="button" onClick={logout}>{t('logout')}</button>}
              <a href="/account">{t('account')}</a>
            </div>
            {message ? <small>{message}</small> : null}
          </div>

          <label className="app-menu__section app-menu__section--locale">
            <span className="app-menu__eyebrow">{t('language')}</span>
            <select value={locale} aria-label={t('language')} onChange={(event) => setLocale(event.target.value as Locale)}>
              {locales.map((supportedLocale) => (
                <option key={supportedLocale} value={supportedLocale}>{t(localeLabelKeys[supportedLocale])}</option>
              ))}
            </select>
          </label>

          <nav className="app-menu__links" aria-label={t('menuLinks')}>
            <span className="app-menu__eyebrow">{t('menu')}</span>
            {menuItems.map(renderLink)}
          </nav>

          <nav className="app-menu__links" aria-label={t('accountSettingsLinks')}>
            <span className="app-menu__eyebrow">{t('tools')}</span>
            {drawerItems.map(renderLink)}
          </nav>
        </div>
      ) : null}
    </aside>
  )
}
