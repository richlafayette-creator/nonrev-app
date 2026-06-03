'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadSavedItineraryComparisons, type SavedItineraryComparison } from '../../lib/savedItineraryComparisons'
import { loadSavedTripWatchlist, type SavedTripWatch } from '../../lib/watchlist'
import { alertSeverityColor, realTimeAlertTypeColor, refreshRealTimeAlerts, type RealTimeAlert } from '../../lib/alerts'
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

  useEffect(() => {
    function refreshAlertPreferences() {
      setWatchlist(loadSavedTripWatchlist())
      setSavedItineraries(loadSavedItineraryComparisons())
      setAlertPreferences(loadTripAlertPreferences())
      setAlerts(refreshRealTimeAlerts())
    }

    refreshAlertPreferences()
    window.addEventListener('nonrevy-watchlist-updated', refreshAlertPreferences)
    window.addEventListener('nonrevy-itinerary-comparisons-updated', refreshAlertPreferences)
    window.addEventListener('nonrevy-trip-alert-preferences-updated', refreshAlertPreferences)
    window.addEventListener('nonrevy-alerts-updated', refreshAlertPreferences)
    window.addEventListener('storage', refreshAlertPreferences)
    return () => {
      window.removeEventListener('nonrevy-watchlist-updated', refreshAlertPreferences)
      window.removeEventListener('nonrevy-itinerary-comparisons-updated', refreshAlertPreferences)
      window.removeEventListener('nonrevy-trip-alert-preferences-updated', refreshAlertPreferences)
      window.removeEventListener('nonrevy-alerts-updated', refreshAlertPreferences)
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
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/notification-preferences" style={{ marginRight: 16, color: '#fb7185' }}>Notification Preferences</a>
        <a href="/alerts" style={{ marginRight: 16, color: '#22c55e' }}>Alerts</a>
        <a href="/agent" style={{ color: '#a78bfa' }}>Agent</a>
      </nav>

      <section className="hero-grid">
        <div>
          <p style={{ color: '#f472b6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Notification center scaffold</p>
          <h1 style={{ fontSize: 44, margin: '8px 0' }}>Notifications</h1>
          <p style={{ color: '#94a3b8' }}>{unread} unread notifications · {unreadAlerts} unread route alerts · {enabledAlertCount} enabled trip alerts · staged for route alerts, request answers, credit events, and agent health notices.</p>
        </div>
        <button onClick={markAllRead} style={{ alignSelf: 'start', padding: 12, borderRadius: 10, border: 'none', background: '#f472b6', color: '#020617', fontWeight: 'bold' }}>
          Mark all read
        </button>
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: '#22c55e', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Alert badges</p>
            <h2 style={{ margin: '8px 0' }}>Latest route alerts</h2>
            <p style={{ color: '#94a3b8', margin: 0 }}>
              Real-time local alert badges for confidence changes, better routes, backups, disruption, and weather risk.
            </p>
          </div>
          <a href="/alerts" style={{ border: '1px solid #22c55e', borderRadius: 999, padding: '10px 14px', color: '#bbf7d0', fontWeight: 'bold' }}>
            Open Alert Feed
          </a>
        </div>

        {latestAlerts.length === 0 ? (
          <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617', marginTop: 16 }}>
            <p style={{ color: '#cbd5e1', margin: 0 }}>No local route alerts yet. Add watchlist routes or save itinerary comparisons to generate alert history.</p>
          </article>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
            {latestAlerts.map((alert) => (
              <article key={alert.id} style={{ border: `1px solid ${alert.read ? '#334155' : realTimeAlertTypeColor(alert.type)}`, borderRadius: 16, padding: 14, background: alert.read ? '#020617' : '#111827' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ border: `1px solid ${realTimeAlertTypeColor(alert.type)}`, borderRadius: 999, color: realTimeAlertTypeColor(alert.type), padding: '4px 8px', fontWeight: 'bold', fontSize: 12 }}>{alert.type}</span>
                  <span style={{ border: `1px solid ${alertSeverityColor(alert.severity)}`, borderRadius: 999, color: alertSeverityColor(alert.severity), padding: '4px 8px', fontWeight: 'bold', fontSize: 12 }}>{alert.severity}</span>
                  {!alert.read && <span style={{ color: '#f472b6', fontWeight: 'bold' }}>New</span>}
                </div>
                <h3 style={{ margin: '10px 0 6px' }}>{alert.title}</h3>
                <p style={{ color: '#cbd5e1' }}>{alert.body}</p>
                <small style={{ color: '#64748b' }}>{timeLabel(alert.generatedAt)}</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: '#f472b6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Trip alert preferences</p>
            <h2 style={{ margin: '8px 0' }}>Watched-route and saved-itinerary alerts</h2>
            <p style={{ color: '#94a3b8', margin: 0 }}>
              Local preference scaffold for score changes, probability changes, delay/cancellation updates, better-route finds, and did-you-get-on reminders.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="/notification-preferences" style={{ border: '1px solid #fb7185', borderRadius: 999, padding: '10px 14px', color: '#fecdd3', fontWeight: 'bold' }}>
              Push Preferences
            </a>
            <a href="/watchlist" style={{ border: '1px solid #f472b6', borderRadius: 999, padding: '10px 14px', color: '#fbcfe8', fontWeight: 'bold' }}>
              Manage on Watchlist
            </a>
          </div>
        </div>

        {preferenceTargets.length === 0 ? (
          <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617', marginTop: 16 }}>
            <p style={{ color: '#cbd5e1', margin: 0 }}>No watched routes or saved itinerary comparisons yet. Add one from /plan or /watchlist to configure alerts.</p>
          </article>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
            {preferenceTargets.map((target) => {
              const preference = preferenceFor(target.id, target.type, target.label)
              const enabledLabels = enabledTripAlertLabels(preference)
              return (
                <article key={`${target.type}-${target.id}`} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#020617' }}>
                  <strong style={{ color: target.type === 'watched-route' ? '#facc15' : '#c084fc', textTransform: 'uppercase', letterSpacing: 1 }}>{target.eyebrow}</strong>
                  <h3 style={{ color: '#f8fafc', margin: '8px 0' }}>{target.label}</h3>
                  <p style={{ color: '#94a3b8' }}>{target.detail}</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {tripAlertPreferenceOptions.map((option) => {
                      const enabled = preference.flags[option.key]
                      return (
                        <div key={`${target.id}-${option.key}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid #1e293b', borderRadius: 10, padding: '8px 10px', background: enabled ? '#1e1b4b' : '#0f172a' }}>
                          <span style={{ color: enabled ? '#fbcfe8' : '#64748b', fontWeight: 'bold' }}>{option.label}</span>
                          <span style={{ color: enabled ? '#22c55e' : '#94a3b8' }}>{enabled ? 'On' : 'Off'}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p style={{ color: '#94a3b8', marginBottom: 0 }}>Enabled: {enabledLabels.join(', ') || 'No alerts enabled'}</p>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        {notifications.map((item) => (
          <article key={item.id} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 12, background: item.read ? '#0f172a' : '#1e1b4b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ marginTop: 0 }}>{item.title}</h2>
              {!item.read && <span style={{ color: '#f472b6', fontWeight: 'bold' }}>New</span>}
            </div>
            <p style={{ color: '#cbd5e1' }}>{item.body}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
