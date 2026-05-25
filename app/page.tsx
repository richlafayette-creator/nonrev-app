'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { flightMatchesSearch } from '../lib/flightSearch'

function recommendation(score: number) {
  if (score >= 75) return '🟢 Strong'
  if (score >= 55) return '🟡 Verify'
  return '🔴 Avoid'
}

export default function Home() {
  const [flights, setFlights] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [userEmail, setUserEmail] = useState('')

  async function loadFlights() {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/flights?select=*&order=created_at.desc&limit=100`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } }
    )
    const data = await res.json()
    setFlights(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    loadFlights()

    async function loadUser() {
      const { data } = await supabase.auth.getUser()
      setUserEmail(data.user?.email || '')
    }

    loadUser()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || '')
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    setUserEmail('')
    setMessage('Logged out.')
  }

  async function requestLoad(flightId: number) {
    const checkRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/load_requests?flight_id=eq.${flightId}&status=eq.open`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        }
      }
    )

    const existing = await checkRes.json()

    if (Array.isArray(existing) && existing.length > 0) {
      setMessage('Load request already open.')
      return
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/load_requests`,
      {
        method: 'POST',
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          flight_id: flightId,
          credits_spent: 1,
          status: 'open'
        })
      }
    )

    if (res.ok) {
      setMessage('Load request created.')
    } else if (res.status === 409) {
      setMessage('Load request already pending.')
    } else {
      setMessage(`Request failed: ${res.status}`)
    }
  }

  const filtered = flights.filter((flight) => flightMatchesSearch(flight, search))

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/agent" style={{ marginRight: 16, color: '#a78bfa' }}>Agent</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        {userEmail ? (
          <>
            <span style={{ color: '#38bdf8', marginRight: 12 }}>{userEmail}</span>
            <button
              onClick={logout}
              style={{ padding: 8, borderRadius: 8, border: 'none' }}
            >
              Logout
            </button>
          </>
        ) : (
          <a href="/login" style={{ color: '#f472b6' }}>Login</a>
        )}
      </nav>

      <h1 style={{ fontSize: 42 }}>Best Flights Right Now</h1>
      <p style={{ color: '#94a3b8' }}>Flights loaded: {flights.length}</p>
      {message && <p style={{ color: '#38bdf8' }}>{message}</p>}

      <input
        placeholder="Search LAX, HNL, LAX-HNL, LAX to HNL, or flight number"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: 14, width: '100%', maxWidth: 520, borderRadius: 12, marginBottom: 20 }}
      />

      {filtered.map((flight) => (
        <div key={flight.id} style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 14, background: '#0f172a' }}>
          <h2>{flight.flight_number}</h2>
          <h3>{recommendation(flight.score)}</h3>
          <p>{flight.origin} → {flight.destination}</p>
          <p>Aircraft: {flight.aircraft}</p>
          <p>Status: {flight.status}</p>
          <p>Score: {flight.score}</p>
          <a href={`/flights/${flight.id}`} style={{ display: 'inline-block', marginRight: 12, marginBottom: 12, color: '#38bdf8' }}>View details</a>

          <button
            onClick={() => requestLoad(flight.id)}
            style={{ padding: 12, borderRadius: 10, border: 'none', background: '#38bdf8', fontWeight: 'bold' }}
          >
            Verify Load - 1 Credit
          </button>
        </div>
      ))}
    </main>
  )
}
