'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function recommendation(score: number) {
  if (score >= 75) return { text: 'Strong', color: '#22c55e', emoji: '🟢' }
  if (score >= 55) return { text: 'Verify', color: '#facc15', emoji: '🟡' }
  return { text: 'Avoid', color: '#ef4444', emoji: '🔴' }
}

export default function Home() {
  const [flights, setFlights] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [userEmail, setUserEmail] = useState('')

  async function loadData() {
    const flightsResult = await supabase.from('flights').select('*').order('score', { ascending: false }).limit(50)
    const requestsResult = await supabase.from('load_requests').select('id, flight_id, status')

    setFlights(flightsResult.data || [])
    setRequests(requestsResult.data || [])

    const { data } = await supabase.auth.getUser()
    setUserEmail(data.user?.email || '')
  }

  useEffect(() => {
    loadData()
  }, [])

  async function requestLoad(flightId: number) {
    const { data } = await supabase.auth.getUser()

    if (!data.user) {
      setMessage('Please login before requesting a load.')
      return
    }

    const { error } = await supabase.from('load_requests').insert({
      flight_id: flightId,
      credits_spent: 1,
      status: 'open',
      user_id: data.user.id
    })

    if (error) setMessage('Request failed: ' + error.message)
    else {
      setMessage('Load request created.')
      loadData()
    }
  }

  const filtered = flights.filter((flight) =>
    `${flight.origin} ${flight.destination} ${flight.flight_number}`.toLowerCase().includes(search.toLowerCase())
  )

  function hasOpenRequest(flightId: number) {
    return requests.some((r) => r.flight_id === flightId && r.status === 'open')
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #020617, #0f172a, #111827)',
      color: 'white',
      padding: 28,
      fontFamily: 'Arial'
    }}>
      <nav style={{ marginBottom: 28, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <a href="/" style={{ color: '#38bdf8' }}>Flights</a>
        <a href="/requests" style={{ color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ color: '#22c55e' }}>Outcomes</a>
        <a href="/login" style={{ color: '#f472b6' }}>Login</a>
        {userEmail && <span style={{ marginLeft: 'auto', color: '#38bdf8' }}>{userEmail}</span>}
      </nav>

      <section style={{
        padding: 24,
        borderRadius: 24,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        marginBottom: 24
      }}>
        <h1 style={{ fontSize: 42, margin: 0 }}>Best Flights Right Now</h1>
        <p style={{ color: '#94a3b8', fontSize: 18 }}>
          Nonrev decision engine: find the strongest move fast.
        </p>

        <input
          placeholder="Search route or flight: LAX, HNL, UA123"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            marginTop: 16,
            padding: 16,
            width: '100%',
            maxWidth: 600,
            borderRadius: 14,
            border: '1px solid #334155',
            background: '#020617',
            color: 'white',
            fontSize: 16
          }}
        />

        {message && <p style={{ color: '#38bdf8' }}>{message}</p>}
      </section>

      <div style={{ display: 'grid', gap: 18 }}>
        {filtered.map((flight) => {
          const rec = recommendation(flight.score)

          return (
            <div key={flight.id} style={{
              padding: 22,
              borderRadius: 22,
              background: 'rgba(15,23,42,0.92)',
              border: `1px solid ${rec.color}`,
              boxShadow: `0 0 24px ${rec.color}33`
            }}>
              <h2 style={{ fontSize: 30, margin: 0 }}>{flight.flight_number}</h2>
              <p style={{ fontSize: 22, color: '#e2e8f0' }}>
                {flight.origin} → {flight.destination}
              </p>
              <h3 style={{ color: rec.color }}>{rec.emoji} {rec.text}</h3>
              <p style={{ color: '#94a3b8' }}>
                Aircraft: {flight.aircraft} | Status: {flight.status} | Score: {flight.score}
              </p>

              <button
                onClick={() => requestLoad(flight.id)}
                disabled={hasOpenRequest(flight.id)}
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: hasOpenRequest(flight.id) ? '#475569' : '#38bdf8',
                  color: 'black',
                  fontWeight: 'bold',
                  cursor: hasOpenRequest(flight.id) ? 'not-allowed' : 'pointer'
                }}
              >
                {hasOpenRequest(flight.id) ? 'Load Request Open' : 'Verify Load - 1 Credit'}
              </button>
            </div>
          )
        })}
      </div>
    </main>
  )
}
