'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadTripOutcomes, tripOutcomeStats, type TripOutcome } from '../lib/tripOutcomes'

export default function OutcomeHistorySection() {
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])

  useEffect(() => {
    function refreshOutcomes() {
      setOutcomes(loadTripOutcomes())
    }

    refreshOutcomes()
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshOutcomes)
    window.addEventListener('storage', refreshOutcomes)
    return () => {
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshOutcomes)
      window.removeEventListener('storage', refreshOutcomes)
    }
  }, [])

  const stats = useMemo(() => tripOutcomeStats(outcomes), [outcomes])

  return (
    <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: '#22c55e', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>
            Outcome History
          </p>
          <h2 style={{ margin: '4px 0' }}>Local trip outcomes</h2>
          <p style={{ color: '#94a3b8', marginBottom: 0 }}>
            Stored locally from route recommendations and saved itinerary cards.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 10 }}>
          <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
            <small style={{ color: '#94a3b8' }}>Outcome count</small>
            <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{stats.outcomeCount}</h3>
          </article>
          <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
            <small style={{ color: '#94a3b8' }}>Success rate</small>
            <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{stats.successRate}%</h3>
          </article>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {outcomes.length === 0 && (
          <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
            <p style={{ color: '#cbd5e1', margin: 0 }}>No local outcomes recorded yet.</p>
          </article>
        )}
        {outcomes.slice(0, 8).map((outcome) => (
          <article key={outcome.id} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ color: '#f8fafc', margin: 0 }}>{outcome.title}</h3>
                <p style={{ color: '#38bdf8', margin: '6px 0' }}>{outcome.route}</p>
              </div>
              <strong style={{ color: outcome.status === 'Yes, got on' ? '#22c55e' : outcome.status === 'Cancelled trip' ? '#facc15' : '#f87171' }}>
                {outcome.status}
              </strong>
            </div>
            {outcome.notes && <p style={{ color: '#cbd5e1', marginBottom: 0 }}>{outcome.notes}</p>}
            <small style={{ color: '#94a3b8' }}>{new Date(outcome.createdAt).toLocaleString()}</small>
          </article>
        ))}
      </div>
    </section>
  )
}
