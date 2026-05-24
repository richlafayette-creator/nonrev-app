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
  }

  useEffect(() => {
    loadData()

    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setUserEmail(data.user.email)
      }
    })
  }, [])

  async function requestLoad(flightId: number) {
    const { error } = await supabase.from('load_requests').insert({
      flight_id: flightId,
      credits_spent: 1,
      status: 'open'
    })
    if (error) setMessage('Request failed: ' + error.message)
    else {
      setMessage('Load request created.')
      loadData()
    }
  }

  async function submitOutcome(flightId: number, gotOn: boolean) {
    const { error } = await supabase.from('user_outcomes').insert({
      flight_id: flightId,
      got_on: gotOn,
      notes: gotOn ? 'User reported got on' : 'User reported did not get on'
    })
    if (error) setMessage('Outcome failed: ' + error.message)
    else setMessage(gotOn ? 'Outcome saved: got on.' : 'Outcome saved: did not get on.')
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
      <nav style={{ marginBottom: 28, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <a href="/" style={{ color: '#38bdf8' }}>Flights</a>
        <a href="/requests" style={{ color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ color: '#22c55e' }}>Outcomes</a>

        {!userEmail && (
          <a href="/login" style={{ color: '#f472b6' }}>
            Login
          </a>
        )}

        {userEmail && (
          <div style={{
            marginLeft: 'auto',
            color: '#38bdf8',
            fontWeight: 'bold'
          }}>
            {userEmail}
          </div>
        )}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                <div>
                  <h2 style={{ fontSize: 30, margin: 0 }}>{flight.flight_number}</h2>
                  <p style={{ fontSize: 22, margin: '8px 0', color: '#e2e8f0' }}>
                    {flight.origin} → {flight.destination}
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 26, color: rec.color, fontWeight: 'bold' }}>
                    {rec.emoji} {rec.text}
                  </div>
                  <div style={{ color: '#cbd5e1' }}>Score: {flight.score}</div>
                </div>
              </div>

              <p style={{ color: '#94a3b8' }}>
                Aircraft: {flight.aircraft} | Status: {flight.status}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
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

                <button onClick={() => submitOutcome(flight.id, true)} style={{
                  padding: '12px 16px', borderRadius: 12, border: 'none', background: '#22c55e', fontWeight: 'bold'
                }}>
                  Got On
                </button>

                <button onClick={() => submitOutcome(flight.id, false)} style={{
                  padding: '12px 16px', borderRadius: 12, border: 'none', background: '#ef4444', color: 'white', fontWeight: 'bold'
                }}>
                  Did Not Get On
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
