'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadSavedItineraryComparisons, type SavedItineraryComparison } from '../../lib/savedItineraryComparisons'
import { loadSavedTripWatchlist, type SavedTripWatch } from '../../lib/watchlist'
import { alertSeverityColor, realTimeAlertTypeColor, refreshRealTimeAlerts, type RealTimeAlert } from '../../lib/alerts'
import { loadNotificationDeliveries, notificationDiagnostics, type NotificationDeliveryRecord } from '../../lib/notificationDelivery'
import { runNotificationEngine } from '../../lib/notificationEngine'
import {
  enabledTripAlertLabels,
  getTripAlertPreference,
  loadTripAlertPreferences,
  tripAlertPreferenceOptions,
  type TripAlertPreference,
  type TripAlertTargetType
} from '../../lib/tripAlertPreferences'

const initialNotifications = [
  { id: 1, title: 'LAX → HNL score improved', body: 'Watchlist scaffold would alert you when a saved route crosses your threshold.', read: false },
  { id: 2, title: 'Open request answered', body: 'Notification center will consolidate responses and credit events.', read: false },
  { id: 3, title: 'Agent refresh healthy', body: 'Polling/realtime status summaries can live here.', read: true }
]

function timeLabel(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [alerts, setAlerts] = useState<RealTimeAlert[]>([])
  const [watchlist, setWatchlist] = useState<SavedTripWatch[]>([])
  const [savedItineraries, setSavedItineraries] = useState<SavedItineraryComparison[]>([])
  const [alertPreferences, setAlertPreferences] = useState<TripAlertPreference[]>([])
  const [deliveries, setDeliveries] = useState<NotificationDeliveryRecord[]>([])

  useEffect(() => {
    function refreshAlertPreferences() {
      setWatchlist(loadSavedTripWatchlist())
      setSavedItineraries(loadSavedItineraryComparisons())
      setAlertPreferences(loadTripAlertPreferences())
      runNotificationEngine()
      setAlerts(refreshRealTimeAlerts())
      setDeliveries(loadNotificationDeliveries())
    }

    refreshAlertPreferences()
    window.addEventListener('nonrevy-watchlist-updated', refreshAlertPreferences)
    window.addEventListener('nonrevy-itinerary-comparisons-updated', refreshAlertPreferences)
    window.addEventListener('nonrevy-trip-alert-preferences-updated', refreshAlertPreferences)
    window.addEventListener('nonrevy-load-reports-updated', refreshAlertPreferences)
    window.addEventListener('nonrevy-alerts-updated', refreshAlertPreferences)
    window.addEventListener('nonrevy-notification-deliveries-updated', refreshAlertPreferences)
    window.addEventListener('nonrevy-notification-queue-updated', refreshAlertPreferences)
    window.addEventListener('storage', refreshAlertPreferences)
    return () => {
      window.removeEventListener('nonrevy-watchlist-updated', refreshAlertPreferences)
      window.removeEventListener('nonrevy-itinerary-comparisons-updated', refreshAlertPreferences)
      window.removeEventListener('nonrevy-trip-alert-preferences-updated', refreshAlertPreferences)
      window.removeEventListener('nonrevy-load-reports-updated', refreshAlertPreferences)
      window.removeEventListener('nonrevy-alerts-updated', refreshAlertPreferences)
      window.removeEventListener('nonrevy-notification-deliveries-updated', refreshAlertPreferences)
      window.removeEventListener('nonrevy-notification-queue-updated', refreshAlertPreferences)
      window.removeEventListener('storage', refreshAlertPreferences)
    }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('notification-center-triggers')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'load_responses' }, (payload) => {
        setNotifications((items) => [
          {
            id: Date.now(),
            title: 'Request answered',
            body: `Realtime trigger scaffold received response ${payload.new?.id || ''}.`,
            read: false
          },
          ...items
        ])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights' }, () => {
        setNotifications((items) => [
          {
            id: Date.now() + 1,
            title: 'Flight update received',
            body: 'Realtime flight-change trigger scaffold fired from Supabase.',
            read: false
          },
          ...items
        ])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  function markAllRead() {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })))
  }

  function preferenceFor(targetId: string, targetType: TripAlertTargetType, targetLabel: string) {
    return alertPreferences.find((preference) => preference.targetId === targetId && preference.targetType === targetType) || getTripAlertPreference(targetId, targetType, targetLabel)
  }

  const unread = notifications.filter((item) => !item.read).length
  const unreadAlerts = alerts.filter((alert) => !alert.read).length
  const latestAlerts = alerts.slice(0, 6)
  const diagnostics = notificationDiagnostics()
  const latestDeliveries = deliveries.slice(0, 5)
  const preferenceTargets = [
    ...watchlist.map((route) => ({
      id: route.id,
      type: 'watched-route' as TripAlertTargetType,
      label: `${route.origin} → ${route.destination}`,
      eyebrow: 'Watched route',
      detail: `${route.carrier} · ${route.selectedItinerary} · ${route.travelDate}`
    })),
    ...savedItineraries.map((itinerary) => ({
      id: itinerary.id,
      type: 'saved-itinerary' as TripAlertTargetType,
      label: itinerary.route,
      eyebrow: 'Saved itinerary',
      detail: `${itinerary.carrier} · Score ${itinerary.score} · Success ${itinerary.successProbability}%`
    }))
  ]
  const enabledAlertCount = preferenceTargets.reduce((total, target) => {
    const preference = preferenceFor(target.id, target.type, target.label)
    return total + enabledTripAlertLabels(preference).length
  }, 0)

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/credits" style={{ marginRight: 16, color: 'var(--color-amber-400)' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: 'var(--color-green-400)' }}>Trust</a>
        <a href="/notifications" style={{ marginRight: 16, color: 'var(--color-pink-400)' }}>Notifications</a>
        <a href="/notification-preferences" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Notification Preferences</a>
        <a href="/notification-history" style={{ marginRight: 16, color: '#f0abfc' }}>History</a>
        <a href="/notification-diagnostics" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Diagnostics</a>
        <a href="/alerts" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Alerts</a>
        <a href="/agent" style={{ color: 'var(--color-violet-400)' }}>Agent</a>
      </nav>

      <section className="hero-grid">
        <div>
          <p style={{ color: 'var(--color-pink-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Notification center</p>
          <h1 style={{ fontSize: 44, margin: '8px 0' }}>Notifications</h1>
          <p style={{ color: 'var(--color-slate-400)' }}>{unread} unread notifications · {unreadAlerts} unread route alerts · {enabledAlertCount} enabled trip alerts · {diagnostics.queued} queued engine notifications · {diagnostics.sentBrowser} browser pushes sent.</p>
        </div>
        <button onClick={markAllRead} style={{ alignSelf: 'start', padding: 12, borderRadius: 10, border: 'none', background: 'var(--color-pink-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
          Mark all read
        </button>
      </section>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: '#f0abfc', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Delivery history</p>
            <h2 style={{ margin: '8px 0' }}>Latest notification deliveries</h2>
            <p style={{ color: 'var(--color-slate-400)', margin: 0 }}>{diagnostics.detail}</p>
          </div>
          <a href="/notification-history" style={{ border: '1px solid #f0abfc', borderRadius: 999, padding: '10px 14px', color: '#f5d0fe', fontWeight: 'bold' }}>
            Open Notification History
          </a>
        </div>
        {latestDeliveries.length === 0 ? (
          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)', marginTop: 16 }}>
            <p style={{ color: 'var(--color-slate-300)', margin: 0 }}>No notification deliveries yet. Add a watchlist item, submit a community load report, or refresh alerts to enqueue notifications.</p>
          </article>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
            {latestDeliveries.map((delivery) => (
              <article key={delivery.id} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 16, padding: 14, background: 'var(--color-slate-950)' }}>
                <strong style={{ color: 'var(--color-slate-50)' }}>{delivery.title}</strong>
                <p style={{ color: 'var(--color-slate-300)' }}>{delivery.body}</p>
                <small style={{ color: 'var(--color-slate-400)' }}>{delivery.eventType} · {delivery.channel} · {delivery.status}</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: 'var(--color-green-500)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Alert badges</p>
            <h2 style={{ margin: '8px 0' }}>Latest route alerts</h2>
            <p style={{ color: 'var(--color-slate-400)', margin: 0 }}>
              Real-time local alert badges for confidence changes, better routes, backups, disruption, and weather risk.
            </p>
          </div>
          <a href="/alerts" style={{ border: '1px solid var(--color-green-500)', borderRadius: 999, padding: '10px 14px', color: 'var(--color-green-200)', fontWeight: 'bold' }}>
            Open Alert Feed
          </a>
        </div>

        {latestAlerts.length === 0 ? (
          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)', marginTop: 16 }}>
            <p style={{ color: 'var(--color-slate-300)', margin: 0 }}>No local route alerts yet. Add watchlist routes or save itinerary comparisons to generate alert history.</p>
          </article>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
            {latestAlerts.map((alert) => (
              <article key={alert.id} style={{ border: `1px solid ${alert.read ? 'var(--color-slate-700)' : realTimeAlertTypeColor(alert.type)}`, borderRadius: 16, padding: 14, background: alert.read ? 'var(--color-slate-950)' : 'var(--color-slate-850)' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ border: `1px solid ${realTimeAlertTypeColor(alert.type)}`, borderRadius: 999, color: realTimeAlertTypeColor(alert.type), padding: '4px 8px', fontWeight: 'bold', fontSize: 12 }}>{alert.type}</span>
                  <span style={{ border: `1px solid ${alertSeverityColor(alert.severity)}`, borderRadius: 999, color: alertSeverityColor(alert.severity), padding: '4px 8px', fontWeight: 'bold', fontSize: 12 }}>{alert.severity}</span>
                  {!alert.read && <span style={{ color: 'var(--color-pink-400)', fontWeight: 'bold' }}>New</span>}
                </div>
                <h3 style={{ margin: '10px 0 6px' }}>{alert.title}</h3>
                <p style={{ color: 'var(--color-slate-300)' }}>{alert.body}</p>
                <small style={{ color: 'var(--color-slate-500)' }}>{timeLabel(alert.generatedAt)}</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: 'var(--color-pink-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Trip alert preferences</p>
            <h2 style={{ margin: '8px 0' }}>Watched-route and saved-itinerary alerts</h2>
            <p style={{ color: 'var(--color-slate-400)', margin: 0 }}>
              Local preference scaffold for score changes, probability changes, delay/cancellation updates, better-route finds, and did-you-get-on reminders.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/notification-preferences" style={{ border: '1px solid var(--color-rose-400)', borderRadius: 999, padding: '10px 14px', color: 'var(--color-rose-200)', fontWeight: 'bold' }}>
              Push Preferences
            </a>
            <a href="/watchlist" style={{ border: '1px solid var(--color-pink-400)', borderRadius: 999, padding: '10px 14px', color: 'var(--color-pink-200)', fontWeight: 'bold' }}>
              Manage on Watchlist
            </a>
          </div>
        </div>

        {preferenceTargets.length === 0 ? (
          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)', marginTop: 16 }}>
            <p style={{ color: 'var(--color-slate-300)', margin: 0 }}>No watched routes or saved itinerary comparisons yet. Add one from /plan or /watchlist to configure alerts.</p>
          </article>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
            {preferenceTargets.map((target) => {
              const preference = preferenceFor(target.id, target.type, target.label)
              const enabledLabels = enabledTripAlertLabels(preference)
              return (
                <article key={`${target.type}-${target.id}`} className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-950)' }}>
                  <strong style={{ color: target.type === 'watched-route' ? 'var(--color-yellow-400)' : 'var(--color-purple-400)', textTransform: 'uppercase', letterSpacing: 1 }}>{target.eyebrow}</strong>
                  <h3 style={{ color: 'var(--color-slate-50)', margin: '8px 0' }}>{target.label}</h3>
                  <p style={{ color: 'var(--color-slate-400)' }}>{target.detail}</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {tripAlertPreferenceOptions.map((option) => {
                      const enabled = preference.flags[option.key]
                      return (
                        <div key={`${target.id}-${option.key}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid var(--color-slate-800)', borderRadius: 10, padding: '8px 10px', background: enabled ? 'var(--color-indigo-950)' : 'var(--color-slate-850)' }}>
                          <span style={{ color: enabled ? 'var(--color-pink-200)' : 'var(--color-slate-500)', fontWeight: 'bold' }}>{option.label}</span>
                          <span style={{ color: enabled ? 'var(--color-green-500)' : 'var(--color-slate-400)' }}>{enabled ? 'On' : 'Off'}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>Enabled: {enabledLabels.join(', ') || 'No alerts enabled'}</p>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        {notifications.map((item) => (
          <article key={item.id} className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, marginBottom: 12, background: item.read ? 'var(--color-slate-850)' : 'var(--color-indigo-950)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ marginTop: 0 }}>{item.title}</h2>
              {!item.read && <span style={{ color: 'var(--color-pink-400)', fontWeight: 'bold' }}>New</span>}
            </div>
            <p style={{ color: 'var(--color-slate-300)' }}>{item.body}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
