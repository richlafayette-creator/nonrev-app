'use client'

import { useMemo, useState } from 'react'
import { historicalRouteStats, historicalRoutes } from '../../lib/historicalRoutes'
import { supportedCarrierOptions, type SupportedCarrierValue } from '../../lib/carrierScope'

function carrierColor(carrier: string) {
  if (carrier === 'United') return '#38bdf8'
  if (carrier === 'Delta') return '#fb7185'
  return '#34d399'
}

export default function HistoricalRoutesPage() {
  const [carrier, setCarrier] = useState<SupportedCarrierValue>('all')
  const stats = useMemo(() => historicalRouteStats(carrier), [carrier])
  const filteredRoutes = stats.routes

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
            ['Report Count', stats.reportCount, '#c084fc']
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
            The planner references this same static scaffold in its score explanation so route confidence, historical success, and community report volume stay aligned.
          </p>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ fontSize: 30, margin: 0 }}>Route history examples</h2>
            <a href="/plan" style={{ color: '#38bdf8' }}>Use in planner</a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
            {filteredRoutes.map((route) => (
              <article key={`${route.carrier}-${route.route}`} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
                <strong style={{ color: carrierColor(route.carrier), textTransform: 'uppercase', letterSpacing: 1 }}>{route.carrier}</strong>
                <h3 style={{ fontSize: 24, margin: '8px 0', color: '#f8fafc' }}>{route.route}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
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
                </div>
                <p style={{ color: '#cbd5e1', marginBottom: 0 }}>{route.notes}</p>
              </article>
            ))}
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
