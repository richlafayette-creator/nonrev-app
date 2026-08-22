'use client'

import { useEffect, useState } from 'react'
import { ANSWER_REWARD_CREDITS, rewardResponder } from '../../lib/monetization'
import { answerAccountLoadRequest, listOpenResponderLoadRequests } from '../../lib/loadRequestClient'
import type { AccountLoadRequest } from '../../lib/loadRequestAccountStore'
import { supabase } from '../../lib/supabase'

export default function RequestsPage() {
  const [requests, setRequests] = useState<AccountLoadRequest[]>([])
  const [message, setMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [pendingIds, setPendingIds] = useState<Array<string | number>>([])
  const [rewardBalance, setRewardBalance] = useState({ available: 0, reserved: 0, earned: 0 })
  const [responderToken, setResponderToken] = useState('')

  async function loadRequests(showMessage = false) {
    const data = await listOpenResponderLoadRequests()
    if (data.error) {
      setMessage(data.error)
    } else {
      setRequests(data.requests || [])
      setLastUpdated(new Date().toLocaleTimeString())
      if (showMessage) setMessage('Open requests refreshed.')
    }
  }

  useEffect(() => {
    try {
      setResponderToken(window.localStorage.getItem('nonrevy.responderAccessCode') || '')
    } catch {
      setResponderToken('')
    }
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

  function saveResponderToken(value: string) {
    setResponderToken(value)
    try {
      window.localStorage.setItem('nonrevy.responderAccessCode', value)
    } catch {
      // Responder can still use this session even if storage is unavailable.
    }
  }

  async function answerRequest(requestId: string | number) {
    if (pendingIds.includes(requestId)) {
      setMessage('Pending load submission by agent.')
      return
    }

    const intel = prompt('Load notes?')
    if (!intel) return
    const accessCode = responderToken || prompt('Responder access code?') || ''
    if (!accessCode) {
      setMessage('Responder access code is required.')
      return
    }
    saveResponderToken(accessCode)

    setPendingIds((ids) => [...ids, requestId])
    const result = await answerAccountLoadRequest(requestId, intel, accessCode)
    if (result.error) {
      setMessage(result.error)
      setPendingIds((ids) => ids.filter((id) => id !== requestId))
      return
    }

    setRewardBalance((balance) => rewardResponder(balance, ANSWER_REWARD_CREDITS))
    setMessage(result.detail || 'Response submitted and request closed.')
    setRequests((items) => items.filter((item) => item.id !== requestId))
    setPendingIds((ids) => ids.filter((id) => id !== requestId))
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
          <p style={{ color: '#34d399' }}>Responder reward scaffold: +{ANSWER_REWARD_CREDITS} credits per accepted answer · Earned this session: {rewardBalance.earned}</p>
        </div>
        <button onClick={() => loadRequests(true)} style={{ alignSelf: 'start', padding: 12, borderRadius: 10, border: 'none', background: '#c084fc', color: '#020617', fontWeight: 'bold' }}>
          Refresh requests
        </button>
      </section>
      <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 16 }}>
        Responder access code{' '}
        <input
          type="password"
          value={responderToken}
          onChange={(event) => saveResponderToken(event.target.value)}
          placeholder="Required to answer"
          style={{ padding: 10, borderRadius: 10, marginLeft: 8 }}
        />
      </label>
      {message && <p style={{ color: '#38bdf8' }}>{message}</p>}

      {requests.map((request) => (
        <div className="flight-card" key={request.id} style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 14, background: '#0f172a' }}>
          <h2>{request.flightNumber || 'Unknown Flight'}</h2>
          <p>{request.origin} → {request.destination}</p>
          <p>Status: {request.statusLabel}</p>
          <p>Requested: {new Date(request.createdAt).toLocaleString()}</p>
          {request.flightId && <a href={`/flights/${request.flightId}`} style={{ color: '#38bdf8', display: 'inline-block', marginBottom: 10 }}>View flight detail</a>}

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
