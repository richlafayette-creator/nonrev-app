'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'

const navItems = [
  ['Home', '/'],
  ['Plan', '/plan'],
  ['Profile', '/profile'],
  ['Best Routes', '/best-routes'],
  ['Historical Routes', '/historical-routes'],
  ['Intelligence', '/intelligence'],
  ['Watchlist', '/watchlist'],
  ['Credits', '/credits'],
  ['Trust', '/reputation'],
  ['Load Reports', '/load-reports'],
  ['Notifications', '/notifications'],
  ['Notification History', '/notification-history'],
  ['Notification Diagnostics', '/notification-diagnostics'],
  ['Alerts', '/alerts'],
  ['Reminders', '/reminders'],
  ['Agent', '/agent'],
  ['Open Requests', '/requests'],
  ['My Requests', '/my-requests'],
  ['Outcomes', '/outcomes'],
  ['Outcome Diagnostics', '/outcome-diagnostics']
]

export default function AppNavigation() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <aside className="app-menu" aria-label="Main navigation">
      <button
        className="app-menu__summary"
        type="button"
        aria-expanded={open}
        aria-controls="app-menu-links"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="app-menu__brand">NONREVY</span>
        <span className="app-menu__route">Menu</span>
      </button>
      {open && (
        <nav id="app-menu-links" className="app-menu__links">
          {navItems.map(([label, href]) => {
            const active = href === '/' ? pathname === href : pathname?.startsWith(href)
            return (
              <a key={href} href={href} aria-current={active ? 'page' : undefined}>{label}</a>
            )
          })}
        </nav>
      )}
    </aside>
  )
}
