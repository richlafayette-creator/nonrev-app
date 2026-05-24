'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [message, setMessage] = useState('')

  async function loadRequests() {
    const { data } = await supabase
      .from('load_requests')
      .select('*, flights(*)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    setRequests(data || [])
  }

  useEffect(() => {
    loadRequests()
  }, [])

  async function answerRequest(requestId: number) {
    const intel = prompt('Enter load info, e.g. "Looks open", "Tight", "Full", "5 seats open"')
    if (!intel) return

    const response = await supabase
      .from('load_responses')
      .insert({
        request_id: requestId,
        intel,
        trust_score: 0
      })

    if (response.error) {
      setMessage('Response failed: ' + response.error.message)
      return
    }

    const update = await supabase
      .from('load_requests')
      .update({ status: 'answered' })
      .eq('id', requestId)

    if (update.error) {
      setMessage('Answered, but failed to close request: ' + update.error.message)
      return
    }

    setMessage('Response submitted and request closed.')
    loadRequests()
  }

  return (
    <main style={{ padding: 40, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16 }}>Flights</a>
        <a href="/requests" style={{ marginRight: 16 }}>Open Requests</a>
        <a href="/my-requests">My Requests</a>
      </nav>

      <h1>Open Load Requests</h1>
      {message && <p>{message}</p>}
      <p>Total open requests: {requests.length}</p>

      {requests.map((request) => (
        <div key={request.id} style={{ border: '1px solid #ccc', padding: 16, marginTop: 12 }}>
          <h2>{request.flights?.flight_number || 'Unknown Flight'}</h2>
          <p>{request.flights?.origin} → {request.flights?.destination}</p>
          <p>Status: {request.status}</p>
          <p>Credits spent: {request.credits_spent}</p>

          <button
            onClick={() => answerRequest(request.id)}
            style={{
              padding: 10,
              marginTop: 10,
              borderRadius: 8,
              border: '1px solid black',
              cursor: 'pointer'
            }}
          >
            Answer Request
          </button>
        </div>
      ))}
    </main>
  )
}
