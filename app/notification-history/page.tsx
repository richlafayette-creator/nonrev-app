'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  loadNotificationDeliveries,
  loadNotificationEngineRuns,
  loadNotificationQueue,
  notificationDiagnostics,
  processNotificationQueue,
  type NotificationDeliveryRecord,
  type NotificationEngineRunRecord,
  type NotificationQueueRecord
} from '../../lib/notificationDelivery'
import { runNotificationEngine } from '../../lib/notificationEngine'

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function statusColor(status: string) {
  if (status === 'sent-browser' || status === 'sent-service-worker') return 'var(--color-green-500)'
  if (status === 'placeholder' || status === 'stored-local') return 'var(--color-sky-400)'
  if (status === 'queued-by-frequency' || status === 'browser-permission-blocked') return 'var(--color-yellow-400)'
  return 'var(--color-red-400)'
}

export default function NotificationHistoryPage() {
  const [deliveries, setDeliveries] = useState<NotificationDeliveryRecord[]>([])
  const [queue, setQueue] = useState<NotificationQueueRecord[]>([])
  const [engineRuns, setEngineRuns] = useState<NotificationEngineRunRecord[]>([])
  const [filter, setFilter] = useState('all')

  function refresh() {
    runNotificationEngine()
    setDeliveries(loadNotificationDeliveries())
    setQueue(loadNotificationQueue())
    setEngineRuns(loadNotificationEngineRuns())
  }

  useEffect(() => {
    refresh()
    window.addEventListener('nonrevy-notification-deliveries-updated', refresh)
    window.addEventListener('nonrevy-notification-queue-updated', refresh)
    window.addEventListener('nonrevy-notification-preferences-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('nonrevy-notification-deliveries-updated', refresh)
      window.removeEventListener('nonrevy-notification-queue-updated', refresh)
      window.removeEventListener('nonrevy-notification-preferences-updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const diagnostics = useMemo(() => notificationDiagnostics(), [deliveries, queue])
  const eventTypes = Array.from(new Set(deliveries.map((delivery) => delivery.eventType)))
  const filteredDeliveries = filter === 'all' ? deliveries : deliveries.filter((delivery) => delivery.eventType === filter)

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/notifications" style={{ marginRight: 16, color: 'var(--color-pink-400)' }}>Notifications</a>
        <a href="/notification-preferences" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Preferences</a>
        <a href="/notification-diagnostics" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Diagnostics</a>
        <a href="/alerts" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Alerts</a>
        <a href="/data-health" style={{ color: 'var(--color-purple-400)' }}>Data Health</a>
      </nav>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 24, padding: 24, background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.16), rgba(15, 23, 42, 0.98))' }}>
        <p style={{ color: 'var(--color-pink-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Notification history</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Delivery history and queue</h1>
        <p style={{ color: 'var(--color-slate-400)', fontSize: 18, maxWidth: 900 }}>{diagnostics.detail}</p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
        {[
          ['Queued', diagnostics.queued, 'var(--color-yellow-400)'],
          ['Browser sent', diagnostics.sentBrowser, 'var(--color-green-500)'],
          ['Stored local', diagnostics.storedLocal, 'var(--color-sky-400)'],
          ['Placeholders', diagnostics.placeholders, 'var(--color-purple-400)'],
          ['Blocked/errors', diagnostics.blocked, 'var(--color-red-400)']
        ].map(([label, value, color]) => (
          <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
            <strong style={{ color: String(color), fontSize: 30 }}>{value}</strong>
            <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
          </article>
        ))}
      </section>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>Queued notifications</h2>
            <p style={{ color: 'var(--color-slate-400)' }}>Notifications waiting on frequency controls, rate limits, or placeholder providers.</p>
          </div>
          <button type="button" onClick={() => { processNotificationQueue({ force: true }); refresh() }} style={{ border: '1px solid var(--color-green-500)', borderRadius: 12, padding: '10px 14px', background: 'var(--color-slate-950)', color: 'var(--color-green-200)', fontWeight: 'bold' }}>
            Process now
          </button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {queue.length === 0 ? <p style={{ color: 'var(--color-slate-300)' }}>No queued notifications.</p> : queue.map((item) => (
            <article key={item.id} style={{ border: '1px solid var(--color-yellow-400)', borderRadius: 16, padding: 14, background: 'var(--color-slate-950)' }}>
              <strong>{item.title}</strong>
              <p style={{ color: 'var(--color-slate-300)' }}>{item.body}</p>
              <small style={{ color: 'var(--color-slate-400)' }}>{item.eventType} · {item.channels.join(', ')} · next {formatDate(item.nextAttemptAt)}</small>
              <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{item.statusMessage}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0 }}>Engine run diagnostics</h2>
          <p style={{ color: 'var(--color-slate-400)' }}>Each run checks watchlists, route confidence, load-report-driven confidence, better itineraries, weather/disruption risk, outcome reminders, and then processes the queue.</p>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {engineRuns.length === 0 ? <p style={{ color: 'var(--color-slate-300)' }}>No engine runs recorded yet.</p> : engineRuns.slice(0, 8).map((run) => (
            <article key={run.id} style={{ border: `1px solid ${run.status === 'completed' ? 'var(--color-green-500)' : 'var(--color-yellow-400)'}`, borderRadius: 16, padding: 14, background: 'var(--color-slate-950)' }}>
              <strong style={{ color: run.status === 'completed' ? 'var(--color-green-200)' : 'var(--color-yellow-300)' }}>{run.status} · {formatDate(run.completedAt)}</strong>
              <p style={{ color: 'var(--color-slate-300)' }}>{run.statusMessage}</p>
              <small style={{ color: 'var(--color-slate-400)' }}>
                Alerts {run.alertsBefore} → {run.alertsAfter} · reminders {run.remindersBefore} → {run.remindersAfter} · queue {run.queueBefore} → {run.queueAfter} · deliveries {run.deliveriesBefore} → {run.deliveriesAfter}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>Delivery records</h2>
            <p style={{ color: 'var(--color-slate-400)' }}>Browser push attempts, local inbox records, blocked events, and provider placeholders.</p>
          </div>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} style={{ padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}>
            <option value="all">All event types</option>
            {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {filteredDeliveries.length === 0 ? <p style={{ color: 'var(--color-slate-300)' }}>No delivery records yet.</p> : filteredDeliveries.map((delivery) => (
            <article key={delivery.id} style={{ border: `1px solid ${statusColor(delivery.status)}`, borderRadius: 16, padding: 14, background: 'var(--color-slate-950)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: 'var(--color-slate-50)' }}>{delivery.title}</strong>
                  <p style={{ color: 'var(--color-slate-300)', margin: '6px 0' }}>{delivery.body}</p>
                  <small style={{ color: 'var(--color-slate-400)' }}>{delivery.eventType} · {delivery.channel} · {formatDate(delivery.createdAt)}</small>
                </div>
                <span style={{ color: statusColor(delivery.status), fontWeight: 'bold' }}>{delivery.status}</span>
              </div>
              <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{delivery.statusMessage}</p>
              {delivery.details?.length ? <ul style={{ color: 'var(--color-slate-300)' }}>{delivery.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
