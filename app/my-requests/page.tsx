'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<any[]>([])

  async function loadRequests() {
    const { data } = await supabase
      .from('load_requests')
      .select(`
        *,
        flights(*),
        load_responses(*)
      `)
      .order('created_at', { ascending: false })

    setRequests(data || [])
  }

  useEffect(() => {
    loadRequests()

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
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <main style={{ padding: 40, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16 }}>Flights</a>
        <a href="/requests" style={{ marginRight: 16 }}>Open Requests</a>
        <a href="/my-requests">My Requests</a>
      </nav>

      <h1>My Load Requests</h1>

      <p>Total requests: {requests.length}</p>

      {requests.map((request) => (
        <div
          key={request.id}
          style={{
            border: '1px solid #ccc',
            padding: 16,
            marginTop: 12,
            borderRadius: 8
          }}
        >
          <h2>
            {request.flights?.flight_number}
          </h2>

          <p>
            {request.flights?.origin} → {request.flights?.destination}
          </p>

          <p>
            Status: {request.status}
          </p>

          {request.load_responses?.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <strong>Responses:</strong>

              {request.load_responses.map((response: any) => (
                <div
                  key={response.id}
                  style={{
                    background: '#f5f5f5',
                    padding: 10,
                    marginTop: 8,
                    borderRadius: 6,
                    color: 'black'
                  }}
                >
                  {response.intel}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'orange' }}>
              Waiting for responses...
            </p>
          )}
        </div>
      ))}
    </main>
  )
}
