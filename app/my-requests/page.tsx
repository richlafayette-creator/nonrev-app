'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [lastUpdated, setLastUpdated] = useState('')
  const [notification, setNotification] = useState('')

  async function loadRequests() {
    const { data } = await supabase
      .from('load_requests')
      .select(`
        *,
        flights(*),
        load_responses(*)
      `)
      .order('created_at', { ascending: false })

    setRequests(data || [])
    setLastUpdated(new Date().toLocaleTimeString())
  }

  useEffect(() => {
    loadRequests()
    const refresh = window.setInterval(() => loadRequests(), 25000)

    const channel = supabase
      .channel('responses')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'load_responses'
        },
        () => {
          loadRequests()
          setNotification('Answered request notification trigger received.')
        }
      )
      .subscribe()

    return () => {
      window.clearInterval(refresh)
      supabase.removeChannel(channel)
    }
  }, [])

  const summary = useMemo(() => {
    const answered = requests.filter((request) => request.load_responses?.length > 0 || request.status === 'answered').length
    return {
      answered,
      waiting: requests.length - answered,
      credits: requests.reduce((total, request) => total + (request.credits_spent || 0), 0)
    }
  }, [requests])

  const visibleRequests = requests.filter((request) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'answered') return request.load_responses?.length > 0 || request.status === 'answered'
    return request.status === statusFilter || !request.load_responses?.length
  })

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ color: '#22c55e' }}>Outcomes</a>
      </nav>

      <section className="hero-grid">
        <div>
          <h1 style={{ fontSize: 40 }}>My Load Requests</h1>
          <p style={{ color: '#94a3b8' }}>Auto-refresh every 25s{lastUpdated ? ` · Last refresh ${lastUpdated}` : ''}</p>
        </div>
        <button onClick={loadRequests} style={{ alignSelf: 'start', padding: 12, borderRadius: 10, border: 'none', background: '#facc15', color: '#020617', fontWeight: 'bold' }}>
          Refresh my requests
        </button>
      </section>
      {notification && <p style={{ color: '#f472b6' }}>{notification}</p>}

      <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '18px 0' }}>
        <div className="mini-card" style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}><strong>{requests.length}</strong><p>Total requests</p></div>
        <div className="mini-card" style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}><strong>{summary.waiting}</strong><p>Waiting</p></div>
        <div className="mini-card" style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}><strong>{summary.answered}</strong><p>Answered</p></div>
        <div className="mini-card" style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}><strong>{summary.credits}</strong><p>Credits spent</p></div>
      </section>

      <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 16 }}>
        Status filter{' '}
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ padding: 10, borderRadius: 10, marginLeft: 8 }}>
          <option value="all">All</option>
          <option value="open">Open / waiting</option>
          <option value="answered">Answered</option>
        </select>
      </label>

      {visibleRequests.map((request) => (
        <article className="flight-card" key={request.id} style={{ border: '1px solid #334155', padding: 18, marginTop: 12, borderRadius: 18, background: '#0f172a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ marginTop: 0 }}>{request.flights?.flight_number || 'Unknown Flight'}</h2>
            <strong style={{ color: request.load_responses?.length > 0 ? '#22c55e' : '#facc15' }}>
              {request.load_responses?.length > 0 ? 'Answered' : 'Waiting'}
            </strong>
          </div>

          <p style={{ color: '#38bdf8' }}>{request.flights?.origin} → {request.flights?.destination}</p>
          <p>Status: {request.status}</p>
          {request.flights?.id && <a href={`/flights/${request.flights.id}`} style={{ color: '#38bdf8' }}>View flight detail</a>}

          {request.load_responses?.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <strong>Responses:</strong>
              {request.load_responses.map((response: any) => (
                <div key={response.id} style={{ background: '#020617', border: '1px solid #334155', padding: 12, marginTop: 8, borderRadius: 10, color: 'white' }}>
                  <p style={{ marginTop: 0 }}>{response.intel}</p>
                  <small style={{ color: '#94a3b8' }}>Trust score scaffold: {response.trust_score ?? 0}</small>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#facc15' }}>Waiting for responses...</p>
          )}
        </article>
      ))}
    </main>
  )
}
