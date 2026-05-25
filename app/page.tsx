'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { flightMatchesSearch } from '../lib/flightSearch'
import { delayRiskScore } from '../lib/intelligence'
import { REQUEST_CREDIT_COST, canSpendCredits, settleRequestCredit, spendRequestCredit } from '../lib/monetization'

function recommendation(score: number) {
  if (score >= 75) return '🟢 Strong'
  if (score >= 55) return '🟡 Verify'
  return '🔴 Avoid'
}

function airlineFromFlightNumber(flightNumber?: string) {
  const match = (flightNumber || '').toUpperCase().match(/^[A-Z]+/)
  return match?.[0] || 'Unknown'
}

export default function Home() {
  const [flights, setFlights] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [airlineFilter, setAirlineFilter] = useState('all')
  const [originFilter, setOriginFilter] = useState('all')
  const [destinationFilter, setDestinationFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [creditBalance, setCreditBalance] = useState({ available: 12, reserved: 0, earned: 0 })

  async function loadFlights(showMessage = false) {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/flights?select=*&order=created_at.desc&limit=100`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } }
    )
    const data = await res.json()
    setFlights(Array.isArray(data) ? data : [])
    setLastUpdated(new Date().toLocaleTimeString())
    if (showMessage) setMessage(Array.isArray(data) ? 'Flight data refreshed.' : 'Could not refresh flight data.')
  }

  useEffect(() => {
    loadFlights()
    const refresh = window.setInterval(() => loadFlights(), 30000)
    const flightChannel = supabase
      .channel('flight-updates-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flights' }, () => {
        loadFlights()
        setMessage('Realtime flight update received.')
      })
      .subscribe()

    async function loadUser() {
      const { data } = await supabase.auth.getUser()
      setUserEmail(data.user?.email || '')
    }

    loadUser()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || '')
    })

    return () => {
      window.clearInterval(refresh)
      supabase.removeChannel(flightChannel)
      listener.subscription.unsubscribe()
    }
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    setUserEmail('')
    setMessage('Logged out.')
  }

  async function requestLoad(flightId: number) {
    if (!canSpendCredits(creditBalance, REQUEST_CREDIT_COST)) {
      setMessage('Not enough scaffold credits for this request.')
      return
    }

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

    const heldBalance = spendRequestCredit(creditBalance, REQUEST_CREDIT_COST)
    setCreditBalance(heldBalance)

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
      setCreditBalance(settleRequestCredit(heldBalance, REQUEST_CREDIT_COST))
      setMessage('Load request created.')
    } else if (res.status === 409) {
      setCreditBalance(creditBalance)
      setMessage('Load request already pending.')
    } else {
      setCreditBalance(creditBalance)
      setMessage(`Request failed: ${res.status}`)
    }
  }

  const airlineOptions = useMemo(
    () => Array.from(new Set(flights.map((flight) => airlineFromFlightNumber(flight.flight_number)))).sort(),
    [flights]
  )
  const originOptions = useMemo(
    () => Array.from(new Set(flights.map((flight) => flight.origin).filter(Boolean))).sort(),
    [flights]
  )
  const destinationOptions = useMemo(
    () => Array.from(new Set(flights.map((flight) => flight.destination).filter(Boolean))).sort(),
    [flights]
  )

  const filtered = flights.filter((flight) => {
    if (!flightMatchesSearch(flight, search)) return false
    if (airlineFilter !== 'all' && airlineFromFlightNumber(flight.flight_number) !== airlineFilter) return false
    if (originFilter !== 'all' && flight.origin !== originFilter) return false
    if (destinationFilter !== 'all' && flight.destination !== destinationFilter) return false
    return true
  })

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/agent" style={{ marginRight: 16, color: '#a78bfa' }}>Agent</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        {userEmail ? (
          <>
            <span style={{ color: '#38bdf8', marginRight: 12 }}>{userEmail}</span>
            <button onClick={logout} style={{ padding: 8, borderRadius: 8, border: 'none' }}>Logout</button>
          </>
        ) : (
          <a href="/login" style={{ color: '#f472b6' }}>Login</a>
        )}
      </nav>

      <section className="hero-grid">
        <div>
          <h1 style={{ fontSize: 42 }}>Best Flights Right Now</h1>
          <p style={{ color: '#94a3b8' }}>Flights loaded: {flights.length} · Showing: {filtered.length} · Auto-refresh every 30s{lastUpdated ? ` · Last refresh ${lastUpdated}` : ''}</p>
        </div>
        <aside className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a' }}>
          <strong>Credits scaffold</strong>
          <p style={{ color: '#cbd5e1', marginBottom: 8 }}>Balance: {creditBalance.available} · Reserved: {creditBalance.reserved}</p>
          <a href="/credits" style={{ color: '#fbbf24' }}>Manage credits</a>
        </aside>
      </section>

      {message && <p style={{ color: '#38bdf8' }}>{message}</p>}

      <section className="filter-panel" style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, marginBottom: 20, background: '#0f172a' }}>
        <input
          placeholder="Search LAX, HNL, LAX-HNL, LAX to HNL, or flight number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: 14, width: '100%', maxWidth: 520, borderRadius: 12, marginBottom: 12 }}
        />
        <div className="filter-grid">
          <select value={airlineFilter} onChange={(e) => setAirlineFilter(e.target.value)} style={{ padding: 12, borderRadius: 10 }}>
            <option value="all">All airlines</option>
            {airlineOptions.map((airline) => <option key={airline} value={airline}>{airline}</option>)}
          </select>
          <select value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} style={{ padding: 12, borderRadius: 10 }}>
            <option value="all">All origins</option>
            {originOptions.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
          </select>
          <select value={destinationFilter} onChange={(e) => setDestinationFilter(e.target.value)} style={{ padding: 12, borderRadius: 10 }}>
            <option value="all">All destinations</option>
            {destinationOptions.map((destination) => <option key={destination} value={destination}>{destination}</option>)}
          </select>
          <button onClick={() => loadFlights(true)} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#38bdf8', fontWeight: 'bold' }}>
            Refresh now
          </button>
        </div>
      </section>

      {filtered.map((flight) => (
        <div className="flight-card" key={flight.id} style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 14, background: '#0f172a' }}>
          <h2>{flight.flight_number}</h2>
          <h3>{recommendation(flight.score)}</h3>
          <p>{flight.origin} → {flight.destination}</p>
          <p>Airline: {airlineFromFlightNumber(flight.flight_number)}</p>
          <p>Aircraft: {flight.aircraft}</p>
          <p>Status: {flight.status}</p>
          <p>Score: {flight.score}</p>
          <p>Delay risk: {delayRiskScore(flight).label} ({delayRiskScore(flight).score}/100)</p>
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
