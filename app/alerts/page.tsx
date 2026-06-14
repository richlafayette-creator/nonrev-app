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
  refreshRealTimeAlerts,
  type RealTimeAlert,
  type RealTimeAlertType
} from '../../lib/alerts'

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
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/intelligence" style={{ marginRight: 16, color: '#c084fc' }}>Intelligence</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/alerts" style={{ color: '#22c55e' }}>Alerts</a>
      </nav>

      <section className="hero-grid" style={{ border: '1px solid #334155', borderRadius: 24, padding: 24, background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.16), rgba(15, 23, 42, 0.98))' }}>
        <div>
          <p style={{ color: '#22c55e', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Real-time alert engine</p>
          <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Alert Feed</h1>
          <p style={{ color: '#94a3b8', fontSize: 18, maxWidth: 860 }}>
            Local alert history for watchlists, saved itineraries, new community loads, seat availability changes, route confidence movement, better itineraries, disruption intelligence, backup routing, and weather-risk changes.
          </p>
          <p style={{ color: '#cbd5e1' }}>{status}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignSelf: 'start' }}>
          <button onClick={() => refreshAlerts()} style={{ padding: '12px 14px', borderRadius: 12, border: 'none', background: '#22c55e', color: '#020617', fontWeight: 'bold' }}>
            Refresh alerts
          </button>
          <button onClick={() => setAlerts(markAllAlertsRead())} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #38bdf8', background: '#020617', color: '#bae6fd', fontWeight: 'bold' }}>
            Mark all read
          </button>
          <button onClick={() => setAlerts(clearAlertHistory())} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #f87171', background: '#020617', color: '#fecaca', fontWeight: 'bold' }}>
            Clear history
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, margin: '24px 0' }}>
        {[
          ['Total Alerts', alerts.length, '#38bdf8'],
          ['Unread', summary.unread, '#f472b6'],
          ['Critical', summary.critical, '#f87171'],
          ['Warnings', summary.warning, '#facc15'],
          ['Alert Types', Object.keys(summary.byType).length, '#22c55e']
        ].map(([label, value, color]) => (
          <article key={label} className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
            <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
            <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
          </article>
        ))}
      </section>


      <section style={{ border: '1px solid #334155', borderRadius: 20, padding: 16, background: '#0f172a', marginBottom: 20 }}>
        <strong style={{ color: '#f472b6' }}>Notification architecture</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
          {[
            ['In-app alerts', 'Active now: local alert history and unread state.'],
            ['Email alerts', 'Prepared as queued placeholder until provider config exists.'],
            ['Push notifications', 'Prepared through browser/mobile channel preferences; no external provider required yet.']
          ].map(([title, body]) => (
            <article key={title} style={{ border: '1px solid #1e293b', borderRadius: 14, padding: 12, background: '#020617' }}>
              <strong style={{ color: '#f8fafc' }}>{title}</strong>
              <p style={{ color: '#94a3b8', marginBottom: 0 }}>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 20, padding: 16, background: '#0f172a', marginBottom: 20 }}>
        <strong style={{ color: '#38bdf8' }}>Route Activity Feed</strong>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {activityFeed.length ? activityFeed.map((item) => (
            <article key={item.id} style={{ border: '1px solid #1e293b', borderRadius: 14, padding: 12, background: '#020617' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ color: item.tone === 'green' ? '#22c55e' : item.tone === 'yellow' ? '#facc15' : item.tone === 'pink' ? '#f472b6' : '#38bdf8' }}>{item.title}</strong>
                <small style={{ color: '#64748b' }}>{timeLabel(item.occurredAt)}</small>
              </div>
              <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>{item.route} · {item.body}</p>
            </article>
          )) : <p style={{ color: '#94a3b8', margin: 0 }}>No route activity yet. Add a watch or community load to start the feed.</p>}
        </div>
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 20, padding: 16, background: '#0f172a', marginBottom: 20 }}>
        <strong style={{ color: '#22c55e' }}>Alert type filters</strong>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {(['All', ...alertTypes] as Array<RealTimeAlertType | 'All'>).map((type) => {
            const selected = activeType === type
            const color = type === 'All' ? '#94a3b8' : realTimeAlertTypeColor(type)
            return (
              <button key={type} onClick={() => setActiveType(type)} style={{ border: `1px solid ${selected ? color : '#334155'}`, borderRadius: 999, padding: '9px 12px', background: selected ? '#1e293b' : '#020617', color, fontWeight: 'bold' }}>
                {type}{type !== 'All' ? ` · ${summary.byType[type] || 0}` : ''}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Alert history</h2>
          <span style={{ color: '#94a3b8' }}>{filteredAlerts.length} shown · stored locally</span>
        </div>

        {filteredAlerts.length === 0 ? (
          <article style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
            <h3 style={{ marginTop: 0 }}>No alerts yet</h3>
            <p style={{ color: '#94a3b8', marginBottom: 0 }}>
              Add watchlist routes or save itinerary comparisons, then refresh this feed. The engine stores snapshots locally and alerts when confidence, success probability, disruption, backup, or weather signals move.
            </p>
          </article>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {filteredAlerts.map((alert) => (
              <article key={alert.id} className="flight-card" style={{ border: `1px solid ${alert.read ? '#334155' : realTimeAlertTypeColor(alert.type)}`, borderRadius: 20, padding: 18, background: alert.read ? '#0f172a' : '#111827' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ border: `1px solid ${realTimeAlertTypeColor(alert.type)}`, borderRadius: 999, padding: '5px 9px', color: realTimeAlertTypeColor(alert.type), fontWeight: 'bold', fontSize: 12 }}>
                      {alert.type}
                    </span>
                    <span style={{ border: `1px solid ${alertSeverityColor(alert.severity)}`, borderRadius: 999, padding: '5px 9px', color: alertSeverityColor(alert.severity), fontWeight: 'bold', fontSize: 12, marginLeft: 8 }}>
                      {alert.severity.toUpperCase()}
                    </span>
                    {!alert.read && <span style={{ color: '#f472b6', fontWeight: 'bold', marginLeft: 8 }}>New</span>}
                    <h3 style={{ margin: '12px 0 6px' }}>{alert.title}</h3>
                    <p style={{ color: '#94a3b8', margin: 0 }}>{alert.route} · {alert.carrier} · {alert.targetType === 'watched-route' ? 'Watchlist' : 'Saved itinerary'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: realTimeAlertTypeColor(alert.type), fontSize: 24 }}>{alert.metricValue}</strong>
                    <p style={{ color: '#94a3b8', margin: '4px 0 0' }}>{alert.metricLabel}</p>
                  </div>
                </div>
                <p style={{ color: '#cbd5e1' }}>{alert.body}</p>
                <details>
                  <summary style={{ color: '#38bdf8', cursor: 'pointer', fontWeight: 'bold' }}>Alert details</summary>
                  <ul style={{ color: '#cbd5e1' }}>
                    {alert.details.map((detail) => <li key={detail}>{detail}</li>)}
                  </ul>
                </details>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                  <small style={{ color: '#64748b' }}>{timeLabel(alert.generatedAt)} · {alert.source}</small>
                  {!alert.read && (
                    <button onClick={() => setAlerts(markAlertRead(alert.id))} style={{ border: '1px solid #334155', borderRadius: 10, padding: '8px 10px', background: '#020617', color: '#cbd5e1', fontWeight: 'bold' }}>
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
