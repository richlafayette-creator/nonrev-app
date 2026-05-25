'use client'

import { type FormEvent, useState } from 'react'

const starterRoutes = [
  { id: 'lax-hnl', label: 'LAX → HNL', cadence: 'Check daily', trigger: 'Alert when score rises above 75' },
  { id: 'sfo-den', label: 'SFO → DEN', cadence: 'Check weekends', trigger: 'Alert if backup frequency drops below 3' }
]

export default function WatchlistPage() {
  const [routes, setRoutes] = useState(starterRoutes)
  const [routeText, setRouteText] = useState('')

  function addRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const label = routeText.trim().toUpperCase().replace(/\s+TO\s+/g, ' → ').replace(/-/g, ' → ')
    if (!label) return

    setRoutes((items) => [
      ...items,
      {
        id: `${label}-${items.length}`,
        label,
        cadence: 'Scaffold cadence',
        trigger: 'Scaffold alert rule pending data integration'
      }
    ])
    setRouteText('')
  }

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/agent" style={{ color: '#a78bfa' }}>Agent</a>
      </nav>

      <section style={{ maxWidth: 960, margin: '0 auto' }}>
        <p style={{ color: '#facc15', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Saved routes scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Route watchlist</h1>
        <p style={{ color: '#94a3b8', fontSize: 18 }}>
          Save routes, define monitoring cadence, and stage alert rules before persistence and notifications are connected.
        </p>

        <form onSubmit={addRoute} style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
          <input
            value={routeText}
            onChange={(event) => setRouteText(event.target.value)}
            placeholder="Add route: LAX-HNL or LAX to HNL"
            style={{ flex: '1 1 280px', padding: 14, borderRadius: 12, border: '1px solid #475569', background: '#0f172a', color: 'white' }}
          />
          <button type="submit" style={{ padding: '14px 18px', borderRadius: 12, border: 'none', background: '#facc15', color: '#020617', fontWeight: 'bold' }}>
            Add watch
          </button>
        </form>

        <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
          {routes.map((route) => (
            <article key={route.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 18, padding: 18 }}>
              <h2 style={{ marginTop: 0 }}>{route.label}</h2>
              <p style={{ color: '#cbd5e1' }}><strong>Cadence:</strong> {route.cadence}</p>
              <p style={{ color: '#cbd5e1' }}><strong>Trigger:</strong> {route.trigger}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
