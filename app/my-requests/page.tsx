'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadCommunityLoadRequests, type CommunityLoadRequest } from '../../lib/communityLoads'
import { cancelAccountLoadRequest, listAccountLoadRequests } from '../../lib/loadRequestClient'
import type { AccountLoadRequest } from '../../lib/loadRequestAccountStore'
import { supabase } from '../../lib/supabase'

function requestIsAnswered(request: AccountLoadRequest) {
  return (request.responses?.length || 0) > 0 || request.status === 'answered'
}

function requestStatusLabel(request: AccountLoadRequest) {
  if (request.status === 'cancelled') return 'Cancelled'
  if (request.status === 'closed') return 'Closed'
  if (request.status === 'expired') return 'Expired'
  if (requestIsAnswered(request)) return 'Answered'
  return 'Open'
}

function formatRequestDate(request: AccountLoadRequest) {
  const value = request.scheduledDepartureUtc || request.travelDate
  if (!value) return request.travelDate
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return request.travelDate || value
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(parsed)} UTC`
}

function requestEmptyResponseText(request: AccountLoadRequest) {
  if (request.status === 'cancelled') return 'Cancelled by you. It remains here for history.'
  if (request.status === 'closed') return 'Closed. It remains here for history.'
  if (request.status === 'expired') return 'Expired before a response was added.'
  return 'Waiting for a response.'
}

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<AccountLoadRequest[]>([])
  const [localRequests, setLocalRequests] = useState<CommunityLoadRequest[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [lastUpdated, setLastUpdated] = useState('')
  const [notification, setNotification] = useState('')
  const [pendingCancelId, setPendingCancelId] = useState<string | number | null>(null)

  async function loadRequests() {
    setLocalRequests(loadCommunityLoadRequests())
    const result = await listAccountLoadRequests()
    setRequests(result.requests || [])
    if (result.error) {
      setNotification("Couldn't refresh account requests right now. Your request history below is still available.")
    } else if (result.status === 'missing-config' || result.status === 'unreachable') {
      setNotification("Couldn't refresh account requests right now. Your request history below is still available.")
    } else {
      setNotification('')
    }
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
          setNotification('A load response arrived. Refreshing your requests.')
        }
      )
      .subscribe()
    const refreshLocalRequests = () => setLocalRequests(loadCommunityLoadRequests())
    window.addEventListener('nonrevy-community-load-requests-updated', refreshLocalRequests)
    window.addEventListener('storage', refreshLocalRequests)

    return () => {
      window.clearInterval(refresh)
      supabase.removeChannel(channel)
      window.removeEventListener('nonrevy-community-load-requests-updated', refreshLocalRequests)
      window.removeEventListener('storage', refreshLocalRequests)
    }
  }, [])

  const summary = useMemo(() => {
    const answered = requests.filter(requestIsAnswered).length
    const waiting = requests.filter((request) => request.status === 'open' || request.status === 'awaiting_response').length
    const closed = requests.filter((request) => request.status === 'closed' || request.status === 'expired' || request.status === 'cancelled').length
    return {
      answered,
      waiting: waiting + localRequests.filter((request) => request.status === 'Open').length,
      closed
    }
  }, [requests, localRequests])

  const visibleRequests = requests.filter((request) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'answered') return requestIsAnswered(request)
    if (statusFilter === 'open') return request.status === 'open' || request.status === 'awaiting_response'
    return request.status === statusFilter
  })

  async function handleCancel(requestId: string | number) {
    if (pendingCancelId) return
    setPendingCancelId(requestId)
    const result = await cancelAccountLoadRequest(requestId)
    await loadRequests()
    setNotification(result.error || result.detail || 'Request cancelled.')
    setPendingCancelId(null)
  }

  return (
    <main className="app-shell nonrevy-traveler-page nonrevy-my-requests-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Search</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/beta-feedback" style={{ color: '#c084fc' }}>Feedback</a>
      </nav>

      <section className="hero-grid nonrevy-traveler-page__inner">
        <div>
          <h1 style={{ fontSize: 40 }}>My Load Requests</h1>
          <p style={{ color: '#94a3b8' }}>Track requests you sent for real scheduled flights. Refreshes every 25s{lastUpdated ? ` · Last refresh ${lastUpdated}` : ''}</p>
        </div>
        <button onClick={loadRequests} style={{ alignSelf: 'start', padding: 12, borderRadius: 10, border: 'none', background: '#facc15', color: '#020617', fontWeight: 'bold' }}>
          Refresh my requests
        </button>
      </section>
      {notification && <p className="nonrevy-traveler-status nonrevy-traveler-status--warning" style={{ color: '#f472b6' }}>{notification}</p>}

      <section className="stats-grid nonrevy-traveler-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '18px 0' }}>
        <div className="mini-card nonrevy-traveler-metric" style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}><strong>{requests.length + localRequests.length}</strong><p>Total requests</p></div>
        <div className="mini-card nonrevy-traveler-metric" style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}><strong>{summary.waiting}</strong><p>Open</p></div>
        <div className="mini-card nonrevy-traveler-metric" style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}><strong>{summary.answered}</strong><p>Answered</p></div>
        <div className="mini-card nonrevy-traveler-metric" style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}><strong>{summary.closed}</strong><p>History</p></div>
      </section>

      <label className="nonrevy-traveler-filter" style={{ display: 'block', color: '#cbd5e1', marginBottom: 16 }}>
        Status filter{' '}
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ padding: 10, borderRadius: 10, marginLeft: 8 }}>
          <option value="all">All</option>
          <option value="open">Active</option>
          <option value="answered">Answered</option>
          <option value="cancelled">Cancelled</option>
          <option value="closed">Closed</option>
          <option value="expired">Expired</option>
        </select>
      </label>

      {visibleRequests.map((request) => (
        <article className="flight-card nonrevy-traveler-row nonrevy-request-row" key={request.id} style={{ border: '1px solid #334155', padding: 18, marginTop: 12, borderRadius: 18, background: '#0f172a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ marginTop: 0 }}>{request.flightNumber || 'Unknown Flight'}</h2>
            <strong className="nonrevy-traveler-badge" style={{ color: requestIsAnswered(request) ? '#22c55e' : request.status === 'cancelled' ? '#94a3b8' : '#facc15' }}>
              {requestStatusLabel(request)}
            </strong>
          </div>

          <p style={{ color: '#38bdf8' }}>{request.origin} → {request.destination}</p>
          <p>{formatRequestDate(request)} · {request.carrier}</p>
          {request.flightId && <a href={`/flights/${request.flightId}`} style={{ color: '#38bdf8' }}>View flight detail</a>}
          {request.status === 'open' ? (
            <button
              type="button"
              onClick={() => handleCancel(request.id)}
              disabled={pendingCancelId === request.id}
              style={{ marginLeft: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid #facc15', background: 'transparent', color: '#facc15', fontWeight: 'bold' }}
            >
              {pendingCancelId === request.id ? 'Cancelling...' : 'Cancel request'}
            </button>
          ) : null}

          {(request.responses?.length || 0) > 0 ? (
            <div className="nonrevy-request-response" style={{ marginTop: 12 }}>
              <strong>Load response</strong>
              {request.responses?.map((response) => (
                <div className="nonrevy-request-response__item" key={response.id} style={{ background: '#020617', border: '1px solid #334155', padding: 12, marginTop: 8, borderRadius: 10, color: 'white' }}>
                  <p style={{ marginTop: 0 }}>{response.intel}</p>
                  {response.createdAt ? <small style={{ color: '#94a3b8' }}>Answered {new Date(response.createdAt).toLocaleString()}</small> : null}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: request.status === 'cancelled' ? '#94a3b8' : '#facc15' }}>
              {requestEmptyResponseText(request)}
            </p>
          )}
        </article>
      ))}

      {localRequests.length ? (
        <section style={{ marginTop: 24 }}>
          <h2>Earlier requests</h2>
          <p style={{ color: '#94a3b8' }}>Older beta requests are shown here for continuity.</p>
          {localRequests.map((request) => (
            <article className="flight-card nonrevy-traveler-row nonrevy-request-row" key={request.id} style={{ border: '1px solid #334155', padding: 18, marginTop: 12, borderRadius: 18, background: '#0f172a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ marginTop: 0 }}>{request.flightNumber}</h3>
                <strong style={{ color: '#facc15' }}>{request.status}</strong>
              </div>
              <p style={{ color: '#38bdf8' }}>{request.origin} → {request.destination}</p>
              <p>{request.date} · {request.carrier}</p>
              <small style={{ color: '#94a3b8' }}>Requested {new Date(request.createdAt).toLocaleString()}</small>
            </article>
          ))}
        </section>
      ) : null}

      {!visibleRequests.length && !localRequests.length ? (
        <section className="flight-card nonrevy-traveler-empty" style={{ border: '1px dashed #334155', padding: 18, marginTop: 18, borderRadius: 18, background: '#0f172a' }}>
          <h2 style={{ marginTop: 0 }}>No load requests yet.</h2>
          <p style={{ color: '#cbd5e1', marginBottom: 12 }}>Open a scheduled search result and choose Request load when the flight number, route, and departure time are confirmed.</p>
          <a href="/" style={{ color: '#38bdf8', fontWeight: 'bold' }}>Search flights</a>
        </section>
      ) : null}
    </main>
  )
}
