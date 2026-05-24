'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function recommendation(score: number) {
  if (score >= 75) return '🟢 Strong'
  if (score >= 55) return '🟡 Verify'
  return '🔴 Avoid'
}

export default function Home() {
  const [flights, setFlights] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadFlights() {
      const { data, error } = await supabase
        .from('flights')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        setMessage(error.message)
      } else {
        setFlights(data || [])
      }
    }

    loadFlights()
  }, [])

  const cleanedSearch = search
    .toLowerCase()
    .replace(/\bto\b/g, '')
    .replace(/-/g, ' ')
    .trim()

  const filtered = !cleanedSearch
    ? flights
    : flights.filter((flight) => {
        const route = `${flight.origin} ${flight.destination} ${flight.flight_number}`.toLowerCase()
        return route.includes(cleanedSearch)
      })

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        <a href="/login" style={{ color: '#f472b6' }}>Login</a>
      </nav>

      <h1 style={{ fontSize: 42 }}>Best Flights Right Now</h1>
      <p style={{ color: '#94a3b8' }}>Flights loaded: {flights.length}</p>

      <input
        placeholder="Search LAX, HNL, LAX-HNL, or LAX to HNL"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: 14, width: '100%', maxWidth: 520, borderRadius: 12, marginBottom: 20 }}
      />

      {message && <p style={{ color: '#f87171' }}>{message}</p>}

      {filtered.map((flight) => (
        <div key={flight.id} style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 14, background: '#0f172a' }}>
          <h2>{flight.flight_number}</h2>
          <h3>{recommendation(flight.score)}</h3>
          <p>{flight.origin} → {flight.destination}</p>
          <p>Aircraft: {flight.aircraft}</p>
          <p>Status: {flight.status}</p>
          <p>Score: {flight.score}</p>
        </div>
      ))}
    </main>
  )
}
