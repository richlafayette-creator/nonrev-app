'use client'

import { type FormEvent, useState } from 'react'
import { saveTripOutcome, tripOutcomeStatuses, type TripOutcomeStatus } from '../lib/tripOutcomes'

type OutcomeCaptureProps = {
  subjectType: 'route-recommendation' | 'saved-itinerary'
  subjectId: string
  title: string
  route: string
}

export default function OutcomeCapture({ subjectType, subjectId, title, route }: OutcomeCaptureProps) {
  const [status, setStatus] = useState<TripOutcomeStatus>('Yes, got on')
  const [notes, setNotes] = useState('')
  const [saveStatus, setSaveStatus] = useState('Outcome not recorded yet.')

  function submitOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const outcome = saveTripOutcome({
      subjectType,
      subjectId,
      title,
      route,
      status,
      notes: notes.trim()
    })
    setNotes('')
    setSaveStatus(`Saved to ${outcome?.source || 'Local'} outcome repository: ${status}.`)
  }

  return (
    <form onSubmit={submitOutcome} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)', marginTop: 12 }}>
      <strong style={{ color: 'var(--color-green-500)' }}>Did you get on?</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 10 }}>
        <label style={{ color: 'var(--color-slate-300)' }}>
          Outcome
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as TripOutcomeStatus)}
            style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-850)', color: 'white' }}
          >
            {tripOutcomeStatuses.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label style={{ color: 'var(--color-slate-300)' }}>
          Notes
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional load, gate, or timing note"
            style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-850)', color: 'white' }}
          />
        </label>
      </div>
      <button
        type="submit"
        style={{ marginTop: 10, padding: 10, borderRadius: 10, border: 'none', background: 'var(--color-sky-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}
      >
        Save outcome
      </button>
      <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{saveStatus}</p>
    </form>
  )
}
