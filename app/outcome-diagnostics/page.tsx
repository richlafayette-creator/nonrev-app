'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadTripOutcomes, outcomeHealthDiagnostics, syncOutcomeRepository, tripOutcomeStats, type TripOutcome } from '../../lib/tripOutcomes'

function statusColor(status: string) {
  if (status === 'synced') return 'var(--color-green-500)'
  if (status === 'syncing') return 'var(--color-sky-400)'
  if (status === 'error') return 'var(--color-red-400)'
  if (status === 'fallback') return 'var(--color-yellow-400)'
  return 'var(--color-slate-400)'
}

function formatDate(value?: string) {
  if (!value) return 'Not synced yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export default function OutcomeDiagnosticsPage() {
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])
  const [status, setStatus] = useState('Ready to inspect outcome persistence.')
  const [syncing, setSyncing] = useState(false)

  function refreshOutcomes() {
    setOutcomes(loadTripOutcomes())
  }

  useEffect(() => {
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

  const health = useMemo(() => outcomeHealthDiagnostics(), [outcomes])
  const stats = useMemo(() => tripOutcomeStats(outcomes), [outcomes])
  const recentOutcomes = outcomes.slice(0, 10)

  async function runSync() {
    setSyncing(true)
    setStatus('Syncing outcome repository...')
    const diagnostics = await syncOutcomeRepository({ reason: 'manual' })
    refreshOutcomes()
    setStatus(diagnostics.lastSyncStatus === 'synced' ? 'Outcome repository sync completed.' : diagnostics.detail)
    setSyncing(false)
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/outcomes" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Outcomes</a>
        <a href="/intelligence" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Intelligence</a>
        <a href="/data-health" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Data Health</a>
        <a href="/outcome-diagnostics" style={{ color: 'var(--color-green-400)' }}>Outcome Diagnostics</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-green-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Outcome persistence diagnostics</p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Outcome health</h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 860, fontSize: 18 }}>
          Inspect local fallback, database mirror state, local-to-database migration progress, and whether stored outcomes are feeding success probability, route confidence, and community intelligence.
        </p>

        <section style={{ border: `1px solid ${statusColor(health.lastSyncStatus)}`, borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong style={{ color: statusColor(health.lastSyncStatus), textTransform: 'uppercase' }}>{health.lastSyncStatus}</strong>
              <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{health.detail}</p>
              {health.lastError && <p style={{ color: 'var(--color-red-400)', marginBottom: 0 }}>Last error: {health.lastError}</p>}
            </div>
            <button type="button" onClick={runSync} disabled={syncing} style={{ border: 'none', borderRadius: 12, padding: '12px 15px', background: syncing ? 'var(--color-slate-600)' : 'var(--color-green-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
              {syncing ? 'Syncing...' : 'Run sync now'}
            </button>
          </div>
          <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>{status} Last sync: {formatDate(health.lastSyncAt)}.</p>
        </section>

        <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {([
            ['Merged outcomes', health.mergedOutcomeCount, 'var(--color-sky-400)'],
            ['Local fallback', health.localOutcomeCount, 'var(--color-orange-500)'],
            ['Database mirror', health.databaseOutcomeCount, 'var(--color-green-400)'],
            ['Pending migration', health.migrationPendingCount, 'var(--color-yellow-400)'],
            ['Probability eligible', health.probabilityOutcomeCount, 'var(--color-green-500)'],
            ['Success rate', `${stats.successRate}%`, 'var(--color-purple-400)']
          ] as const).map(([label, value, color]) => (
            <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
              <strong style={{ color, fontSize: 32 }}>{value}</strong>
              <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
            </article>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 24 }}>
          {([
            ['Success probability', health.successProbabilityReady, `${health.probabilityOutcomeCount} non-cancelled outcome${health.probabilityOutcomeCount === 1 ? '' : 's'} available to calibrate probability.`],
            ['Route confidence', health.routeConfidenceReady, `${health.mergedOutcomeCount} stored outcome${health.mergedOutcomeCount === 1 ? '' : 's'} available to adjust route confidence triggers.`],
            ['Community intelligence', health.communityIntelligenceReady, `${health.successful} success and ${health.failed} failure outcome${health.successful + health.failed === 1 ? '' : 's'} available for community route signals.`]
          ] as const).map(([label, ready, detail]) => (
            <article key={label as string} style={{ border: `1px solid ${ready ? 'var(--color-green-500)' : 'var(--color-slate-700)'}`, borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
              <strong style={{ color: ready ? 'var(--color-green-500)' : 'var(--color-slate-400)' }}>{ready ? 'Connected' : 'Waiting for outcomes'}</strong>
              <h2 style={{ margin: '6px 0', fontSize: 22 }}>{label}</h2>
              <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{detail}</p>
            </article>
          ))}
        </section>

        <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)' }}>
          <h2 style={{ marginTop: 0 }}>Recent stored outcomes</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {recentOutcomes.length === 0 && <p style={{ color: 'var(--color-slate-400)' }}>No outcomes have been recorded yet.</p>}
            {recentOutcomes.map((outcome) => (
              <article key={outcome.id} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 16, padding: 14, background: 'var(--color-slate-950)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{outcome.title}</h3>
                    <p style={{ color: 'var(--color-sky-400)', margin: '6px 0', fontWeight: 'bold' }}>{outcome.route}</p>
                    <small style={{ color: 'var(--color-slate-400)' }}>{new Date(outcome.createdAt).toLocaleString()} · {outcome.source}</small>
                  </div>
                  <strong style={{ color: outcome.status === 'Yes, got on' ? 'var(--color-green-500)' : outcome.status === 'Cancelled trip' ? 'var(--color-yellow-400)' : 'var(--color-red-400)' }}>{outcome.status}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
