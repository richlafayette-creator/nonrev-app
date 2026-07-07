'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildRouteActivityFeed, loadAlertHistory, refreshRealTimeAlerts, type RealTimeAlert, type RouteActivityItem } from '../../lib/alerts'
import { loadCommunityLoads, relativeCommunityLoadTime, type CommunityLoadReport } from '../../lib/communityLoads'
import { loadSavedSearches, savedSearchRunUrl, type SavedSearch } from '../../lib/savedSearches'
import { loadSavedTripWatchlist, type SavedTripWatch } from '../../lib/watchlist'
import { syncPersistentAlerts, syncPersistentWatchlist } from '../../lib/persistentTripClient'

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
    syncPersistentWatchlist(loadSavedTripWatchlist()).then(setWatches)
    syncPersistentAlerts(nextAlerts).then(({ alerts: syncedAlerts }) => setAlerts(syncedAlerts.length ? syncedAlerts : nextAlerts))
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
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 24, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <a href="/plan" style={{ color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/watchlist" style={{ color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/alerts" style={{ color: 'var(--color-green-500)' }}>Alerts</a>
        <a href="/saved-searches" style={{ color: 'var(--color-sky-300)' }}>Saved Searches</a>
        <a href="/dashboard" style={{ color: 'var(--color-pink-400)' }}>Dashboard</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-pink-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>User Dashboard</p>
        <h1 style={{ fontSize: 42, margin: '8px 0 12px' }}>Your NONREVY command center</h1>
        <p style={{ color: 'var(--color-slate-400)', fontSize: 18, maxWidth: 820 }}>{status}</p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '22px 0' }}>
          {[
            ['Watched routes', watches.length, 'var(--color-yellow-400)'],
            ['Saved searches', savedSearches.length, 'var(--color-sky-300)'],
            ['Unread alerts', unreadAlerts, 'var(--color-pink-400)'],
            ['Community loads', communityLoads.length, 'var(--color-green-500)']
          ].map(([label, value, color]) => (
            <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 16, background: 'var(--color-slate-850)' }}>
              <strong style={{ color: String(color), fontSize: 30 }}>{value}</strong>
              <p style={{ margin: '6px 0 0', color: 'var(--color-slate-300)', fontWeight: 'bold' }}>{label}</p>
            </article>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 16, background: 'var(--color-slate-850)' }}>
            <h2 style={{ color: 'var(--color-yellow-400)', marginTop: 0 }}>Watched routes</h2>
            {watches.slice(0, 5).map((watch) => (
              <p key={watch.id} style={{ color: 'var(--color-slate-300)' }}><strong>{watch.watchLabel || watch.selectedItinerary}</strong><br /><small style={{ color: 'var(--color-slate-400)' }}>{watch.watchType || 'route'} · {watch.carrier} · {watch.travelDate}</small></p>
            ))}
            {!watches.length && <p style={{ color: 'var(--color-slate-400)' }}>No watches yet. Add UA39, LAX-HND, Any Japan route, an airport, a destination, or a Polaris opportunity.</p>}
            <a href="/watchlist" style={{ color: 'var(--color-yellow-400)', fontWeight: 'bold' }}>Open Watchlist Center</a>
          </article>

          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 16, background: 'var(--color-slate-850)' }}>
            <h2 style={{ color: 'var(--color-sky-300)', marginTop: 0 }}>Saved searches</h2>
            {savedSearches.slice(0, 5).map((search) => (
              <p key={search.id} style={{ color: 'var(--color-slate-300)' }}><a href={savedSearchRunUrl(search)} style={{ color: 'var(--color-sky-300)', fontWeight: 'bold' }}>{search.label}</a><br /><small style={{ color: 'var(--color-slate-400)' }}>Run {search.runCount} time{search.runCount === 1 ? '' : 's'}</small></p>
            ))}
            {!savedSearches.length && <p style={{ color: 'var(--color-slate-400)' }}>No saved searches yet.</p>}
          </article>

          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 16, background: 'var(--color-slate-850)' }}>
            <h2 style={{ color: 'var(--color-green-500)', marginTop: 0 }}>Recent alerts</h2>
            {alerts.slice(0, 5).map((alert) => (
              <p key={alert.id} style={{ color: 'var(--color-slate-300)' }}><strong>{alert.title}</strong><br /><small style={{ color: 'var(--color-slate-400)' }}>{alert.type} · {timeLabel(alert.generatedAt)}</small></p>
            ))}
            {!alerts.length && <p style={{ color: 'var(--color-slate-400)' }}>No alerts yet.</p>}
            <a href="/alerts" style={{ color: 'var(--color-green-500)', fontWeight: 'bold' }}>Open Alert Center</a>
          </article>

          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 16, background: 'var(--color-slate-850)' }}>
            <h2 style={{ color: '#a7f3d0', marginTop: 0 }}>Community activity</h2>
            {latestLoads.map((report) => (
              <p key={report.id} style={{ color: 'var(--color-slate-300)' }}><strong>{report.flightNumber} · {report.route}</strong><br /><small style={{ color: 'var(--color-slate-400)' }}>{report.availableSeats} open · {report.standbyCount} standby · {relativeCommunityLoadTime(report.createdAt)}</small></p>
            ))}
            {!latestLoads.length && <p style={{ color: 'var(--color-slate-400)' }}>Community load updates will appear here.</p>}
          </article>
        </section>

        <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 16, background: 'var(--color-slate-850)', marginTop: 16 }}>
          <h2 style={{ color: 'var(--color-sky-400)', marginTop: 0 }}>Route Activity Feed</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {activity.map((item) => (
              <article key={item.id} style={{ border: '1px solid var(--color-slate-800)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)' }}>
                <strong style={{ color: item.tone === 'green' ? 'var(--color-green-500)' : item.tone === 'yellow' ? 'var(--color-yellow-400)' : item.tone === 'pink' ? 'var(--color-pink-400)' : 'var(--color-sky-400)' }}>{item.title}</strong>
                <p style={{ color: 'var(--color-slate-300)', margin: '6px 0 0' }}>{item.route} · {item.body}</p>
              </article>
            ))}
            {!activity.length && <p style={{ color: 'var(--color-slate-400)' }}>No route activity yet.</p>}
          </div>
        </section>
      </section>
    </main>
  )
}
