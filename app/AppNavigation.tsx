'use client'

import { useState } from 'react'

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

  return (
    <aside className="app-menu" aria-label="Main navigation">
      <button
        className="app-menu__summary"
        type="button"
        aria-expanded={open}
        aria-controls="app-menu-links"
        onClick={() => setOpen((value) => !value)}
      >
        <span>Menu</span>
      </button>
      {open && (
        <nav id="app-menu-links" className="app-menu__links">
          {navItems.map(([label, href]) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </nav>
      )}
    </aside>
  )
}
