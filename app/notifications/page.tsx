'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const initialNotifications = [
  { id: 1, title: 'LAX → HNL score improved', body: 'Watchlist scaffold would alert you when a saved route crosses your threshold.', read: false },
  { id: 2, title: 'Open request answered', body: 'Notification center will consolidate responses and credit events.', read: false },
  { id: 3, title: 'Agent refresh healthy', body: 'Polling/realtime status summaries can live here.', read: true }
]

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(initialNotifications)

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

  const unread = notifications.filter((item) => !item.read).length

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/agent" style={{ color: '#a78bfa' }}>Agent</a>
      </nav>

      <section className="hero-grid">
        <div>
          <p style={{ color: '#f472b6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Notification center scaffold</p>
          <h1 style={{ fontSize: 44, margin: '8px 0' }}>Notifications</h1>
          <p style={{ color: '#94a3b8' }}>{unread} unread · staged for route alerts, request answers, credit events, and agent health notices.</p>
        </div>
        <button onClick={markAllRead} style={{ alignSelf: 'start', padding: 12, borderRadius: 10, border: 'none', background: '#f472b6', color: '#020617', fontWeight: 'bold' }}>
          Mark all read
        </button>
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
