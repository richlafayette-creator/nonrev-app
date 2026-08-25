'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useI18n } from './I18nProvider'
import { accountPersistenceHeaders } from '../lib/accountPersistenceClient'

type NavItem = {
  label: string
  href: string
  icon: 'search' | 'saved' | 'watchlist' | 'requests' | 'profile' | 'verify'
  aliases?: string[]
}

const travelerNavItems: NavItem[] = [
  { label: 'Search', href: '/', icon: 'search' },
  { label: 'Saved', href: '/saved-searches', icon: 'saved' },
  { label: 'Watchlist', href: '/watchlist', icon: 'watchlist' },
  { label: 'Requests', href: '/my-requests', icon: 'requests' },
  { label: 'Profile', href: '/profile', icon: 'profile', aliases: ['/account', '/preferences', '/notification-preferences'] }
]

const overflowItems = [
  ['Feedback', '/beta-feedback'],
  ['Verification', '/verify'],
  ['Onboarding', '/onboarding'],
  ['Account', '/account'],
  ['Notifications', '/notification-preferences']
]

const unverifiedNavItems: NavItem[] = [
  { label: 'Verify', href: '/verify', icon: 'verify', aliases: ['/onboarding'] },
  { label: 'Profile', href: '/profile', icon: 'profile', aliases: ['/account', '/preferences'] },
  { label: 'Billing', href: '/billing', icon: 'saved', aliases: ['/membership', '/credits'] },
  { label: 'Feedback', href: '/beta-feedback', icon: 'requests' }
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
  const [verifiedTraveler, setVerifiedTraveler] = useState(false)
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
    let cancelled = false
    async function loadVerification() {
      try {
        const response = await fetch('/api/employee-verification', {
          headers: await accountPersistenceHeaders(),
          cache: 'no-store'
        })
        if (!response.ok) return
        const data = await response.json() as { verification?: { status?: string } }
        if (!cancelled) setVerifiedTraveler(data.verification?.status === 'verified')
      } catch {
        if (!cancelled) setVerifiedTraveler(false)
      }
    }
    loadVerification()
    return () => {
      cancelled = true
    }
  }, [pathname])

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

  const visibleNavItems = verifiedTraveler ? travelerNavItems : unverifiedNavItems

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
        <span className={`nonrevy-${variant}-nav__icon`} aria-hidden="true"><NavIcon name={item.icon} /></span>
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
          {visibleNavItems.map((item) => renderNavItem(item, 'top'))}
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
            <span aria-hidden="true">{open ? <NavIcon name="close" /> : <NavIcon name="menu" />}</span>
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
        {visibleNavItems.map((item) => renderNavItem(item, 'mobile'))}
      </nav>
    </header>
  )
}

function NavIcon({ name }: { name: NavItem['icon'] | 'menu' | 'close' }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    focusable: 'false' as const,
    'aria-hidden': true
  }

  if (name === 'search') {
    return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" /></svg>
  }
  if (name === 'saved') {
    return <svg {...common}><path d="M6 4h12v16l-6-3-6 3z" /></svg>
  }
  if (name === 'watchlist') {
    return <svg {...common}><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="8" /></svg>
  }
  if (name === 'requests') {
    return <svg {...common}><path d="M9 5h9" /><path d="M9 12h9" /><path d="M9 19h9" /><path d="m4 5 1 1 2-2" /><path d="m4 12 1 1 2-2" /><path d="m4 19 1 1 2-2" /></svg>
  }
  if (name === 'profile') {
    return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
  }
  if (name === 'verify') {
    return <svg {...common}><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-5" /></svg>
  }
  if (name === 'close') {
    return <svg {...common}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
  }
  return <svg {...common}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>
}
