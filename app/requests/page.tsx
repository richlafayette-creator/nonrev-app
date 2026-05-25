'use client'

import { useEffect, useState } from 'react'

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [message, setMessage] = useState('')

  async function loadRequests() {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/load_requests?select=*,flights(*)&order=created_at.desc&limit=50`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } }
    )

    const data = await res.json()

    if (Array.isArray(data)) {
      setRequests(data)
    } else {
      setMessage(JSON.stringify(data))
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

async function answerRequest(requestId: number) {
  const notes = prompt('Load notes?')

  if (!notes) return

  const res = await fetch(
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
        notes
      })
    }
  )

  if (res.ok) {
    alert('Response submitted')
    window.location.reload()
  } else {
    alert('Failed to submit response')
  }
}
  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        <a href="/login" style={{ color: '#f472b6' }}>Login</a>
      </nav>

      <h1>Open Load Requests</h1>
      <p>Requests loaded: {requests.length}</p>
      {message && <pre>{message}</pre>}

      {requests.map((request) => (
        <div key={request.id} style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 14, background: '#0f172a' }}>
          <h2>{request.flights?.flight_number || 'Unknown Flight'}</h2>
          <p>{request.flights?.origin} → {request.flights?.destination}</p>
          <p>Status: {request.status}</p>
          <p>Credits spent: {request.credits_spent}</p>
<p>Credits spent: {request.credits_spent}</p>

<button
  onClick={() => answerRequest(request.id)}
  style={{
    padding: 10,
    borderRadius: 8,
    border: 'none',
    background: '#22c55e',
    fontWeight: 'bold',
    marginTop: 10
  }}
>
  Answer Request
</button> 
       </div>
      ))}
    </main>
  )
}
