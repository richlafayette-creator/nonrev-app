'use client'

import { useEffect, useMemo, useState } from 'react'
import { historicalRouteStats, historicalRoutes } from '../../lib/historicalRoutes'
import { supportedCarrierOptions, type SupportedCarrierValue } from '../../lib/carrierScope'
import { loadTripOutcomes, type TripOutcome } from '../../lib/tripOutcomes'

function carrierColor(carrier: string) {
  if (carrier === 'United') return '#38bdf8'
  if (carrier === 'Delta') return '#fb7185'
  return '#34d399'
}

function normalizeRoute(route: string) {
  return route.toUpperCase().replace(/\s*(?:→|->|–|—|-)\s*/g, ' → ').replace(/\s+/g, ' ').trim()
}

function routeMatchesOutcome(outcomeRoute: string, historicalRoute: string) {
  const outcome = normalizeRoute(outcomeRoute)
  const historical = normalizeRoute(historicalRoute)
  return outcome === historical || outcome.includes(historical) || historical.includes(outcome)
}

function routeOutcomeStats(route: string, outcomes: TripOutcome[]) {
  const matches = outcomes.filter((outcome) => routeMatchesOutcome(outcome.route, route))
  const successCount = matches.filter((outcome) => outcome.status === 'Yes, got on').length
  return {
    count: matches.length,
    successCount,
    successRate: matches.length ? Math.round((successCount / matches.length) * 100) : null
  }
}

export default function HistoricalRoutesPage() {
  const [carrier, setCarrier] = useState<SupportedCarrierValue>('all')
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])

  useEffect(() => {
    function refreshOutcomes() {
      setOutcomes(loadTripOutcomes())
    }

    refreshOutcomes()
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshOutcomes)
    window.addEventListener('nonrevy-historical-routes-updated', refreshOutcomes)
    window.addEventListener('storage', refreshOutcomes)
    return () => {
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshOutcomes)
      window.removeEventListener('nonrevy-historical-routes-updated', refreshOutcomes)
      window.removeEventListener('storage', refreshOutcomes)
    }
  }, [])

  const stats = useMemo(() => historicalRouteStats(carrier), [carrier])
  const filteredRoutes = stats.routes
  const localOutcomeCount = filteredRoutes.reduce((total, route) => total + routeOutcomeStats(route.route, outcomes).count, 0)

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/historical-routes" style={{ marginRight: 16, color: '#facc15' }}>Historical Routes</a>
        <a href="/load-reports" style={{ marginRight: 16, color: '#facc15' }}>Load Reports</a>
        <a href="/reputation" style={{ color: '#34d399' }}>Trust</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#facc15', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          Historical route database scaffold
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Historical Routes</h1>
        <p style={{ color: '#94a3b8', maxWidth: 780, fontSize: 18 }}>
          Static placeholder route history for United, Delta, and Alaska Group. These local-only examples can later be replaced by synced outcomes and verified community load reports.
        </p>

        <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', margin: '24px 0' }}>
          <label style={{ display: 'block', color: '#cbd5e1', maxWidth: 420 }}>
            Carrier scope
            <select
              value={carrier}
              onChange={(event) => setCarrier(event.target.value as SupportedCarrierValue)}
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
            >
              {supportedCarrierOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {[
            ['Route Samples', filteredRoutes.length, '#38bdf8'],
            ['Average Score', stats.averageScore, '#facc15'],
            ['Success Rate', `${stats.averageSuccessRate}%`, '#22c55e'],
            ['Report Count', stats.reportCount, '#c084fc'],
            ['Local Outcomes', localOutcomeCount, '#f472b6']
          ].map(([label, value, color]) => (
            <article key={label} className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
              <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
              <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
            </article>
          ))}
        </section>

        <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginBottom: 24 }}>
          <strong style={{ color: '#34d399' }}>Plan score connection</strong>
          <p style={{ color: '#94a3b8' }}>{stats.explanation}</p>
          <p style={{ color: '#cbd5e1', marginBottom: 0 }}>
            The planner references this same static scaffold in its score explanation so route confidence, historical success, community report volume, and reminder-confirmed local outcomes stay aligned.
          </p>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ fontSize: 30, margin: 0 }}>Route history examples</h2>
            <a href="/plan" style={{ color: '#38bdf8' }}>Use in planner</a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
            {filteredRoutes.map((route) => {
              const outcomeStats = routeOutcomeStats(route.route, outcomes)
              return (
              <article key={`${route.carrier}-${route.route}`} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
                <strong style={{ color: carrierColor(route.carrier), textTransform: 'uppercase', letterSpacing: 1 }}>{route.carrier}</strong>
                <h3 style={{ fontSize: 24, margin: '8px 0', color: '#f8fafc' }}>{route.route}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
                  <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>Score</small>
                    <p style={{ margin: '4px 0 0', color: '#facc15', fontWeight: 'bold' }}>{route.score}</p>
                  </div>
                  <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>Success</small>
                    <p style={{ margin: '4px 0 0', color: '#22c55e', fontWeight: 'bold' }}>{route.successRate}%</p>
                  </div>
                  <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>Reports</small>
                    <p style={{ margin: '4px 0 0', color: '#c084fc', fontWeight: 'bold' }}>{route.reportCount}</p>
                  </div>
                  <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>Local Outcomes</small>
                    <p style={{ margin: '4px 0 0', color: '#f472b6', fontWeight: 'bold' }}>{outcomeStats.count}</p>
                  </div>
                  <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>Outcome Success</small>
                    <p style={{ margin: '4px 0 0', color: '#22c55e', fontWeight: 'bold' }}>{outcomeStats.successRate === null ? 'Pending' : `${outcomeStats.successRate}%`}</p>
                  </div>
                </div>
                <p style={{ color: '#cbd5e1', marginBottom: 0 }}>{route.notes}</p>
              </article>
            )})}
          </div>
        </section>

        <section style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a', marginTop: 24 }}>
          <strong style={{ color: '#facc15' }}>Static data note</strong>
          <p style={{ color: '#94a3b8', marginBottom: 0 }}>
            {historicalRoutes.length} local examples are bundled in the app. No backend, scrape, or live availability data is used yet.
          </p>
        </section>
      </section>
    </main>
  )
}
