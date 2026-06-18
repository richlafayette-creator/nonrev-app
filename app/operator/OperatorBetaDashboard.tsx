'use client'

import { useEffect, useMemo, useState } from 'react'

type ProviderStatus = 'Ready' | 'Warning' | 'Missing'
type LoadState = 'loading' | 'ready' | 'error'

type ProviderReadinessRow = {
  provider?: string
  status?: ProviderStatus
  missingEnvironmentVariables?: string[]
  fallbackBehavior?: string
  rateLimits?: string
}

type HealthCheckRow = {
  key?: string
  label?: string
  status?: string
  detail?: string
  recommendedFix?: string
  safeErrorMessage?: string
}

type FlightFreshnessColumn = {
  column?: string
  status?: string
  detail?: string
}

type FlightFreshnessSchema = {
  status?: string
  fallbackMode?: string
  detail?: string
  recommendedNextAction?: string
  columns?: FlightFreshnessColumn[]
}

type HealthResponse = {
  checkedAt?: string
  providerReadiness?: ProviderReadinessRow[]
  checks?: HealthCheckRow[]
  flightFreshnessSchema?: FlightFreshnessSchema
  liveItineraryReadiness?: {
    status?: string
    activeDataMode?: string
    trueLiveAvailabilityMessage?: string
  }
}

type CountResponse = {
  records?: unknown[]
  outcomes?: unknown[]
  reports?: unknown[]
  watches?: unknown[]
  alerts?: unknown[]
  count?: number
  storageMode?: string
  status?: string
  detail?: string
}

type CountCard = {
  label: string
  value: number | string
  status: string
  detail: string
}

type OperatorSnapshot = {
  health: HealthResponse | null
  betaFeedback: CountResponse | null
  outcomes: CountResponse | null
  communityLoads: CountResponse | null
  watchlist: CountResponse | null
  alerts: CountResponse | null
}

const emptySnapshot: OperatorSnapshot = {
  health: null,
  betaFeedback: null,
  outcomes: null,
  communityLoads: null,
  watchlist: null,
  alerts: null
}

function arrayCount(value: unknown[] | undefined, fallback?: number) {
  if (Array.isArray(value)) return value.length
  return typeof fallback === 'number' ? fallback : 0
}

function statusTone(status = '') {
  const normalized = status.toLowerCase()
  if (['ready', 'connected', 'present', 'supabase'].some((value) => normalized.includes(value))) return '#86efac'
  if (['missing', 'blocked', 'error', 'unreachable'].some((value) => normalized.includes(value))) return '#fca5a5'
  return '#facc15'
}

function formatCheckedAt(value?: string) {
  if (!value) return 'Not checked yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  return response.json() as Promise<T>
}

function countStatus(response: CountResponse | null) {
  if (!response) return 'unavailable'
  return response.status || response.storageMode || 'readable'
}

function countDetail(response: CountResponse | null) {
  if (!response) return 'API could not be read during this snapshot.'
  return response.detail || `Storage mode: ${response.storageMode || 'not reported'}.`
}

function quietCardStyle() {
  return {
    border: '1px solid #1e293b',
    borderRadius: 18,
    background: '#0f172a',
    padding: 16
  }
}

function rowStyle() {
  return {
    borderTop: '1px solid #1e293b',
    padding: '12px 0'
  }
}

export default function OperatorBetaDashboard({ buildVersion, commitHash }: { buildVersion: string; commitHash: string }) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [snapshot, setSnapshot] = useState<OperatorSnapshot>(emptySnapshot)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadState('loading')
      setError('')
      try {
        const [health, betaFeedback, outcomes, communityLoads, watchlist, alerts] = await Promise.all([
          fetchJson<HealthResponse>('/api/data-health'),
          fetchJson<CountResponse>('/api/beta-feedback'),
          fetchJson<CountResponse>('/api/outcomes'),
          fetchJson<CountResponse>('/api/community-loads'),
          fetchJson<CountResponse>('/api/watchlist'),
          fetchJson<CountResponse>('/api/alerts')
        ])
        if (!cancelled) {
          setSnapshot({ health, betaFeedback, outcomes, communityLoads, watchlist, alerts })
          setLoadState('ready')
        }
      } catch (loadError) {
        if (!cancelled) {
          setLoadState('error')
          setError(loadError instanceof Error ? loadError.message : 'Operator snapshot failed to load.')
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const counts = useMemo<CountCard[]>(() => [
    {
      label: 'Beta feedback',
      value: arrayCount(snapshot.betaFeedback?.records),
      status: countStatus(snapshot.betaFeedback),
      detail: countDetail(snapshot.betaFeedback)
    },
    {
      label: 'Outcomes',
      value: arrayCount(snapshot.outcomes?.outcomes),
      status: countStatus(snapshot.outcomes),
      detail: countDetail(snapshot.outcomes)
    },
    {
      label: 'Community load reports',
      value: arrayCount(snapshot.communityLoads?.reports, snapshot.communityLoads?.count),
      status: countStatus(snapshot.communityLoads),
      detail: countDetail(snapshot.communityLoads)
    },
    {
      label: 'Watchlist',
      value: arrayCount(snapshot.watchlist?.watches),
      status: countStatus(snapshot.watchlist),
      detail: countDetail(snapshot.watchlist)
    },
    {
      label: 'Alerts',
      value: arrayCount(snapshot.alerts?.alerts),
      status: countStatus(snapshot.alerts),
      detail: countDetail(snapshot.alerts)
    }
  ], [snapshot])

  const providerRows = snapshot.health?.providerReadiness || []
  const dataFreshness = snapshot.health?.flightFreshnessSchema
  const liveStatus = snapshot.health?.liveItineraryReadiness

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: '#e2e8f0', padding: 16, fontFamily: 'Arial, sans-serif' }}>
      <section style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gap: 16 }}>
        <header style={{ display: 'grid', gap: 8, padding: '14px 0 4px' }}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>Private beta operator dashboard</p>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 9vw, 44px)', lineHeight: 1.05 }}>Beta readiness snapshot</h1>
          <p style={{ margin: 0, color: '#94a3b8', maxWidth: 720 }}>Read-only view of provider health, beta learning counts, data freshness, and build identity. No edits or operational actions are available here.</p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <article style={quietCardStyle()}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>Snapshot</p>
            <strong style={{ display: 'block', marginTop: 8, color: loadState === 'ready' ? '#86efac' : loadState === 'error' ? '#fca5a5' : '#facc15' }}>{loadState}</strong>
            <small style={{ color: '#64748b' }}>{error || formatCheckedAt(snapshot.health?.checkedAt)}</small>
          </article>
          <article style={quietCardStyle()}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>Build version</p>
            <strong style={{ display: 'block', marginTop: 8 }}>v{buildVersion}</strong>
            <small style={{ color: '#64748b' }}>package.json</small>
          </article>
          <article style={quietCardStyle()}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>Commit hash</p>
            <strong style={{ display: 'block', marginTop: 8 }}>{commitHash}</strong>
            <small style={{ color: '#64748b' }}>runtime/build source</small>
          </article>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12 }}>
          {counts.map((card) => (
            <article key={card.label} style={quietCardStyle()}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>{card.label}</p>
              <strong style={{ display: 'block', marginTop: 8, fontSize: 32, color: '#f8fafc' }}>{card.value}</strong>
              <small style={{ color: statusTone(card.status) }}>{card.status}</small>
            </article>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <article style={quietCardStyle()}>
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Provider health</h2>
            {providerRows.map((provider) => (
              <div key={provider.provider || provider.status} style={rowStyle()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                  <strong>{provider.provider || 'Provider'}</strong>
                  <span style={{ color: statusTone(provider.status), fontWeight: 700 }}>{provider.status || 'Unknown'}</span>
                </div>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>{provider.rateLimits || provider.fallbackBehavior || 'No detail reported.'}</p>
              </div>
            ))}
            {!providerRows.length && <p style={{ color: '#94a3b8' }}>Provider health has not loaded yet.</p>}
          </article>

          <article style={quietCardStyle()}>
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Data freshness status</h2>
            <div style={rowStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <strong>Flight freshness schema</strong>
                <span style={{ color: statusTone(dataFreshness?.status), fontWeight: 700 }}>{dataFreshness?.status || 'Unknown'}</span>
              </div>
              <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>{dataFreshness?.detail || 'No freshness detail reported.'}</p>
              <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 12 }}>Fallback mode: {dataFreshness?.fallbackMode || 'unknown'}</p>
            </div>
            {(dataFreshness?.columns || []).map((column) => (
              <div key={column.column} style={rowStyle()}>
                <strong>{column.column}</strong>
                <span style={{ float: 'right', color: statusTone(column.status), fontWeight: 700 }}>{column.status || 'Unknown'}</span>
                <p style={{ clear: 'both', margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>{column.detail || 'No detail reported.'}</p>
              </div>
            ))}
            <div style={rowStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <strong>Live itinerary readiness</strong>
                <span style={{ color: statusTone(liveStatus?.status), fontWeight: 700 }}>{liveStatus?.status || 'Unknown'}</span>
              </div>
              <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>{liveStatus?.trueLiveAvailabilityMessage || 'Live itinerary detail has not loaded yet.'}</p>
              <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 12 }}>Mode: {liveStatus?.activeDataMode || 'unknown'}</p>
            </div>
          </article>
        </section>

        <section style={quietCardStyle()}>
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Beta learning API rows</h2>
          {counts.map((card) => (
            <div key={card.label} style={rowStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <strong>{card.label}</strong>
                <span>{card.value}</span>
              </div>
              <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>{card.detail}</p>
            </div>
          ))}
        </section>
      </section>
    </main>
  )
}
