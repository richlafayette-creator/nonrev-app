'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useI18n } from './I18nProvider'

type NavItem = {
  label: string
  href: string
  icon: string
  aliases?: string[]
}

const travelerNavItems: NavItem[] = [
  { label: 'Search', href: '/', icon: '?' },
  { label: 'Saved', href: '/saved-searches', icon: '*' },
  { label: 'Watchlist', href: '/watchlist', icon: 'o' },
  { label: 'Requests', href: '/my-requests', icon: '>' },
  { label: 'Profile', href: '/profile', icon: '@', aliases: ['/account', '/preferences', '/notification-preferences'] }
]

const overflowItems = [
  ['Feedback', '/beta-feedback'],
  ['Onboarding', '/onboarding'],
  ['Account', '/account'],
  ['Notifications', '/notification-preferences']
]

function itemIsActive(pathname: string | null, item: NavItem) {
  if (item.href === '/') return pathname === '/'
  const aliases = item.aliases || []
  return Boolean(pathname?.startsWith(item.href) || aliases.some((alias) => pathname?.startsWith(alias)))
}

export default function AppNavigation() {
  const [open, setOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [message, setMessage] = useState('')
  const pathname = usePathname()
  const shellRef = useRef<HTMLElement | null>(null)
  const { t } = useI18n()

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

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  async function logout() {
    await supabase.auth.signOut()
    setUserEmail('')
    setMessage('Logged out.')
  }

  function renderNavItem(item: NavItem, variant: 'top' | 'mobile') {
    const active = itemIsActive(pathname, item)
    const label = item.label === 'Search' ? t('search') : item.label

    return (
      <a
        key={`${variant}-${item.href}`}
        className={`nonrevy-${variant}-nav__link`}
        href={item.href}
        aria-current={active ? 'page' : undefined}
      >
        <span className={`nonrevy-${variant}-nav__icon`} aria-hidden="true">{item.icon}</span>
        <span>{label}</span>
      </a>
    )
  }

  return (
    <header ref={shellRef} className="nonrevy-global-nav" aria-label="NONREVY traveler navigation">
      <div className="nonrevy-global-nav__bar">
        <a className="nonrevy-global-nav__brand" href="/" aria-label="NONREVY Search">
          <span className="nonrevy-global-nav__brand-text">NONREVY</span>
        </a>

        <nav className="nonrevy-top-nav" aria-label="Primary traveler navigation">
          {travelerNavItems.map((item) => renderNavItem(item, 'top'))}
        </nav>

        <div className="nonrevy-global-nav__actions">
          <button
            className="nonrevy-global-nav__menu-button"
            type="button"
            aria-label={open ? 'Close NONREVY menu' : 'Open NONREVY menu'}
            aria-expanded={open}
            aria-controls="nonrevy-overflow-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden="true">{open ? 'x' : '='}</span>
            <span>Menu</span>
          </button>
        </div>
      </div>

      {open ? (
        <div id="nonrevy-overflow-menu" className="nonrevy-overflow-menu" role="dialog" aria-modal="false" aria-label="NONREVY menu">
          <div className="nonrevy-overflow-menu__account">
            <span>Account</span>
            <strong>{userEmail || 'Guest'}</strong>
            <div>
              {!userEmail ? <a href="/login">Login</a> : <button type="button" onClick={logout}>Logout</button>}
              <a href="/account">Account</a>
            </div>
            {message ? <small>{message}</small> : null}
          </div>

          <nav className="nonrevy-overflow-menu__links" aria-label="Secondary traveler links">
            {overflowItems.map(([label, href]) => (
              <a key={href} href={href} aria-current={pathname?.startsWith(href) ? 'page' : undefined}>{label}</a>
            ))}
          </nav>

          <button className="nonrevy-overflow-menu__close" type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      ) : null}

      <nav className="nonrevy-mobile-nav" aria-label="Mobile traveler navigation">
        {travelerNavItems.map((item) => renderNavItem(item, 'mobile'))}
      </nav>
    </header>
  )
}
