'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildRouteActivityFeed, loadAlertHistory, refreshRealTimeAlerts, type RealTimeAlert, type RouteActivityItem } from '../../lib/alerts'
import { loadCommunityLoads, relativeCommunityLoadTime, type CommunityLoadReport } from '../../lib/communityLoads'
import { loadSavedSearches, savedSearchRunUrl, type SavedSearch } from '../../lib/savedSearches'
import { loadSavedTripWatchlist, type SavedTripWatch } from '../../lib/watchlist'

function timeLabel(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

export default function DashboardPage() {
  const [watches, setWatches] = useState<SavedTripWatch[]>([])
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [alerts, setAlerts] = useState<RealTimeAlert[]>([])
  const [communityLoads, setCommunityLoads] = useState<CommunityLoadReport[]>([])
  const [activity, setActivity] = useState<RouteActivityItem[]>([])
  const [status, setStatus] = useState('Dashboard is built from local watchlists, saved searches, alerts, and community activity.')

  function refreshDashboard(message = 'Dashboard refreshed.') {
    const nextAlerts = refreshRealTimeAlerts()
    setWatches(loadSavedTripWatchlist())
    setSavedSearches(loadSavedSearches())
    setAlerts(nextAlerts.length ? nextAlerts : loadAlertHistory())
    setCommunityLoads(loadCommunityLoads())
    setActivity(buildRouteActivityFeed(10))
    setStatus(message)
  }

  useEffect(() => {
    refreshDashboard('Dashboard initialized from local NONREVY activity.')
    const refresh = () => refreshDashboard('Dashboard updated from local activity.')
    window.addEventListener('nonrevy-watchlist-updated', refresh)
    window.addEventListener('nonrevy-saved-searches-updated', refresh)
    window.addEventListener('nonrevy-alerts-updated', refresh)
    window.addEventListener('nonrevy-community-loads-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('nonrevy-watchlist-updated', refresh)
      window.removeEventListener('nonrevy-saved-searches-updated', refresh)
      window.removeEventListener('nonrevy-alerts-updated', refresh)
      window.removeEventListener('nonrevy-community-loads-updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const unreadAlerts = useMemo(() => alerts.filter((alert) => !alert.read).length, [alerts])
  const latestLoads = communityLoads.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5)

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 24, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <a href="/plan" style={{ color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ color: '#facc15' }}>Watchlist</a>
        <a href="/alerts" style={{ color: '#22c55e' }}>Alerts</a>
        <a href="/saved-searches" style={{ color: '#67e8f9' }}>Saved Searches</a>
        <a href="/dashboard" style={{ color: '#f472b6' }}>Dashboard</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#f472b6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>User Dashboard</p>
        <h1 style={{ fontSize: 42, margin: '8px 0 12px' }}>Your NONREVY command center</h1>
        <p style={{ color: '#94a3b8', fontSize: 18, maxWidth: 820 }}>{status}</p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '22px 0' }}>
          {[
            ['Watched routes', watches.length, '#facc15'],
            ['Saved searches', savedSearches.length, '#67e8f9'],
            ['Unread alerts', unreadAlerts, '#f472b6'],
            ['Community loads', communityLoads.length, '#22c55e']
          ].map(([label, value, color]) => (
            <article key={label} style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a' }}>
              <strong style={{ color: String(color), fontSize: 30 }}>{value}</strong>
              <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontWeight: 'bold' }}>{label}</p>
            </article>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <article style={{ border: '1px solid #334155', borderRadius: 20, padding: 16, background: '#0f172a' }}>
            <h2 style={{ color: '#facc15', marginTop: 0 }}>Watched routes</h2>
            {watches.slice(0, 5).map((watch) => (
              <p key={watch.id} style={{ color: '#cbd5e1' }}><strong>{watch.watchLabel || watch.selectedItinerary}</strong><br /><small style={{ color: '#94a3b8' }}>{watch.watchType || 'route'} · {watch.carrier} · {watch.travelDate}</small></p>
            ))}
            {!watches.length && <p style={{ color: '#94a3b8' }}>No watches yet. Add UA39, LAX-HND, Any Japan route, an airport, a destination, or a Polaris opportunity.</p>}
            <a href="/watchlist" style={{ color: '#facc15', fontWeight: 'bold' }}>Open Watchlist Center</a>
          </article>

          <article style={{ border: '1px solid #334155', borderRadius: 20, padding: 16, background: '#0f172a' }}>
            <h2 style={{ color: '#67e8f9', marginTop: 0 }}>Saved searches</h2>
            {savedSearches.slice(0, 5).map((search) => (
              <p key={search.id} style={{ color: '#cbd5e1' }}><a href={savedSearchRunUrl(search)} style={{ color: '#67e8f9', fontWeight: 'bold' }}>{search.label}</a><br /><small style={{ color: '#94a3b8' }}>Run {search.runCount} time{search.runCount === 1 ? '' : 's'}</small></p>
            ))}
            {!savedSearches.length && <p style={{ color: '#94a3b8' }}>No saved searches yet.</p>}
          </article>

          <article style={{ border: '1px solid #334155', borderRadius: 20, padding: 16, background: '#0f172a' }}>
            <h2 style={{ color: '#22c55e', marginTop: 0 }}>Recent alerts</h2>
            {alerts.slice(0, 5).map((alert) => (
              <p key={alert.id} style={{ color: '#cbd5e1' }}><strong>{alert.title}</strong><br /><small style={{ color: '#94a3b8' }}>{alert.type} · {timeLabel(alert.generatedAt)}</small></p>
            ))}
            {!alerts.length && <p style={{ color: '#94a3b8' }}>No alerts yet.</p>}
            <a href="/alerts" style={{ color: '#22c55e', fontWeight: 'bold' }}>Open Alert Center</a>
          </article>

          <article style={{ border: '1px solid #334155', borderRadius: 20, padding: 16, background: '#0f172a' }}>
            <h2 style={{ color: '#a7f3d0', marginTop: 0 }}>Community activity</h2>
            {latestLoads.map((report) => (
              <p key={report.id} style={{ color: '#cbd5e1' }}><strong>{report.flightNumber} · {report.route}</strong><br /><small style={{ color: '#94a3b8' }}>{report.availableSeats} open · {report.standbyCount} standby · {relativeCommunityLoadTime(report.createdAt)}</small></p>
            ))}
            {!latestLoads.length && <p style={{ color: '#94a3b8' }}>Community load updates will appear here.</p>}
          </article>
        </section>

        <section style={{ border: '1px solid #334155', borderRadius: 20, padding: 16, background: '#0f172a', marginTop: 16 }}>
          <h2 style={{ color: '#38bdf8', marginTop: 0 }}>Route Activity Feed</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {activity.map((item) => (
              <article key={item.id} style={{ border: '1px solid #1e293b', borderRadius: 14, padding: 12, background: '#020617' }}>
                <strong style={{ color: item.tone === 'green' ? '#22c55e' : item.tone === 'yellow' ? '#facc15' : item.tone === 'pink' ? '#f472b6' : '#38bdf8' }}>{item.title}</strong>
                <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>{item.route} · {item.body}</p>
              </article>
            ))}
            {!activity.length && <p style={{ color: '#94a3b8' }}>No route activity yet.</p>}
          </div>
        </section>
      </section>
    </main>
  )
}
