'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { delayRiskScore } from '../../../lib/intelligence'
import { allFlightFields, fieldValue, richFlightFieldLabels } from '../../../lib/flightDataScaffold'
import { supabase } from '../../../lib/supabase'

type Flight = {
  id: number
  flight_number?: string
  origin?: string
  destination?: string
  aircraft?: string
  status?: string
  score?: number
  created_at?: string
  [key: string]: unknown
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
  const [lastUpdated, setLastUpdated] = useState('')

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
        setLastUpdated(new Date().toLocaleTimeString())
      } else {
        setMessage('Flight not found or unavailable.')
      }
    }

    if (params.id) loadFlight()
    const refresh = window.setInterval(() => {
      if (params.id) loadFlight()
    }, 30000)
    const flightChannel = supabase
      .channel(`flight-detail-${params.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights', filter: `id=eq.${params.id}` }, () => loadFlight())
      .subscribe()

    return () => {
      window.clearInterval(refresh)
      supabase.removeChannel(flightChannel)
    }
  }, [params.id])

  const risk = flight ? delayRiskScore(flight) : null

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/requests" style={{ color: '#c084fc' }}>Open Requests</a>
      </nav>

      {message && <p style={{ color: '#38bdf8' }}>{message}</p>}

      {flight && (
        <section className="flight-card" style={{ maxWidth: 760, background: '#0f172a', border: '1px solid #334155', borderRadius: 22, padding: 24 }}>
          <p style={{ color: '#94a3b8', marginTop: 0 }}>Flight detail scaffold · Auto-refresh every 30s{lastUpdated ? ` · Last refresh ${lastUpdated}` : ''}</p>
          <h1 style={{ fontSize: 42, margin: '8px 0' }}>{flight.flight_number || `Flight ${flight.id}`}</h1>
          <h2>{recommendation(flight.score)}</h2>
          <p style={{ color: '#38bdf8', fontSize: 22, fontWeight: 'bold' }}>{flight.origin} → {flight.destination}</p>
          <p>Aircraft: {flight.aircraft || 'Unknown'}</p>
          <p>Status: {flight.status || 'Unknown'}</p>
          <p>Score: {flight.score ?? 'Not scored'}</p>
          <section style={{ marginTop: 18 }}>
            <h3>Richer flight detail placeholders</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {richFlightFieldLabels.map((field) => (
                <div key={field.key} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                  <small style={{ color: '#94a3b8' }}>{field.label}</small>
                  <p style={{ margin: '4px 0 0' }}>{fieldValue(flight, field.key)}</p>
                </div>
              ))}
            </div>
            <div style={{ border: '1px dashed #475569', borderRadius: 14, padding: 14, marginTop: 12, background: '#020617' }}>
              <strong>Airport map/GPS placeholder</strong>
              <p style={{ color: '#cbd5e1', marginBottom: 0 }}>
                Future airport maps, walking directions, lounge proximity, terminal GPS, and gate-level wayfinding will render here when provider data is connected.
              </p>
            </div>
          </section>
          {risk && (
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, marginTop: 12, background: '#020617' }}>
              <strong>Delay-risk scaffold: {risk.label} ({risk.score}/100)</strong>
              <ul style={{ color: '#cbd5e1' }}>
                {risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          )}
          <details style={{ marginTop: 12 }}>
            <summary style={{ color: '#38bdf8', cursor: 'pointer' }}>Show all DB fields</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
              {allFlightFields(flight).map(([key, value]) => (
                <div key={key} style={{ border: '1px solid #334155', borderRadius: 10, padding: 8, background: '#020617' }}>
                  <small style={{ color: '#94a3b8' }}>{key}</small>
                  <p style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{value === null || value === undefined || value === '' ? 'Not available yet' : String(value)}</p>
                </div>
              ))}
            </div>
          </details>
          <p style={{ color: '#cbd5e1' }}>Created: {flight.created_at || 'Not available'}</p>
          <a href="/watchlist" style={{ display: 'inline-block', marginTop: 12, padding: 12, borderRadius: 10, background: '#facc15', color: '#020617', textDecoration: 'none', fontWeight: 'bold' }}>
            Watch this route scaffold
          </a>
        </section>
      )}
    </main>
  )
}
