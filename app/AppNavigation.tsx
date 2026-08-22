'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useI18n } from './I18nProvider'

const menuItems = [
  ['Search', '/'],
  ['Saved', '/saved-searches'],
  ['Watchlist', '/watchlist'],
  ['My Requests', '/my-requests'],
  ['Profile', '/profile'],
  ['Feedback', '/beta-feedback']
]

const settingsItems = [
  ['Account', '/account'],
  ['Notifications', '/notification-preferences']
]

const betaToolItems = [
  ['Trip outcomes', '/outcomes'],
  ['Route intelligence', '/intelligence'],
  ['Community loads', '/load-reports'],
  ['Load response queue', '/requests']
]

export default function AppNavigation() {
  const [open, setOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [message, setMessage] = useState('')
  const pathname = usePathname()
  const drawerRef = useRef<HTMLElement | null>(null)
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
    setMessage('Logged out.')
  }

  function renderLink([label, href]: string[]) {
    const active = href === '/' ? pathname === href : pathname?.startsWith(href)
    const displayLabel = label === 'search' ? t('search') : label
    return (
      <a key={href} href={href} aria-current={active ? 'page' : undefined}>{displayLabel}</a>
    )
  }

  return (
    <aside ref={drawerRef} className={`app-menu ${open ? 'app-menu--open' : ''}`} aria-label="NONREVY navigation">
      <button
        className="app-menu__summary"
        type="button"
        aria-label={open ? 'Close NONREVY drawer' : 'Open NONREVY drawer'}
        aria-expanded={open}
        aria-controls="app-menu-drawer"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="app-menu__icon" aria-hidden="true">{open ? '×' : '☰'}</span>
        <span className="app-menu__brand">NONREVY</span>
      </button>
      {open ? (
        <div id="app-menu-drawer" className="app-menu__drawer" role="dialog" aria-modal="false" aria-label="NONREVY menu">
          <div className="app-menu__section app-menu__section--account">
            <span className="app-menu__eyebrow">Account</span>
            <strong>{userEmail || 'Guest'}</strong>
            <div className="app-menu__account-actions">
              {!userEmail ? <a href="/login">Login</a> : <button type="button" onClick={logout}>Logout</button>}
              <a href="/account">Account</a>
            </div>
            {message ? <small>{message}</small> : null}
          </div>

          <nav className="app-menu__links" aria-label="Traveler menu links">
            <span className="app-menu__eyebrow">Menu</span>
            {menuItems.map(renderLink)}
          </nav>

          <nav className="app-menu__links" aria-label="Account and settings links">
            <span className="app-menu__eyebrow">Settings</span>
            {settingsItems.map(renderLink)}
          </nav>

          <details className="app-menu__links app-menu__links--beta-tools">
            <summary className="app-menu__eyebrow">Operator tools</summary>
            {betaToolItems.map(renderLink)}
          </details>
        </div>
      ) : null}
    </aside>
  )
}
