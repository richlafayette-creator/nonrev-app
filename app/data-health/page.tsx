'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadReportsStorageKey } from '../../lib/loadReports'
import { notificationDiagnostics, notificationPreferencesStorageKey, notificationDeliveriesStorageKey, notificationQueueStorageKey } from '../../lib/notificationDelivery'
import { stripeBillingDiagnostics, stripeBillingStorageKey } from '../../lib/stripeBilling'
import { travelerProfileStorageKey } from '../../lib/travelerProfile'
import { outcomeHealthDiagnostics, tripOutcomeStorageKey } from '../../lib/tripOutcomes'

type HealthStatus = 'Connected' | 'Missing' | 'Limited' | 'Error'
type ScheduleProviderReadinessStatus = 'Configured' | 'Missing' | 'Limited' | 'Placeholder'
type LiveReadinessStatus = 'Ready' | 'Limited' | 'Blocked'

type HealthItem = {
  key: string
  label: string
  status: HealthStatus
  lastChecked: string
  safeErrorMessage: string
  recommendedFix: string
  detail: string
}

type ScheduleProviderReadiness = {
  key: string
  label: string
  status: ScheduleProviderReadinessStatus
  whatItCanProvide: string[]
  whatItCannotProvide: string[]
  recommendedNextAction: string
  detail: string
}

type LiveItineraryReadinessItem = {
  key: string
  label: string
  status: LiveReadinessStatus
  detail: string
  recommendedNextAction: string
}

type LiveItineraryReadiness = {
  status: LiveReadinessStatus
  activeDataMode: 'production-safe' | 'test-data'
  testDataModeEnabled: boolean
  trueLiveAvailabilityMessage: string
  checklist: LiveItineraryReadinessItem[]
}

type ProviderSourceCoverage = {
  sourceProvider: string
  count: number
}

type ProviderPersistenceDiagnostics = {
  enabled: boolean
  status: 'disabled' | 'ready' | 'missing-config' | 'unreachable'
  tableReachable: boolean
  totalStoredRecords: number | null
  newestStoredProviderRecordTimestamp: string | null
  coverageBySourceProvider: ProviderSourceCoverage[]
  detail: string
  recommendedNextAction: string
}

type HealthResponse = {
  checkedAt: string
  checks: HealthItem[]
  liveItineraryReadiness?: LiveItineraryReadiness
  scheduleProviderReadiness?: ScheduleProviderReadiness[]
  providerPersistence?: ProviderPersistenceDiagnostics
}

const statusColors: Record<HealthStatus, { border: string; text: string; bg: string }> = {
  Connected: { border: 'var(--color-green-500)', text: 'var(--color-green-300)', bg: 'rgba(34,197,94,0.12)' },
  Missing: { border: '#f59e0b', text: 'var(--color-yellow-400)', bg: 'rgba(245,158,11,0.12)' },
  Limited: { border: 'var(--color-sky-400)', text: 'var(--color-cyan-300)', bg: 'rgba(56,189,248,0.12)' },
  Error: { border: 'var(--color-rose-400)', text: '#fda4af', bg: 'rgba(251,113,133,0.12)' }
}

const readinessColors: Record<ScheduleProviderReadinessStatus, { border: string; text: string; bg: string }> = {
  Configured: { border: 'var(--color-green-500)', text: 'var(--color-green-300)', bg: 'rgba(34,197,94,0.12)' },
  Missing: { border: '#f59e0b', text: 'var(--color-yellow-400)', bg: 'rgba(245,158,11,0.12)' },
  Limited: { border: 'var(--color-sky-400)', text: 'var(--color-cyan-300)', bg: 'rgba(56,189,248,0.12)' },
  Placeholder: { border: 'var(--color-slate-400)', text: 'var(--color-slate-300)', bg: 'rgba(148,163,184,0.12)' }
}

const liveReadinessColors: Record<LiveReadinessStatus, { border: string; text: string; bg: string }> = {
  Ready: { border: 'var(--color-green-500)', text: 'var(--color-green-300)', bg: 'rgba(34,197,94,0.12)' },
  Limited: { border: 'var(--color-sky-400)', text: 'var(--color-cyan-300)', bg: 'rgba(56,189,248,0.12)' },
  Blocked: { border: '#f59e0b', text: 'var(--color-yellow-400)', bg: 'rgba(245,158,11,0.12)' }
}

function formatDate(value: string) {
  if (!value) return 'Not checked yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function localArrayStatus(key: string, label: string, emptyFix: string): HealthItem {
  const lastChecked = new Date().toISOString()
  try {
    const stored = window.localStorage.getItem(key)
    if (!stored) {
      return {
        key,
        label,
        status: 'Missing',
        lastChecked,
        safeErrorMessage: `${label} has not been saved in this browser yet.`,
        recommendedFix: emptyFix,
        detail: 'Local storage key is empty.'
      }
    }
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return {
        key,
        label,
        status: 'Error',
        lastChecked,
        safeErrorMessage: `${label} data is not in the expected list format.`,
        recommendedFix: 'Clear or resave this local data from the matching NONREVY page.',
        detail: 'Local data could not be interpreted as a list.'
      }
    }
    return {
      key,
      label,
      status: parsed.length > 0 ? 'Connected' : 'Limited',
      lastChecked,
      safeErrorMessage: '',
      recommendedFix: parsed.length > 0 ? 'No action needed.' : emptyFix,
      detail: parsed.length > 0 ? `${parsed.length} local record${parsed.length === 1 ? '' : 's'} available.` : 'Local list exists but is empty.'
    }
  } catch {
    return {
      key,
      label,
      status: 'Error',
      lastChecked,
      safeErrorMessage: `${label} data could not be read safely.`,
      recommendedFix: 'Clear or resave this local data from the matching NONREVY page.',
      detail: 'Local storage parse failed.'
    }
  }
}

function travelerProfileStatus(): HealthItem {
  const lastChecked = new Date().toISOString()
  try {
    const stored = window.localStorage.getItem(travelerProfileStorageKey)
    if (!stored) {
      return {
        key: travelerProfileStorageKey,
        label: 'Traveler profile data',
        status: 'Limited',
        lastChecked,
        safeErrorMessage: 'No custom traveler profile has been saved in this browser.',
        recommendedFix: 'Open Profile and save your airline, priority, home airport, and preferred airports.',
        detail: 'NONREVY will use default traveler assumptions until a profile is saved.'
      }
    }
    const parsed = JSON.parse(stored) as Record<string, unknown>
    const hasHomeAirport = typeof parsed.homeAirport === 'string' && parsed.homeAirport.trim().length > 0
    const hasPriority = typeof parsed.passPriority === 'string' && parsed.passPriority.trim().length > 0
    return {
      key: travelerProfileStorageKey,
      label: 'Traveler profile data',
      status: hasHomeAirport && hasPriority ? 'Connected' : 'Limited',
      lastChecked,
      safeErrorMessage: hasHomeAirport && hasPriority ? '' : 'Traveler profile is saved but missing key fields.',
      recommendedFix: hasHomeAirport && hasPriority ? 'No action needed.' : 'Complete home airport and pass priority in Profile.',
      detail: hasHomeAirport && hasPriority ? 'Custom traveler profile is available locally.' : 'Profile exists but may reduce scoring accuracy.'
    }
  } catch {
    return {
      key: travelerProfileStorageKey,
      label: 'Traveler profile data',
      status: 'Error',
      lastChecked,
      safeErrorMessage: 'Traveler profile data could not be read safely.',
      recommendedFix: 'Open Profile and save the traveler profile again.',
      detail: 'Local profile parse failed.'
    }
  }
}

function notificationFrameworkStatus(): HealthItem {
  const lastChecked = new Date().toISOString()
  try {
    const diagnostics = notificationDiagnostics()
    const hasPreferences = Boolean(window.localStorage.getItem(notificationPreferencesStorageKey))
    const hasDeliveries = Boolean(window.localStorage.getItem(notificationDeliveriesStorageKey))
    const hasQueue = Boolean(window.localStorage.getItem(notificationQueueStorageKey))
    return {
      key: 'notification-delivery-framework',
      label: 'Notification engine and queue',
      status: diagnostics.status,
      lastChecked,
      safeErrorMessage: diagnostics.status === 'Connected' ? '' : 'Notification framework is available, but no alert type or delivery channel is enabled.',
      recommendedFix: diagnostics.status === 'Connected' ? 'No action needed.' : 'Open Notification Preferences and enable at least one alert type and channel.',
      detail: `${diagnostics.detail} Preferences ${hasPreferences ? 'saved' : 'using defaults'}; delivery history ${hasDeliveries ? 'present' : 'empty'}; queue ${hasQueue ? 'present' : 'empty'}.`
    }
  } catch {
    return {
      key: 'notification-delivery-framework',
      label: 'Notification engine and queue',
      status: 'Error',
      lastChecked,
      safeErrorMessage: 'Notification preferences or delivery diagnostics could not be read safely.',
      recommendedFix: 'Open Notification Preferences and resave settings, or clear local notification data.',
      detail: 'Local notification framework parse failed.'
    }
  }
}

function stripeBillingFrameworkStatus(): HealthItem {
  const lastChecked = new Date().toISOString()
  try {
    const diagnostics = stripeBillingDiagnostics()
    const hasSubscriptionState = Boolean(window.localStorage.getItem(stripeBillingStorageKey))
    return {
      key: 'stripe-billing-framework',
      label: 'Stripe billing framework',
      status: diagnostics.status,
      lastChecked,
      safeErrorMessage: diagnostics.liveChargingEnabled ? 'Live charging is unexpectedly enabled.' : '',
      recommendedFix: diagnostics.checkoutEnabled ? 'Verify test checkout routing before production.' : 'Keep using test mode until Stripe checkout, customer portal, webhooks, and production approval are ready.',
      detail: `${diagnostics.detail} Subscription status ${hasSubscriptionState ? 'saved locally' : 'using Free defaults'}.`
    }
  } catch {
    return {
      key: 'stripe-billing-framework',
      label: 'Stripe billing framework',
      status: 'Error',
      lastChecked,
      safeErrorMessage: 'Stripe billing scaffold state could not be read safely.',
      recommendedFix: 'Open Billing and reset to the Free local plan, or clear local billing data.',
      detail: 'Local billing scaffold parse failed.'
    }
  }
}

function outcomePersistenceStatus(): HealthItem {
  const lastChecked = new Date().toISOString()
  try {
    const diagnostics = outcomeHealthDiagnostics()
    const status: HealthStatus = diagnostics.lastSyncStatus === 'error'
      ? 'Error'
      : diagnostics.databaseReady
        ? 'Connected'
        : diagnostics.localOutcomeCount || diagnostics.localFallbackEnabled
          ? 'Limited'
          : 'Missing'
    return {
      key: 'outcome-persistence-framework',
      label: 'Outcome persistence and migration',
      status,
      lastChecked,
      safeErrorMessage: diagnostics.lastError || (diagnostics.databaseConfigured ? '' : 'Supabase outcome storage is not configured; local fallback is active.'),
      recommendedFix: diagnostics.databaseReady ? 'No action needed.' : 'Configure Supabase environment variables and apply the trip_outcomes scaffold when ready.',
      detail: `${diagnostics.detail} Merged outcomes ${diagnostics.mergedOutcomeCount}; probability eligible ${diagnostics.probabilityOutcomeCount}; pending migration ${diagnostics.migrationPendingCount}.`
    }
  } catch {
    return {
      key: 'outcome-persistence-framework',
      label: 'Outcome persistence and migration',
      status: 'Error',
      lastChecked,
      safeErrorMessage: 'Outcome repository diagnostics could not be read safely.',
      recommendedFix: 'Open Outcome Diagnostics, run sync, or clear malformed local outcome diagnostics.',
      detail: 'Outcome persistence diagnostics failed.'
    }
  }
}

function buildLocalChecks() {
  return [
    travelerProfileStatus(),
    localArrayStatus(loadReportsStorageKey, 'Community reports', 'Add or verify a load report from the Load Reports page.'),
    localArrayStatus(tripOutcomeStorageKey, 'Outcome history', 'Capture trip outcomes from the Outcomes page or reminder prompts.'),
    outcomePersistenceStatus(),
    notificationFrameworkStatus(),
    stripeBillingFrameworkStatus()
  ]
}

function statusRank(status: HealthStatus) {
  return { Connected: 0, Limited: 1, Missing: 2, Error: 3 }[status]
}

function providerPersistenceStatusLabel(status: ProviderPersistenceDiagnostics['status']) {
  return {
    disabled: 'Disabled',
    ready: 'Ready',
    'missing-config': 'Missing config',
    unreachable: 'Unreachable'
  }[status]
}

function providerPersistenceColor(status: ProviderPersistenceDiagnostics['status']) {
  if (status === 'ready') return statusColors.Connected
  if (status === 'disabled') return statusColors.Limited
  if (status === 'missing-config') return statusColors.Missing
  return statusColors.Error
}

function formatCount(value: number | null) {
  return typeof value === 'number' ? value.toLocaleString() : 'Not available'
}

export default function DataHealthPage() {
  const [remoteChecks, setRemoteChecks] = useState<HealthItem[]>([])
  const [localChecks, setLocalChecks] = useState<HealthItem[]>([])
  const [scheduleProviderReadiness, setScheduleProviderReadiness] = useState<ScheduleProviderReadiness[]>([])
  const [liveItineraryReadiness, setLiveItineraryReadiness] = useState<LiveItineraryReadiness | null>(null)
  const [providerPersistence, setProviderPersistence] = useState<ProviderPersistenceDiagnostics | null>(null)
  const [pageStatus, setPageStatus] = useState('Checking data health...')
  const [loading, setLoading] = useState(true)

  async function refreshHealth() {
    setLoading(true)
    setPageStatus('Checking data health...')
    setLocalChecks(buildLocalChecks())
    try {
      const response = await fetch('/api/data-health', { cache: 'no-store' })
      const data = await response.json() as HealthResponse
      if (!response.ok) throw new Error('Data health endpoint failed')
      setRemoteChecks(data.checks)
      setLiveItineraryReadiness(data.liveItineraryReadiness || null)
      setScheduleProviderReadiness(data.scheduleProviderReadiness || [])
      setProviderPersistence(data.providerPersistence || null)
      setPageStatus(`Last checked ${formatDate(data.checkedAt)}`)
    } catch {
      setRemoteChecks([
        {
          key: 'data-health-api',
          label: 'Server-side provider checks',
          status: 'Error',
          lastChecked: new Date().toISOString(),
          safeErrorMessage: 'Data health endpoint could not be reached.',
          recommendedFix: 'Rebuild/redeploy the app and verify the /api/data-health route is available.',
          detail: 'External provider checks are unavailable right now.'
        }
      ])
      setLiveItineraryReadiness(null)
      setScheduleProviderReadiness([])
      setProviderPersistence(null)
      setPageStatus('Some checks could not complete.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshHealth()
  }, [])

  const checks = useMemo(() => [...remoteChecks, ...localChecks], [remoteChecks, localChecks])
  const summary = useMemo(() => {
    return checks.reduce<Record<HealthStatus, number>>((totals, check) => {
      totals[check.status] += 1
      return totals
    }, { Connected: 0, Limited: 0, Missing: 0, Error: 0 })
  }, [checks])
  const sortedChecks = useMemo(() => [...checks].sort((a, b) => statusRank(a.status) - statusRank(b.status)), [checks])

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Home</a>
        <a href="/account" style={{ marginRight: 16, color: 'var(--color-amber-400)' }}>Account</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/alerts" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Alerts</a>
        <a href="/intelligence" style={{ color: 'var(--color-green-500)' }}>Intelligence</a>
      </nav>

      <section style={{ maxWidth: 1120 }}>
        <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Admin diagnostic</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Real-time data health</h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 760 }}>
          Quick visibility into the NONREVY data stack without exposing API keys. External provider checks run server-side; traveler, community, and outcome checks read only this browser&apos;s local app data.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '24px 0' }}>
          {(['Connected', 'Limited', 'Missing', 'Error'] as HealthStatus[]).map((status) => (
            <article key={status} style={{ border: `1px solid ${statusColors[status].border}`, borderRadius: 16, padding: '14px 16px', background: statusColors[status].bg, minWidth: 150 }}>
              <small style={{ color: statusColors[status].text }}>{status}</small>
              <h2 style={{ margin: '4px 0 0', color: 'var(--color-slate-50)' }}>{summary[status]}</h2>
            </article>
          ))}
          <button
            type="button"
            onClick={refreshHealth}
            disabled={loading}
            style={{ border: '1px solid var(--color-sky-400)', borderRadius: 999, padding: '0 18px', color: 'var(--color-sky-100)', background: loading ? 'var(--color-slate-850)' : '#075985', cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? 'Checking...' : 'Refresh checks'}
          </button>
        </div>

        <p style={{ color: 'var(--color-slate-300)' }}>{pageStatus}</p>

        {providerPersistence ? (
          <section style={{ border: `1px solid ${providerPersistenceColor(providerPersistence.status).border}`, borderRadius: 18, padding: 18, background: 'var(--color-slate-950)', marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'var(--color-sky-300)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Provider result persistence diagnostics</p>
                <h2 style={{ margin: '6px 0', color: 'var(--color-slate-50)' }}>FlightAware result storage</h2>
                <p style={{ color: 'var(--color-slate-300)', maxWidth: 820, margin: 0 }}>{providerPersistence.detail}</p>
              </div>
              <span style={{ border: `1px solid ${providerPersistenceColor(providerPersistence.status).border}`, borderRadius: 999, padding: '6px 12px', color: providerPersistenceColor(providerPersistence.status).text, background: providerPersistenceColor(providerPersistence.status).bg, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 'bold' }}>
                {providerPersistenceStatusLabel(providerPersistence.status)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
              {[
                ['Persistence flag', providerPersistence.enabled ? 'Enabled' : 'Disabled'],
                ['Results table', providerPersistence.tableReachable ? 'Reachable' : 'Unreachable'],
                ['Stored records', formatCount(providerPersistence.totalStoredRecords)],
                ['Newest record', providerPersistence.newestStoredProviderRecordTimestamp ? formatDate(providerPersistence.newestStoredProviderRecordTimestamp) : 'Not available']
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-850)' }}>
                  <small style={{ color: 'var(--color-slate-400)' }}>{label}</small>
                  <p style={{ color: 'var(--color-slate-50)', margin: '5px 0 0', fontWeight: 'bold' }}>{value}</p>
                </article>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <p style={{ color: 'var(--color-yellow-400)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Recommended next action</p>
              <p style={{ color: 'var(--color-yellow-300)', margin: 0 }}>{providerPersistence.recommendedNextAction}</p>
            </div>

            <div style={{ marginTop: 16 }}>
              <p style={{ color: 'var(--color-slate-400)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Coverage by source provider</p>
              {providerPersistence.coverageBySourceProvider.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  {providerPersistence.coverageBySourceProvider.map((entry) => (
                    <article key={entry.sourceProvider} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 12, background: 'var(--color-slate-850)' }}>
                      <strong style={{ color: 'var(--color-slate-200)' }}>{entry.sourceProvider}</strong>
                      <p style={{ color: 'var(--color-sky-300)', margin: '4px 0 0', fontWeight: 'bold' }}>{entry.count.toLocaleString()} record{entry.count === 1 ? '' : 's'}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-slate-300)', margin: 0 }}>No source-provider coverage rows are available yet.</p>
              )}
            </div>
          </section>
        ) : null}

        {liveItineraryReadiness ? (
          <section style={{ border: `1px solid ${liveReadinessColors[liveItineraryReadiness.status].border}`, borderRadius: 18, padding: 18, background: 'var(--color-slate-950)', marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>True live itinerary readiness</p>
                <h2 style={{ margin: '6px 0', color: 'var(--color-slate-50)' }}>Live data provider checklist</h2>
                <p style={{ color: 'var(--color-slate-300)', maxWidth: 820, margin: 0 }}>{liveItineraryReadiness.trueLiveAvailabilityMessage}</p>
                <p style={{ color: liveItineraryReadiness.testDataModeEnabled ? 'var(--color-yellow-300)' : 'var(--color-green-200)', maxWidth: 820, margin: '8px 0 0' }}>
                  Active data mode: <strong>{liveItineraryReadiness.activeDataMode === 'test-data' ? 'Test data mode' : 'Production-safe mode'}</strong> · NONREVY_TEST_DATA_MODE={liveItineraryReadiness.testDataModeEnabled ? 'true' : 'false or unset'}
                </p>
              </div>
              <span style={{ border: `1px solid ${liveReadinessColors[liveItineraryReadiness.status].border}`, borderRadius: 999, padding: '6px 12px', color: liveReadinessColors[liveItineraryReadiness.status].text, background: liveReadinessColors[liveItineraryReadiness.status].bg, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 'bold' }}>
                {liveItineraryReadiness.status}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
              {liveItineraryReadiness.checklist.map((entry) => {
                const colors = liveReadinessColors[entry.status]
                return (
                  <article key={entry.key} style={{ border: `1px solid ${colors.border}`, borderRadius: 16, padding: 14, background: 'var(--color-slate-850)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <h3 style={{ margin: 0, color: 'var(--color-slate-50)' }}>{entry.label}</h3>
                      <span style={{ border: `1px solid ${colors.border}`, borderRadius: 999, padding: '4px 9px', color: colors.text, background: colors.bg, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 'bold' }}>
                        {entry.status}
                      </span>
                    </div>
                    <p style={{ color: 'var(--color-slate-300)' }}>{entry.detail}</p>
                    <div>
                      <p style={{ color: entry.status === 'Ready' ? 'var(--color-green-300)' : 'var(--color-yellow-400)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 4px' }}>
                        {entry.status === 'Ready' ? 'Next action' : 'Recommended next action'}
                      </p>
                      <p style={{ color: entry.status === 'Ready' ? 'var(--color-green-200)' : 'var(--color-yellow-300)', margin: 0 }}>{entry.recommendedNextAction}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        {scheduleProviderReadiness.length ? (
          <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-950)', marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'var(--color-purple-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Live schedule provider readiness</p>
                <h2 style={{ margin: '6px 0', color: 'var(--color-slate-50)' }}>Provider integration diagnostics</h2>
                <p style={{ color: 'var(--color-slate-400)', maxWidth: 780, margin: 0 }}>
                  These readiness cards describe what each schedule provider can and cannot provide without exposing API keys. Stored Supabase data remains stored data, not live provider API data.
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 16 }}>
              {scheduleProviderReadiness.map((provider) => {
                const colors = readinessColors[provider.status]
                return (
                  <article key={provider.key} style={{ border: `1px solid ${colors.border}`, borderRadius: 16, padding: 14, background: 'var(--color-slate-850)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <h3 style={{ margin: 0, color: 'var(--color-slate-50)' }}>{provider.label}</h3>
                      <span style={{ border: `1px solid ${colors.border}`, borderRadius: 999, padding: '4px 9px', color: colors.text, background: colors.bg, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 'bold' }}>
                        {provider.status}
                      </span>
                    </div>
                    <p style={{ color: 'var(--color-slate-300)' }}>{provider.detail}</p>
                    <dl style={{ display: 'grid', gap: 10, margin: 0 }}>
                      <div>
                        <dt style={{ color: 'var(--color-green-300)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Can provide</dt>
                        <dd style={{ margin: '4px 0 0', color: 'var(--color-slate-200)' }}>{provider.whatItCanProvide.join(', ') || 'None yet'}</dd>
                      </div>
                      <div>
                        <dt style={{ color: '#fda4af', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Cannot provide</dt>
                        <dd style={{ margin: '4px 0 0', color: 'var(--color-slate-200)' }}>{provider.whatItCannotProvide.join(', ') || 'No known gaps'}</dd>
                      </div>
                      <div>
                        <dt style={{ color: 'var(--color-yellow-400)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Recommended next action</dt>
                        <dd style={{ margin: '4px 0 0', color: 'var(--color-yellow-300)' }}>{provider.recommendedNextAction}</dd>
                      </div>
                    </dl>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 18 }}>
          {sortedChecks.map((check) => {
            const colors = statusColors[check.status]
            return (
              <article key={check.key} style={{ border: `1px solid ${colors.border}`, borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <small style={{ color: 'var(--color-slate-400)' }}>Data source</small>
                    <h2 style={{ margin: '6px 0', color: 'var(--color-slate-50)', fontSize: 22 }}>{check.label}</h2>
                  </div>
                  <span style={{ border: `1px solid ${colors.border}`, borderRadius: 999, padding: '5px 10px', color: colors.text, background: colors.bg, whiteSpace: 'nowrap' }}>
                    {check.status}
                  </span>
                </div>

                <p style={{ color: 'var(--color-slate-300)', minHeight: 44 }}>{check.detail}</p>
                <dl style={{ display: 'grid', gap: 10, margin: 0 }}>
                  <div>
                    <dt style={{ color: 'var(--color-slate-400)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Last checked</dt>
                    <dd style={{ margin: '4px 0 0', color: 'var(--color-slate-200)' }}>{formatDate(check.lastChecked)}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-slate-400)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Safe error message</dt>
                    <dd style={{ margin: '4px 0 0', color: check.safeErrorMessage ? '#fda4af' : 'var(--color-green-300)' }}>{check.safeErrorMessage || 'None'}</dd>
                  </div>
                  <div>
                    <dt style={{ color: 'var(--color-slate-400)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Recommended fix</dt>
                    <dd style={{ margin: '4px 0 0', color: 'var(--color-yellow-400)' }}>{check.recommendedFix}</dd>
                  </div>
                </dl>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}
