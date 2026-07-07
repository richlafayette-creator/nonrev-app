'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadTravelerProfileFromStorage, type TravelerProfileScaffold } from '../../lib/travelerProfile'
import { loadTripOutcomes, outcomeRepositoryDiagnostics, syncOutcomeRepository, tripOutcomeStats, type TripOutcome } from '../../lib/tripOutcomes'

function outcomeColor(status: string) {
  if (status === 'Yes, got on') return 'var(--color-green-500)'
  if (status === 'Cancelled trip') return 'var(--color-yellow-400)'
  return 'var(--color-red-400)'
}

export default function OutcomesPage() {
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])
  const [profile, setProfile] = useState<TravelerProfileScaffold | null>(null)
  const [syncStatus, setSyncStatus] = useState('Outcome repository ready.')

  useEffect(() => {
    function refreshOutcomes() {
      setOutcomes(loadTripOutcomes())
      setProfile(loadTravelerProfileFromStorage())
    }

    refreshOutcomes()
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshOutcomes)
    window.addEventListener('nonrevy-trip-outcome-health-updated', refreshOutcomes)
    window.addEventListener('storage', refreshOutcomes)
    return () => {
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshOutcomes)
      window.removeEventListener('nonrevy-trip-outcome-health-updated', refreshOutcomes)
      window.removeEventListener('storage', refreshOutcomes)
    }
  }, [])

  const stats = useMemo(() => tripOutcomeStats(outcomes), [outcomes])
  const repository = useMemo(() => outcomeRepositoryDiagnostics(), [outcomes])
  const recentOutcomes = outcomes.slice(0, 12)

  async function syncOutcomes() {
    setSyncStatus('Syncing outcome repository...')
    const diagnostics = await syncOutcomeRepository({ reason: 'manual' })
    setOutcomes(loadTripOutcomes())
    setSyncStatus(diagnostics.lastSyncStatus === 'synced' ? 'Outcome sync complete.' : diagnostics.detail)
  }
  const statCards: { label: string; value: string | number; color: string }[] = [
    { label: 'Total Trips', value: stats.outcomeCount, color: 'var(--color-sky-400)' },
    { label: 'Successful Trips', value: stats.successCount, color: 'var(--color-green-500)' },
    { label: 'Success Rate', value: `${stats.successRate}%`, color: 'var(--color-yellow-400)' },
    { label: 'Cancelled Trips', value: stats.cancelledCount, color: 'var(--color-purple-400)' },
    { label: 'Local Outcomes', value: stats.localOutcomeCount, color: 'var(--color-orange-500)' },
    { label: 'Database Outcomes', value: stats.databaseOutcomeCount, color: 'var(--color-green-400)' }
  ]

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Profile</a>
        <a href="/best-routes" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Best Routes</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/credits" style={{ marginRight: 16, color: 'var(--color-amber-400)' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: 'var(--color-green-400)' }}>Trust</a>
        <a href="/load-reports" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Load Reports</a>
        <a href="/requests" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Open Requests</a>
        <a href="/reminders" style={{ marginRight: 16, color: 'var(--color-pink-400)' }}>Reminders</a>
        <a href="/outcomes" style={{ color: 'var(--color-green-500)' }}>Outcomes</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-green-500)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          Outcome history dashboard
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Trip outcomes</h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 760, fontSize: 18 }}>
          Outcome history from route recommendations and saved itineraries, backed by database-ready persistence with local fallback and migration diagnostics.
        </p>

        <section style={{ border: `1px solid ${repository.activeSource === 'Database' ? 'var(--color-green-500)' : 'var(--color-yellow-400)'}`, borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong style={{ color: repository.activeSource === 'Database' ? 'var(--color-green-500)' : 'var(--color-yellow-400)' }}>Outcome source: {repository.activeSource}</strong>
              <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{repository.detail}</p>
              <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>{syncStatus}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={syncOutcomes} style={{ border: 'none', borderRadius: 12, padding: '11px 14px', background: 'var(--color-green-500)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>Sync outcomes</button>
              <a href="/outcome-diagnostics" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 12, padding: '10px 14px', color: 'var(--color-sky-400)', textDecoration: 'none', fontWeight: 'bold' }}>Diagnostics</a>
            </div>
          </div>
        </section>

        <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {statCards.map((card) => (
            <article key={card.label} className="mini-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
              <strong style={{ color: card.color, fontSize: 34 }}>{card.value}</strong>
              <h2 style={{ fontSize: 18, marginBottom: 0 }}>{card.label}</h2>
            </article>
          ))}
        </section>

        <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginBottom: 24 }}>
          <strong style={{ color: 'var(--color-green-400)' }}>Traveler profile connection</strong>
          <p style={{ color: 'var(--color-slate-400)' }}>
            Each new outcome stores a traveler profile snapshot so future database sync and community probability calibration can understand who was traveling.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            {[
              ['Employee airline', profile?.employeeAirline || 'Profile pending'],
              ['Traveler type', profile?.travelerType || 'Profile pending'],
              ['Pass priority', profile?.passPriority || 'Profile pending'],
              ['Home airport', profile?.homeAirport || 'Profile pending']
            ].map(([label, value]) => (
              <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)' }}>
                <small style={{ color: 'var(--color-slate-400)' }}>{label}</small>
                <h3 style={{ color: 'var(--color-slate-50)', margin: '6px 0 0' }}>{value}</h3>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ fontSize: 30, margin: 0 }}>Recent Outcomes</h2>
            <a href="/reminders" style={{ color: 'var(--color-sky-400)' }}>Open reminders</a>
          </div>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {recentOutcomes.length === 0 && (
              <article className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                <h3 style={{ marginTop: 0 }}>No outcomes yet</h3>
                <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>
                  Open a route recommendation or smart-ranked itinerary on the planner and use the “Did you get on?” workflow.
                </p>
              </article>
            )}
            {recentOutcomes.map((outcome) => (
              <article key={outcome.id} className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{outcome.title}</h3>
                    <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', margin: '6px 0' }}>{outcome.route}</p>
                    <small style={{ color: 'var(--color-slate-400)' }}>{outcome.subjectType.replace('-', ' ')} · {new Date(outcome.timestamp || outcome.createdAt).toLocaleString()}</small>
                    <p style={{ color: outcome.source === 'Database' ? 'var(--color-green-500)' : 'var(--color-yellow-400)', margin: '6px 0 0' }}>Source: {outcome.source}</p>
                    <p style={{ color: 'var(--color-slate-500)', margin: '4px 0 0' }}>
                      Snapshot: {outcome.travelerProfileSnapshot.employeeAirline} · {outcome.travelerProfileSnapshot.travelerType} · {outcome.travelerProfileSnapshot.passPriority}
                    </p>
                  </div>
                  <strong style={{ color: outcomeColor(outcome.status) }}>{outcome.status}</strong>
                </div>
                {outcome.notes && <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>{outcome.notes}</p>}
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
