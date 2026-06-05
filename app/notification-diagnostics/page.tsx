'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  loadNotificationDeliveries,
  loadNotificationEngineRuns,
  loadNotificationQueue,
  notificationDiagnostics,
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

export default function NotificationDiagnosticsPage() {
  const [deliveries, setDeliveries] = useState<NotificationDeliveryRecord[]>([])
  const [queue, setQueue] = useState<NotificationQueueRecord[]>([])
  const [runs, setRuns] = useState<NotificationEngineRunRecord[]>([])
  const [status, setStatus] = useState('Diagnostics are stored locally in this browser.')

  function refresh(runEngine = false) {
    if (runEngine) {
      const run = runNotificationEngine()
      if (run) setStatus(run.statusMessage)
    }
    setDeliveries(loadNotificationDeliveries())
    setQueue(loadNotificationQueue())
    setRuns(loadNotificationEngineRuns())
  }

  useEffect(() => {
    refresh(true)
    window.addEventListener('nonrevy-notification-deliveries-updated', () => refresh())
    window.addEventListener('nonrevy-notification-queue-updated', () => refresh())
    window.addEventListener('nonrevy-browser-push-subscription-updated', () => refresh())
    window.addEventListener('storage', () => refresh())
  }, [])

  const diagnostics = useMemo(() => notificationDiagnostics(), [deliveries, queue, runs])
  const byStatus = deliveries.reduce<Record<string, number>>((counts, delivery) => {
    counts[delivery.status] = (counts[delivery.status] || 0) + 1
    return counts
  }, {})

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/notification-preferences" style={{ marginRight: 16, color: '#fb7185' }}>Preferences</a>
        <a href="/notification-history" style={{ marginRight: 16, color: '#f0abfc' }}>History</a>
        <a href="/alerts" style={{ color: '#22c55e' }}>Alerts</a>
      </nav>

      <section style={{ border: '1px solid #334155', borderRadius: 24, padding: 24, background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.16), rgba(15, 23, 42, 0.98))' }}>
        <p style={{ color: '#38bdf8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Notification delivery diagnostics</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Engine health and channel status</h1>
        <p style={{ color: '#94a3b8', fontSize: 18, maxWidth: 900 }}>{diagnostics.detail}</p>
        <p style={{ color: '#cbd5e1' }}>{status}</p>
        <button type="button" onClick={() => refresh(true)} style={{ border: 'none', borderRadius: 12, padding: '12px 15px', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}>Run diagnostics now</button>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, margin: '24px 0' }}>
        {[
          ['Queue depth', diagnostics.queued, '#facc15'],
          ['Service worker/browser sent', diagnostics.sentBrowser, '#22c55e'],
          ['Service worker path', diagnostics.sentServiceWorker, '#38bdf8'],
          ['Provider placeholders', diagnostics.placeholders, '#c084fc'],
          ['Blocked/errors', diagnostics.blocked, '#f87171'],
          ['Engine runs', runs.length, '#f0abfc']
        ].map(([label, value, color]) => (
          <article key={label} style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
            <strong style={{ color: String(color), fontSize: 30 }}>{value}</strong>
            <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
          </article>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <article style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a' }}>
          <h2 style={{ marginTop: 0 }}>Browser push readiness</h2>
          <p style={{ color: '#cbd5e1' }}>Permission: <strong>{diagnostics.browserPermission}</strong></p>
          <p style={{ color: '#cbd5e1' }}>Subscription: <strong>{diagnostics.browserPushSubscription?.status || 'not registered'}</strong></p>
          <p style={{ color: '#94a3b8' }}>{diagnostics.browserPushSubscription?.statusMessage || 'Enable browser push from Notification Preferences to register this device.'}</p>
        </article>

        <article style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a' }}>
          <h2 style={{ marginTop: 0 }}>Delivery statuses</h2>
          {Object.keys(byStatus).length === 0 ? <p style={{ color: '#cbd5e1' }}>No delivery records yet.</p> : Object.entries(byStatus).map(([key, value]) => (
            <p key={key} style={{ color: '#cbd5e1' }}><strong>{key}</strong>: {value}</p>
          ))}
        </article>
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>Recent engine runs</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {runs.length === 0 ? <p style={{ color: '#cbd5e1' }}>No engine runs recorded.</p> : runs.slice(0, 10).map((run) => (
            <article key={run.id} style={{ border: `1px solid ${run.status === 'completed' ? '#22c55e' : '#facc15'}`, borderRadius: 16, padding: 14, background: '#020617' }}>
              <strong>{run.status} · {formatDate(run.completedAt)}</strong>
              <p style={{ color: '#cbd5e1' }}>{run.statusMessage}</p>
              <small style={{ color: '#94a3b8' }}>queue {run.queueBefore} → {run.queueAfter} · deliveries {run.deliveriesBefore} → {run.deliveriesAfter}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
