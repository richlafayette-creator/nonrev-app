'use client'

import { useEffect, useState } from 'react'

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [pendingIds, setPendingIds] = useState<number[]>([])

  async function loadRequests(showMessage = false) {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/load_requests?select=*,flights(*)&status=eq.open&order=created_at.desc&limit=50`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } }
    )

    const data = await res.json()

    if (Array.isArray(data)) {
      setRequests(data)
      setLastUpdated(new Date().toLocaleTimeString())
      if (showMessage) setMessage('Open requests refreshed.')
    } else {
      setMessage(JSON.stringify(data))
    }
  }

  useEffect(() => {
    loadRequests()
    const refresh = window.setInterval(() => loadRequests(), 20000)
    return () => window.clearInterval(refresh)
  }, [])

  async function answerRequest(requestId: number) {
    if (pendingIds.includes(requestId)) {
      setMessage('Pending load submission by agent.')
      return
    }

    const intel = prompt('Load notes?')
    if (!intel) return

    setPendingIds((ids) => [...ids, requestId])

    const responseRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/load_responses`,
      {
        method: 'POST',
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          request_id: requestId,
          intel,
          trust_score: 0
        })
      }
    )

    if (!responseRes.ok) {
      setMessage(`Failed to submit response: ${responseRes.status}`)
      setPendingIds((ids) => ids.filter((id) => id !== requestId))
      return
    }

    const closeRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/load_requests?id=eq.${requestId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          status: 'answered'
        })
      }
    )

    if (!closeRes.ok) {
      setMessage(`Response saved, but failed to close request: ${closeRes.status}`)
      setPendingIds((ids) => ids.filter((id) => id !== requestId))
      return
    }

    setMessage('Response submitted and request closed.')
    setRequests((items) => items.filter((item) => item.id !== requestId))
  }

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
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        <a href="/login" style={{ color: '#f472b6' }}>Login</a>
      </nav>

      <section className="hero-grid">
        <div>
          <h1>Open Load Requests</h1>
          <p style={{ color: '#94a3b8' }}>Requests loaded: {requests.length} · Auto-refresh every 20s{lastUpdated ? ` · Last refresh ${lastUpdated}` : ''}</p>
        </div>
        <button onClick={() => loadRequests(true)} style={{ alignSelf: 'start', padding: 12, borderRadius: 10, border: 'none', background: '#c084fc', color: '#020617', fontWeight: 'bold' }}>
          Refresh requests
        </button>
      </section>
      {message && <p style={{ color: '#38bdf8' }}>{message}</p>}

      {requests.map((request) => (
        <div className="flight-card" key={request.id} style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 14, background: '#0f172a' }}>
          <h2>{request.flights?.flight_number || 'Unknown Flight'}</h2>
          <p>{request.flights?.origin} → {request.flights?.destination}</p>
          <p>Status: {request.status}</p>
          <p>Credits spent: {request.credits_spent}</p>
          {request.flights?.id && <a href={`/flights/${request.flights.id}`} style={{ color: '#38bdf8', display: 'inline-block', marginBottom: 10 }}>View flight detail</a>}

          <button
            disabled={pendingIds.includes(request.id)}
            onClick={() => answerRequest(request.id)}
            style={{
              padding: 10,
              borderRadius: 8,
              border: 'none',
              background: pendingIds.includes(request.id) ? '#64748b' : '#22c55e',
              fontWeight: 'bold',
              marginTop: 10
            }}
          >
            {pendingIds.includes(request.id)
              ? 'Pending load submission by agent'
              : 'Answer Request'}
          </button>
        </div>
      ))}
    </main>
  )
}
