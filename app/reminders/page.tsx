'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  completeOutcomeReminder,
  dismissOutcomeReminder,
  generateOutcomeReminders,
  loadOutcomeReminderCandidates,
  loadOutcomeReminders,
  outcomeReminderStats,
  type OutcomeReminder,
  type OutcomeReminderCandidate,
  type OutcomeReminderResponse
} from '../../lib/outcomeReminders'
import { loadTripOutcomes, tripOutcomeStats, type TripOutcome } from '../../lib/tripOutcomes'

function responseColor(response: string) {
  if (response === 'Yes' || response === 'completed') return 'var(--color-green-500)'
  if (response === 'Cancelled Trip' || response === 'dismissed') return 'var(--color-yellow-400)'
  if (response === 'No') return 'var(--color-red-400)'
  return 'var(--color-sky-400)'
}

function statusLabel(reminder: OutcomeReminder) {
  if (reminder.status === 'completed') return `Completed ${reminder.completedAt ? new Date(reminder.completedAt).toLocaleString() : ''}`
  if (reminder.status === 'dismissed') return `Dismissed ${reminder.dismissedAt ? new Date(reminder.dismissedAt).toLocaleString() : ''}`
  return 'Pending response'
}

export default function OutcomeRemindersPage() {
  const [reminders, setReminders] = useState<OutcomeReminder[]>([])
  const [candidates, setCandidates] = useState<OutcomeReminderCandidate[]>([])
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])
  const [notesByReminder, setNotesByReminder] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('Automated reminders are generated locally after a planned travel date passes.')

  function refresh() {
    const generated = generateOutcomeReminders()
    setReminders(generated.length ? generated : loadOutcomeReminders())
    setCandidates(loadOutcomeReminderCandidates())
    setOutcomes(loadTripOutcomes())
  }

  useEffect(() => {
    refresh()
    window.addEventListener('nonrevy-outcome-reminders-updated', refresh)
    window.addEventListener('nonrevy-watchlist-updated', refresh)
    window.addEventListener('nonrevy-itinerary-comparisons-updated', refresh)
    window.addEventListener('nonrevy-trip-outcomes-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('nonrevy-outcome-reminders-updated', refresh)
      window.removeEventListener('nonrevy-watchlist-updated', refresh)
      window.removeEventListener('nonrevy-itinerary-comparisons-updated', refresh)
      window.removeEventListener('nonrevy-trip-outcomes-updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const reminderStats = useMemo(() => outcomeReminderStats(reminders), [reminders])
  const outcomeStats = useMemo(() => tripOutcomeStats(outcomes), [outcomes])
  const dueCandidates = candidates.filter((candidate) => candidate.due)
  const pendingReminders = reminders.filter((reminder) => reminder.status === 'pending')
  const resolvedReminders = reminders.filter((reminder) => reminder.status !== 'pending')

  function recordResponse(reminder: OutcomeReminder, response: OutcomeReminderResponse) {
    const outcome = completeOutcomeReminder(reminder.id, response, notesByReminder[reminder.id] || '')
    if (outcome) {
      setStatus(`Added ${response} response for ${reminder.route} to Outcome History.`)
      refresh()
    }
  }

  function dismiss(reminder: OutcomeReminder) {
    setReminders(dismissOutcomeReminder(reminder.id))
    setStatus(`Dismissed reminder for ${reminder.route}.`)
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/outcomes" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Outcomes</a>
        <a href="/historical-routes" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Historical Routes</a>
        <a href="/reputation" style={{ marginRight: 16, color: 'var(--color-green-400)' }}>Trust</a>
        <a href="/intelligence" style={{ color: 'var(--color-purple-400)' }}>Intelligence</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-pink-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          Automated outcome reminder engine
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Outcome Reminders</h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 820, fontSize: 18 }}>
          NONREVY checks saved trips and watched itinerary options with planned travel dates. After travel day, it asks “Did you get on?” and writes the response into local Outcome History.
        </p>

        <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {[
            ['Pending Reminders', reminderStats.pending, 'var(--color-pink-400)'],
            ['Completed Reminders', reminderStats.completed, 'var(--color-green-500)'],
            ['Due Travel Items', dueCandidates.length, 'var(--color-yellow-400)'],
            ['Outcome Success Rate', `${outcomeStats.successRate}%`, 'var(--color-sky-400)'],
            ['Outcome History Items', outcomeStats.outcomeCount, 'var(--color-purple-400)']
          ].map(([label, value, color]) => (
            <article key={label} className="mini-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
              <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
              <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
            </article>
          ))}
        </section>

        <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginBottom: 24 }}>
          <strong style={{ color: 'var(--color-green-400)' }}>What updates when you respond?</strong>
          <p style={{ color: 'var(--color-slate-400)' }}>
            Responses are added to Outcome History, which recalculates success rate and feeds the historical route database, reputation score, and intelligence dashboard through the existing local outcome signal.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['Outcome History', 'Success Rate', 'Historical Route Database', 'Reputation System', 'Intelligence Dashboard'].map((label) => (
              <span key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 999, padding: '8px 12px', color: 'var(--color-slate-300)', background: 'var(--color-slate-950)' }}>{label}</span>
            ))}
          </div>
        </section>

        {status && <p style={{ color: 'var(--color-slate-400)' }}>{status}</p>}

        <section style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ fontSize: 30, margin: 0 }}>Pending “Did you get on?” prompts</h2>
            <button type="button" onClick={refresh} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-sky-400)', background: 'var(--color-slate-850)', color: 'var(--color-sky-200)', fontWeight: 'bold' }}>
              Check for reminders
            </button>
          </div>

          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            {pendingReminders.length === 0 && (
              <article className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                <h3 style={{ marginTop: 0 }}>No pending reminders</h3>
                <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>
                  Add a planned travel date to a watched route or save an itinerary from the planner. Reminders appear here after that date passes.
                </p>
              </article>
            )}
            {pendingReminders.map((reminder) => (
              <article key={reminder.id} className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ color: 'var(--color-pink-400)', textTransform: 'uppercase', letterSpacing: 1 }}>{reminder.prompt}</strong>
                    <h3 style={{ margin: '8px 0' }}>{reminder.title}</h3>
                    <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', margin: '6px 0' }}>{reminder.route}</p>
                    <small style={{ color: 'var(--color-slate-400)' }}>{reminder.carrier} · Travel date {reminder.travelDate} · {reminder.sourceType.replace('-', ' ')}</small>
                  </div>
                  <strong style={{ color: 'var(--color-yellow-400)' }}>{statusLabel(reminder)}</strong>
                </div>
                <label style={{ display: 'block', color: 'var(--color-slate-300)', marginTop: 14 }}>
                  Optional notes
                  <textarea
                    value={notesByReminder[reminder.id] || ''}
                    onChange={(event) => setNotesByReminder((current) => ({ ...current, [reminder.id]: event.target.value }))}
                    placeholder="Boarded with SA2 at gate 42, listed 5th, rolled to backup, etc."
                    rows={3}
                    style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
                  />
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  {(['Yes', 'No', 'Cancelled Trip'] as OutcomeReminderResponse[]).map((response) => (
                    <button
                      key={`${reminder.id}-${response}`}
                      type="button"
                      onClick={() => recordResponse(reminder, response)}
                      style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: responseColor(response), color: response === 'Cancelled Trip' ? 'var(--color-slate-950)' : 'white', fontWeight: 'bold' }}
                    >
                      {response}
                    </button>
                  ))}
                  <button type="button" onClick={() => dismiss(reminder)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'var(--color-slate-300)', fontWeight: 'bold' }}>
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: 30, margin: 0 }}>Detected travel-date sources</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
            {candidates.length === 0 && (
              <article className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                <h3 style={{ marginTop: 0 }}>No dated trips detected</h3>
                <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>Only saved trips and watched itinerary options with real travel dates generate reminders.</p>
              </article>
            )}
            {candidates.map((candidate) => (
              <article key={`${candidate.sourceType}-${candidate.sourceId}`} className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                <strong style={{ color: candidate.due ? 'var(--color-yellow-400)' : 'var(--color-sky-400)', textTransform: 'uppercase', letterSpacing: 1 }}>{candidate.due ? 'Due' : 'Scheduled'}</strong>
                <h3 style={{ margin: '8px 0' }}>{candidate.title}</h3>
                <p style={{ color: 'var(--color-slate-300)', margin: '6px 0' }}>{candidate.route}</p>
                <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{candidate.carrier} · {candidate.travelDate} · {candidate.reason}</p>
              </article>
            ))}
          </div>
        </section>

        {resolvedReminders.length > 0 && (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ fontSize: 30, margin: 0 }}>Reminder history</h2>
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              {resolvedReminders.map((reminder) => (
                <article key={reminder.id} className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{reminder.title}</h3>
                      <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', margin: '6px 0' }}>{reminder.route}</p>
                      <small style={{ color: 'var(--color-slate-400)' }}>{reminder.carrier} · Travel date {reminder.travelDate}</small>
                    </div>
                    <strong style={{ color: responseColor(reminder.status) }}>{statusLabel(reminder)}</strong>
                  </div>
                  {reminder.notes && <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>{reminder.notes}</p>}
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
