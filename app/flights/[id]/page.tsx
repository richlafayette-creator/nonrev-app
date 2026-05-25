'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Flight = {
  id: number
  flight_number?: string
  origin?: string
  destination?: string
  aircraft?: string
  status?: string
  score?: number
  created_at?: string
}

function recommendation(score?: number) {
  if ((score || 0) >= 75) return '🟢 Strong'
  if ((score || 0) >= 55) return '🟡 Verify'
  return '🔴 Avoid'
}

export default function FlightDetailPage() {
  const params = useParams<{ id: string }>()
  const [flight, setFlight] = useState<Flight | null>(null)
  const [message, setMessage] = useState('Loading flight details...')

  useEffect(() => {
    async function loadFlight() {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/flights?id=eq.${params.id}&select=*&limit=1`,
        { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } }
      )
      const data = await res.json()
      if (Array.isArray(data) && data[0]) {
        setFlight(data[0])
        setMessage('')
      } else {
        setMessage('Flight not found or unavailable.')
      }
    }

    if (params.id) loadFlight()
  }, [params.id])

  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/requests" style={{ color: '#c084fc' }}>Open Requests</a>
      </nav>

      {message && <p style={{ color: '#38bdf8' }}>{message}</p>}

      {flight && (
        <section style={{ maxWidth: 760, background: '#0f172a', border: '1px solid #334155', borderRadius: 22, padding: 24 }}>
          <p style={{ color: '#94a3b8', marginTop: 0 }}>Flight detail scaffold</p>
          <h1 style={{ fontSize: 42, margin: '8px 0' }}>{flight.flight_number || `Flight ${flight.id}`}</h1>
          <h2>{recommendation(flight.score)}</h2>
          <p style={{ color: '#38bdf8', fontSize: 22, fontWeight: 'bold' }}>{flight.origin} → {flight.destination}</p>
          <p>Aircraft: {flight.aircraft || 'Unknown'}</p>
          <p>Status: {flight.status || 'Unknown'}</p>
          <p>Score: {flight.score ?? 'Not scored'}</p>
          <p style={{ color: '#cbd5e1' }}>Created: {flight.created_at || 'Not available'}</p>
          <a href="/watchlist" style={{ display: 'inline-block', marginTop: 12, padding: 12, borderRadius: 10, background: '#facc15', color: '#020617', textDecoration: 'none', fontWeight: 'bold' }}>
            Watch this route scaffold
          </a>
        </section>
      )}
    </main>
  )
}
