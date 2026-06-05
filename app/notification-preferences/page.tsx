'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  clearNotificationDeliveries,
  clearNotificationQueue,
  loadNotificationDeliveries,
  loadNotificationPreferences,
  loadNotificationQueue,
  notificationChannelOptions,
  notificationDiagnostics,
  notificationEventOptions,
  notificationFrequencyOptions,
  processNotificationQueue,
  requestBrowserPushPermission,
  saveNotificationPreferences,
  type NotificationChannel,
  type NotificationDeliveryRecord,
  type NotificationEventType,
  type NotificationFrequency,
  type NotificationPreferences,
  type NotificationQueueRecord
} from '../../lib/notificationDelivery'

function statusColor(status: string) {
  if (status === 'sent-browser') return '#22c55e'
  if (status === 'stored-local' || status === 'placeholder') return '#38bdf8'
  if (status === 'blocked-by-preference' || status === 'queued-by-frequency' || status === 'browser-permission-blocked') return '#facc15'
  return '#f87171'
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

export default function NotificationPreferencesPage() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => loadNotificationPreferences())
  const [deliveries, setDeliveries] = useState<NotificationDeliveryRecord[]>([])
  const [queue, setQueue] = useState<NotificationQueueRecord[]>([])
  const [status, setStatus] = useState('Notification preferences are stored locally in this browser.')

  function refresh() {
    setPreferences(loadNotificationPreferences())
    processNotificationQueue()
    setDeliveries(loadNotificationDeliveries())
    setQueue(loadNotificationQueue())
  }

  useEffect(() => {
    refresh()
    window.addEventListener('nonrevy-notification-preferences-updated', refresh)
    window.addEventListener('nonrevy-notification-deliveries-updated', refresh)
    window.addEventListener('nonrevy-notification-queue-updated', refresh)
    window.addEventListener('nonrevy-alerts-updated', refresh)
    window.addEventListener('nonrevy-outcome-reminders-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('nonrevy-notification-preferences-updated', refresh)
      window.removeEventListener('nonrevy-notification-deliveries-updated', refresh)
      window.removeEventListener('nonrevy-notification-queue-updated', refresh)
      window.removeEventListener('nonrevy-alerts-updated', refresh)
      window.removeEventListener('nonrevy-outcome-reminders-updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const diagnostics = useMemo(() => notificationDiagnostics(), [preferences, deliveries])

  function updateEventType(key: NotificationEventType, enabled: boolean) {
    const next = saveNotificationPreferences({
      ...preferences,
      eventTypes: { ...preferences.eventTypes, [key]: enabled }
    })
    setPreferences(next)
    setStatus(`${notificationEventOptions.find((option) => option.key === key)?.label || key} notifications ${enabled ? 'enabled' : 'disabled'}.`)
  }

  function updateChannel(key: NotificationChannel, enabled: boolean) {
    const next = saveNotificationPreferences({
      ...preferences,
      channels: { ...preferences.channels, [key]: enabled }
    })
    setPreferences(next)
    setStatus(`${notificationChannelOptions.find((option) => option.key === key)?.label || key} channel ${enabled ? 'enabled' : 'disabled'}.`)
  }

  function updateFrequency(frequency: NotificationFrequency) {
    const next = saveNotificationPreferences({ ...preferences, frequency })
    setPreferences(next)
    setStatus(`Notification frequency set to ${notificationFrequencyOptions.find((option) => option.key === frequency)?.label || frequency}.`)
  }

  function updateMaxPerHour(maxPerHour: number) {
    const next = saveNotificationPreferences({ ...preferences, maxPerHour })
    setPreferences(next)
    setStatus(`Notification rate limit set to ${next.maxPerHour} browser pushes per hour.`)
  }

  async function enableBrowserPush() {
    const permission = await requestBrowserPushPermission()
    setStatus(`Browser push permission: ${permission}.`)
    refresh()
  }

  function processNow() {
    processNotificationQueue({ force: true })
    refresh()
    setStatus('Processed queued notifications now.')
  }

  function clearDeliveries() {
    setDeliveries(clearNotificationDeliveries())
    setStatus('Cleared local notification delivery diagnostics.')
  }

  function clearQueue() {
    setQueue(clearNotificationQueue())
    setStatus('Cleared local notification queue.')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/alerts" style={{ marginRight: 16, color: '#22c55e' }}>Alerts</a>
        <a href="/data-health" style={{ color: '#c084fc' }}>Data Health</a>
      </nav>

      <section className="hero-grid" style={{ border: '1px solid #334155', borderRadius: 24, padding: 24, background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.16), rgba(15, 23, 42, 0.98))' }}>
        <div>
          <p style={{ color: '#f472b6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Push notification framework</p>
          <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Notification Preferences</h1>
          <p style={{ color: '#94a3b8', fontSize: 18, maxWidth: 860 }}>
            Notification engine controls for alert types, queueing frequency, and delivery channels. Browser push uses the Notification API when permission is granted; email and mobile push remain safe provider placeholders.
          </p>
          <p style={{ color: '#cbd5e1' }}>{status}</p>
        </div>
        <span style={{ alignSelf: 'start', border: `1px solid ${diagnostics.status === 'Connected' ? '#22c55e' : '#facc15'}`, borderRadius: 999, padding: '10px 14px', color: diagnostics.status === 'Connected' ? '#bbf7d0' : '#fde68a', fontWeight: 'bold' }}>
          {diagnostics.status}
        </span>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, margin: '24px 0' }}>
        {[
          ['Enabled alert types', `${diagnostics.enabledEvents}/${notificationEventOptions.length}`, '#22c55e'],
          ['Enabled channels', `${diagnostics.enabledChannels.length}/${notificationChannelOptions.length}`, '#38bdf8'],
          ['Queued', queue.length, '#facc15'],
          ['History records', deliveries.length, '#f472b6'],
          ['Browser sent', diagnostics.sentBrowser, '#22c55e'],
          ['Blocked/skipped', diagnostics.blocked, '#f87171']
        ].map(([label, value, color]) => (
          <article key={label} className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
            <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
            <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
          </article>
        ))}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <article style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a' }}>
          <p style={{ color: '#22c55e', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Alert types</p>
          <h2 style={{ marginTop: 0 }}>Enable or disable notifications</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {notificationEventOptions.map((option) => {
              const enabled = preferences.eventTypes[option.key]
              return (
                <label key={option.key} style={{ border: `1px solid ${enabled ? '#22c55e' : '#334155'}`, borderRadius: 14, padding: 14, background: enabled ? 'rgba(34,197,94,0.10)' : '#020617', display: 'grid', gap: 8 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <strong style={{ color: enabled ? '#bbf7d0' : '#cbd5e1' }}>{option.label}</strong>
                    <input type="checkbox" checked={enabled} onChange={(event) => updateEventType(option.key, event.target.checked)} />
                  </span>
                  <small style={{ color: '#94a3b8' }}>{option.description}</small>
                </label>
              )
            })}
          </div>
        </article>

        <article style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a' }}>
          <p style={{ color: '#38bdf8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Delivery channels</p>
          <h2 style={{ marginTop: 0 }}>Channel support</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {notificationChannelOptions.map((option) => {
              const enabled = preferences.channels[option.key]
              return (
                <label key={option.key} style={{ border: `1px solid ${enabled ? '#38bdf8' : '#334155'}`, borderRadius: 14, padding: 14, background: enabled ? 'rgba(56,189,248,0.10)' : '#020617', display: 'grid', gap: 8 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <strong style={{ color: enabled ? '#bae6fd' : '#cbd5e1' }}>{option.label}</strong>
                    <input type="checkbox" checked={enabled} onChange={(event) => updateChannel(option.key, event.target.checked)} />
                  </span>
                  <small style={{ color: '#94a3b8' }}>{option.description}</small>
                </label>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button type="button" onClick={enableBrowserPush} style={{ border: '1px solid #38bdf8', borderRadius: 12, padding: '10px 14px', background: '#020617', color: '#bae6fd', fontWeight: 'bold' }}>
              Enable browser push
            </button>
            <a href="/notification-history" style={{ border: '1px solid #f472b6', borderRadius: 12, padding: '10px 14px', color: '#fbcfe8', fontWeight: 'bold' }}>
              Open history
            </a>
          </div>
          <p style={{ color: '#94a3b8' }}>Browser permission: {diagnostics.browserPermission}. Email/mobile provider credentials are intentionally not required yet.</p>
        </article>

        <article style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a' }}>
          <p style={{ color: '#facc15', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Frequency controls</p>
          <h2 style={{ marginTop: 0 }}>Queue behavior</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {notificationFrequencyOptions.map((option) => {
              const enabled = preferences.frequency === option.key
              return (
                <label key={option.key} style={{ border: `1px solid ${enabled ? '#facc15' : '#334155'}`, borderRadius: 14, padding: 14, background: enabled ? 'rgba(250,204,21,0.10)' : '#020617', display: 'grid', gap: 8 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <strong style={{ color: enabled ? '#fde68a' : '#cbd5e1' }}>{option.label}</strong>
                    <input type="radio" name="notification-frequency" checked={enabled} onChange={() => updateFrequency(option.key)} />
                  </span>
                  <small style={{ color: '#94a3b8' }}>{option.description}</small>
                </label>
              )
            })}
          </div>
          <label style={{ display: 'block', color: '#cbd5e1', marginTop: 14 }}>
            Browser pushes per hour
            <input
              type="number"
              min="1"
              max="200"
              value={preferences.maxPerHour}
              onChange={(event) => updateMaxPerHour(Number(event.target.value))}
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
            />
          </label>
        </article>
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <p style={{ color: '#facc15', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Notification queue</p>
            <h2 style={{ margin: '8px 0' }}>Pending delivery work</h2>
            <p style={{ color: '#94a3b8', margin: 0 }}>Frequency controls hold notifications here before browser/email/mobile delivery attempts.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={processNow} style={{ border: '1px solid #22c55e', borderRadius: 12, padding: '10px 14px', background: '#020617', color: '#bbf7d0', fontWeight: 'bold' }}>
              Process now
            </button>
            <button type="button" onClick={clearQueue} style={{ border: '1px solid #f87171', borderRadius: 12, padding: '10px 14px', background: '#020617', color: '#fecaca', fontWeight: 'bold' }}>
              Clear queue
            </button>
          </div>
        </div>

        {queue.length === 0 ? (
          <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617', marginTop: 16 }}>
            <p style={{ color: '#cbd5e1', margin: 0 }}>No queued notifications.</p>
          </article>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {queue.slice(0, 8).map((item) => (
              <article key={item.id} style={{ border: '1px solid #facc15', borderRadius: 16, padding: 14, background: '#020617' }}>
                <strong style={{ color: '#f8fafc' }}>{item.title}</strong>
                <p style={{ color: '#cbd5e1', margin: '6px 0' }}>{item.body}</p>
                <small style={{ color: '#94a3b8' }}>{item.eventType} · {item.channels.join(', ')} · next attempt {formatDate(item.nextAttemptAt)}</small>
                <p style={{ color: '#94a3b8', marginBottom: 0 }}>{item.statusMessage}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <p style={{ color: '#f472b6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Delivery diagnostics</p>
            <h2 style={{ margin: '8px 0' }}>Local delivery records</h2>
            <p style={{ color: '#94a3b8', margin: 0 }}>{diagnostics.detail}</p>
          </div>
          <button type="button" onClick={clearDeliveries} style={{ border: '1px solid #f87171', borderRadius: 12, padding: '10px 14px', background: '#020617', color: '#fecaca', fontWeight: 'bold' }}>
            Clear diagnostics
          </button>
        </div>

        {deliveries.length === 0 ? (
          <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617', marginTop: 16 }}>
            <p style={{ color: '#cbd5e1', margin: 0 }}>No delivery records yet. Generate route alerts or due outcome reminders to populate this framework.</p>
          </article>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {deliveries.slice(0, 12).map((delivery) => (
              <article key={delivery.id} style={{ border: `1px solid ${statusColor(delivery.status)}`, borderRadius: 16, padding: 14, background: '#020617' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ color: '#f8fafc' }}>{delivery.title}</strong>
                    <p style={{ color: '#cbd5e1', margin: '6px 0' }}>{delivery.body}</p>
                    <small style={{ color: '#94a3b8' }}>{delivery.eventType} · {delivery.channel} · {formatDate(delivery.createdAt)}</small>
                  </div>
                  <span style={{ color: statusColor(delivery.status), fontWeight: 'bold' }}>{delivery.status}</span>
                </div>
                <p style={{ color: '#94a3b8', marginBottom: 0 }}>{delivery.statusMessage}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
