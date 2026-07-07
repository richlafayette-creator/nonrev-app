'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  alertSeverityColor,
  alertSummary,
  buildRouteActivityFeed,
  clearAlertHistory,
  markAllAlertsRead,
  markAlertRead,
  realTimeAlertTypeColor,
  loadAlertSnapshots,
  refreshRealTimeAlerts,
  type RealTimeAlert,
  type RealTimeAlertType
} from '../../lib/alerts'
import { syncPersistentAlerts } from '../../lib/persistentTripClient'

const alertTypes: RealTimeAlertType[] = [
  'New community load',
  'Seat availability changed',
  'Confidence increased',
  'Confidence decreased',
  'Better route found',
  'New backup route available',
  'Watchlist activity',
  'Disruption detected',
  'Weather risk increased'
]

function timeLabel(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

export default function AlertFeedPage() {
  const [alerts, setAlerts] = useState<RealTimeAlert[]>([])
  const [activeType, setActiveType] = useState<RealTimeAlertType | 'All'>('All')
  const [status, setStatus] = useState('Real-time alert engine runs locally against saved watchlists and itineraries.')

  function refreshAlerts(message = 'Alert feed refreshed from local watchlists and saved itineraries.') {
    const nextAlerts = refreshRealTimeAlerts()
    setAlerts(nextAlerts)
    setStatus(message)
    syncPersistentAlerts(nextAlerts, loadAlertSnapshots()).then(({ alerts: syncedAlerts }) => {
      setAlerts(syncedAlerts)
      if (syncedAlerts.length) setStatus('Alert feed synced for this device.')
    })
  }

  useEffect(() => {
    refreshAlerts('Alert feed initialized and stored locally.')
    window.addEventListener('nonrevy-watchlist-updated', () => refreshAlerts('Watchlist changed; alert feed recalculated.'))
    window.addEventListener('nonrevy-itinerary-comparisons-updated', () => refreshAlerts('Saved itineraries changed; alert feed recalculated.'))
    window.addEventListener('nonrevy-trip-alert-preferences-updated', () => refreshAlerts('Alert preferences changed; alert feed recalculated.'))
    window.addEventListener('nonrevy-alerts-updated', () => setAlerts(refreshRealTimeAlerts()))
    window.addEventListener('storage', () => refreshAlerts('Storage changed; alert feed recalculated.'))
  }, [])

  const summary = useMemo(() => alertSummary(alerts), [alerts])
  const activityFeed = useMemo(() => buildRouteActivityFeed(18), [alerts])
  const filteredAlerts = activeType === 'All' ? alerts : alerts.filter((alert) => alert.type === activeType)

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/intelligence" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Intelligence</a>
        <a href="/notifications" style={{ marginRight: 16, color: 'var(--color-pink-400)' }}>Notifications</a>
        <a href="/alerts" style={{ color: 'var(--color-green-500)' }}>Alerts</a>
      </nav>

      <section className="hero-grid" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 24, padding: 24, background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.16), rgba(15, 23, 42, 0.98))' }}>
        <div>
          <p style={{ color: 'var(--color-green-500)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Real-time alert engine</p>
          <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Alert Feed</h1>
          <p style={{ color: 'var(--color-slate-400)', fontSize: 18, maxWidth: 860 }}>
            Alert history for watchlists, saved itineraries, new community loads, seat availability changes, route confidence movement, better itineraries, disruption intelligence, backup routing, and weather-risk changes.
          </p>
          <p style={{ color: 'var(--color-slate-300)' }}>{status}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignSelf: 'start' }}>
          <button onClick={() => refreshAlerts()} style={{ padding: '12px 14px', borderRadius: 12, border: 'none', background: 'var(--color-green-500)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
            Refresh alerts
          </button>
          <button onClick={() => setAlerts(markAllAlertsRead())} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--color-sky-400)', background: 'var(--color-slate-950)', color: 'var(--color-sky-200)', fontWeight: 'bold' }}>
            Mark all read
          </button>
          <button onClick={() => setAlerts(clearAlertHistory())} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--color-red-400)', background: 'var(--color-slate-950)', color: 'var(--color-red-200)', fontWeight: 'bold' }}>
            Clear history
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, margin: '24px 0' }}>
        {[
          ['Total Alerts', alerts.length, 'var(--color-sky-400)'],
          ['Unread', summary.unread, 'var(--color-pink-400)'],
          ['Critical', summary.critical, 'var(--color-red-400)'],
          ['Warnings', summary.warning, 'var(--color-yellow-400)'],
          ['Alert Types', Object.keys(summary.byType).length, 'var(--color-green-500)']
        ].map(([label, value, color]) => (
          <article key={label} className="mini-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
            <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
            <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
          </article>
        ))}
      </section>


      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 16, background: 'var(--color-slate-850)', marginBottom: 20 }}>
        <strong style={{ color: 'var(--color-pink-400)' }}>Notification architecture</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
          {[
            ['In-app alerts', 'Active now: persistent alert history with local fallback.'],
            ['Email alerts', 'Prepared as queued placeholder until provider config exists.'],
            ['Push notifications', 'Prepared through browser/mobile channel preferences; no external provider required yet.']
          ].map(([title, body]) => (
            <article key={title} style={{ border: '1px solid var(--color-slate-800)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)' }}>
              <strong style={{ color: 'var(--color-slate-50)' }}>{title}</strong>
              <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 16, background: 'var(--color-slate-850)', marginBottom: 20 }}>
        <strong style={{ color: 'var(--color-sky-400)' }}>Route Activity Feed</strong>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {activityFeed.length ? activityFeed.map((item) => (
            <article key={item.id} style={{ border: '1px solid var(--color-slate-800)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ color: item.tone === 'green' ? 'var(--color-green-500)' : item.tone === 'yellow' ? 'var(--color-yellow-400)' : item.tone === 'pink' ? 'var(--color-pink-400)' : 'var(--color-sky-400)' }}>{item.title}</strong>
                <small style={{ color: 'var(--color-slate-500)' }}>{timeLabel(item.occurredAt)}</small>
              </div>
              <p style={{ color: 'var(--color-slate-300)', margin: '6px 0 0' }}>{item.route} · {item.body}</p>
            </article>
          )) : <p style={{ color: 'var(--color-slate-400)', margin: 0 }}>No route activity yet. Add a watch or community load to start the feed.</p>}
        </div>
      </section>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 16, background: 'var(--color-slate-850)', marginBottom: 20 }}>
        <strong style={{ color: 'var(--color-green-500)' }}>Alert type filters</strong>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {(['All', ...alertTypes] as Array<RealTimeAlertType | 'All'>).map((type) => {
            const selected = activeType === type
            const color = type === 'All' ? 'var(--color-slate-400)' : realTimeAlertTypeColor(type)
            return (
              <button key={type} onClick={() => setActiveType(type)} style={{ border: `1px solid ${selected ? color : 'var(--color-slate-700)'}`, borderRadius: 999, padding: '9px 12px', background: selected ? 'var(--color-slate-800)' : 'var(--color-slate-950)', color, fontWeight: 'bold' }}>
                {type}{type !== 'All' ? ` · ${summary.byType[type] || 0}` : ''}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Alert history</h2>
          <span style={{ color: 'var(--color-slate-400)' }}>{filteredAlerts.length} shown · stored locally</span>
        </div>

        {filteredAlerts.length === 0 ? (
          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
            <h3 style={{ marginTop: 0 }}>No alerts yet</h3>
            <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>
              Add watchlist routes or save itinerary comparisons, then refresh this feed. The engine stores snapshots locally and alerts when confidence, success probability, disruption, backup, or weather signals move.
            </p>
          </article>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {filteredAlerts.map((alert) => (
              <article key={alert.id} className="flight-card" style={{ border: `1px solid ${alert.read ? 'var(--color-slate-700)' : realTimeAlertTypeColor(alert.type)}`, borderRadius: 20, padding: 18, background: alert.read ? 'var(--color-slate-850)' : 'var(--color-slate-850)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ border: `1px solid ${realTimeAlertTypeColor(alert.type)}`, borderRadius: 999, padding: '5px 9px', color: realTimeAlertTypeColor(alert.type), fontWeight: 'bold', fontSize: 12 }}>
                      {alert.type}
                    </span>
                    <span style={{ border: `1px solid ${alertSeverityColor(alert.severity)}`, borderRadius: 999, padding: '5px 9px', color: alertSeverityColor(alert.severity), fontWeight: 'bold', fontSize: 12, marginLeft: 8 }}>
                      {alert.severity.toUpperCase()}
                    </span>
                    {!alert.read && <span style={{ color: 'var(--color-pink-400)', fontWeight: 'bold', marginLeft: 8 }}>New</span>}
                    <h3 style={{ margin: '12px 0 6px' }}>{alert.title}</h3>
                    <p style={{ color: 'var(--color-slate-400)', margin: 0 }}>{alert.route} · {alert.carrier} · {alert.targetType === 'watched-route' ? 'Watchlist' : 'Saved itinerary'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: realTimeAlertTypeColor(alert.type), fontSize: 24 }}>{alert.metricValue}</strong>
                    <p style={{ color: 'var(--color-slate-400)', margin: '4px 0 0' }}>{alert.metricLabel}</p>
                  </div>
                </div>
                <p style={{ color: 'var(--color-slate-300)' }}>{alert.body}</p>
                <details>
                  <summary style={{ color: 'var(--color-sky-400)', cursor: 'pointer', fontWeight: 'bold' }}>Alert details</summary>
                  <ul style={{ color: 'var(--color-slate-300)' }}>
                    {alert.details.map((detail) => <li key={detail}>{detail}</li>)}
                  </ul>
                </details>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                  <small style={{ color: 'var(--color-slate-500)' }}>{timeLabel(alert.generatedAt)} · {alert.source}</small>
                  {!alert.read && (
                    <button onClick={() => setAlerts(markAlertRead(alert.id))} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 10, padding: '8px 10px', background: 'var(--color-slate-950)', color: 'var(--color-slate-300)', fontWeight: 'bold' }}>
                      Mark read
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
