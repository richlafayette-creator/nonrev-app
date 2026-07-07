'use client'

import { useEffect, useState } from 'react'
import { ANSWER_REWARD_CREDITS, rewardResponder } from '../../lib/monetization'
import { supabase } from '../../lib/supabase'

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [pendingIds, setPendingIds] = useState<number[]>([])
  const [rewardBalance, setRewardBalance] = useState({ available: 0, reserved: 0, earned: 0 })

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
    const requestChannel = supabase
      .channel('open-request-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'load_requests' }, () => loadRequests())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'load_responses' }, () => {
        loadRequests()
        setMessage('Realtime answer received; notifications scaffold would fan this out.')
      })
      .subscribe()

    return () => {
      window.clearInterval(refresh)
      supabase.removeChannel(requestChannel)
    }
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

    setRewardBalance((balance) => rewardResponder(balance, ANSWER_REWARD_CREDITS))
    setMessage('Response submitted and request closed.')
    setRequests((items) => items.filter((item) => item.id !== requestId))
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Best Routes</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/credits" style={{ marginRight: 16, color: 'var(--color-amber-400)' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: 'var(--color-green-400)' }}>Trust</a>
        <a href="/notifications" style={{ marginRight: 16, color: 'var(--color-pink-400)' }}>Notifications</a>
        <a href="/requests" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>My Requests</a>
        <a href="/outcomes" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Outcomes</a>
        <a href="/login" style={{ color: 'var(--color-pink-400)' }}>Login</a>
      </nav>

      <section className="hero-grid">
        <div>
          <h1>Open Load Requests</h1>
          <p style={{ color: 'var(--color-slate-400)' }}>Requests loaded: {requests.length} · Auto-refresh every 20s{lastUpdated ? ` · Last refresh ${lastUpdated}` : ''}</p>
          <p style={{ color: 'var(--color-green-400)' }}>Responder reward scaffold: +{ANSWER_REWARD_CREDITS} credits per accepted answer · Earned this session: {rewardBalance.earned}</p>
        </div>
        <button onClick={() => loadRequests(true)} style={{ alignSelf: 'start', padding: 12, borderRadius: 10, border: 'none', background: 'var(--color-purple-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
          Refresh requests
        </button>
      </section>
      {message && <p style={{ color: 'var(--color-sky-400)' }}>{message}</p>}

      {requests.map((request) => (
        <div className="flight-card" key={request.id} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, marginBottom: 14, background: 'var(--color-slate-850)' }}>
          <h2>{request.flights?.flight_number || 'Unknown Flight'}</h2>
          <p>{request.flights?.origin} → {request.flights?.destination}</p>
          <p>Status: {request.status}</p>
          <p>Credits spent: {request.credits_spent}</p>
          {request.flights?.id && <a href={`/flights/${request.flights.id}`} style={{ color: 'var(--color-sky-400)', display: 'inline-block', marginBottom: 10 }}>View flight detail</a>}

          <button
            disabled={pendingIds.includes(request.id)}
            onClick={() => answerRequest(request.id)}
            style={{
              padding: 10,
              borderRadius: 8,
              border: 'none',
              background: pendingIds.includes(request.id) ? 'var(--color-slate-500)' : 'var(--color-green-500)',
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
