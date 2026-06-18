'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  betaFeedbackCategories,
  betaFeedbackExportText,
  betaFeedbackSentiments,
  betaFeedbackSummary,
  clearBetaFeedback,
  loadBetaFeedback,
  markBetaFeedbackReviewed,
  submitBetaFeedback,
  type BetaFeedbackCategory,
  type BetaFeedbackRecord,
  type BetaFeedbackSentiment
} from '../../lib/betaFeedback'

function timeLabel(value: string) {
  if (!value) return 'No feedback yet'
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function sentimentColor(sentiment: BetaFeedbackSentiment) {
  if (sentiment === 'Positive') return '#22c55e'
  if (sentiment === 'Blocked') return '#fb7185'
  return '#38bdf8'
}

function feedbackMailto(records: BetaFeedbackRecord[]) {
  const subject = encodeURIComponent('NONREVY private beta feedback')
  const body = encodeURIComponent(betaFeedbackExportText(records))
  return `mailto:?subject=${subject}&body=${body}`
}

export default function BetaFeedbackPage() {
  const [records, setRecords] = useState<BetaFeedbackRecord[]>([])
  const [category, setCategory] = useState<BetaFeedbackCategory>('Wrong result')
  const [sentiment, setSentiment] = useState<BetaFeedbackSentiment>('Neutral')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [status, setStatus] = useState('Private beta feedback is saved locally until you choose to export it.')

  function refreshFeedback() {
    setRecords(loadBetaFeedback())
  }

  useEffect(() => {
    refreshFeedback()
    setPageUrl(window.location.href)
    window.addEventListener('nonrevy-beta-feedback-updated', refreshFeedback)
    window.addEventListener('storage', refreshFeedback)
    return () => {
      window.removeEventListener('nonrevy-beta-feedback-updated', refreshFeedback)
      window.removeEventListener('storage', refreshFeedback)
    }
  }, [])

  const summary = useMemo(() => betaFeedbackSummary(records), [records])
  const formReady = message.trim().length >= 8

  function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!formReady) {
      setStatus('Add a short note so the beta feedback is useful.')
      return
    }
    const saved = submitBetaFeedback({ category, sentiment, message, contact, pageUrl })
    refreshFeedback()
    setMessage('')
    setStatus(saved ? 'Feedback captured locally. Thank you — this is exactly what private beta needs.' : 'Feedback could not be saved. Try again with a short note.')
  }

  async function copyFeedback() {
    try {
      await navigator.clipboard.writeText(betaFeedbackExportText(records))
      setStatus('Feedback copied. Paste it into email, chat, or an issue when ready.')
    } catch {
      setStatus('Copy was blocked by the browser. Use Export email instead.')
    }
  }

  function markReviewed(id: string) {
    setRecords(markBetaFeedbackReviewed(id))
    setStatus('Marked feedback reviewed locally.')
  }

  function clearAll() {
    setRecords(clearBetaFeedback())
    setStatus('Cleared local beta feedback history.')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/alerts" style={{ marginRight: 16, color: '#22c55e' }}>Alerts</a>
        <a href="/data-health" style={{ color: '#c084fc' }}>Data Health</a>
      </nav>

      <section className="nonrevy-beta-feedback__hero">
        <div>
          <p className="nonrevy-beta-feedback__eyebrow">Private beta</p>
          <h1>Feedback capture</h1>
          <p>
            Capture wrong results, confusing UI, missing features, bugs, and wins without adding noise to the planner. Nothing is sent automatically.
          </p>
          <p className="nonrevy-beta-feedback__status">{status}</p>
        </div>
        <div className="nonrevy-beta-feedback__summary" aria-label="Feedback summary">
          {[
            ['Total', summary.total, '#38bdf8'],
            ['Open', summary.open, '#facc15'],
            ['Blocked', summary.blocked, '#fb7185'],
            ['Newest', timeLabel(summary.newest), '#94a3b8']
          ].map(([label, value, color]) => (
            <article key={label}>
              <small>{label}</small>
              <strong style={{ color: String(color) }}>{value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="nonrevy-beta-feedback__grid">
        <form onSubmit={submitFeedback} className="nonrevy-beta-feedback__card">
          <h2>Send beta note</h2>
          <div className="nonrevy-beta-feedback__form-grid">
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value as BetaFeedbackCategory)}>
                {betaFeedbackCategories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Impact
              <select value={sentiment} onChange={(event) => setSentiment(event.target.value as BetaFeedbackSentiment)}>
                {betaFeedbackSentiments.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <label>
            What happened?
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} placeholder="Example: HND route looked best, but the load explanation was unclear." />
          </label>
          <label>
            Page or route optional
            <input value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} placeholder="/plan, route, flight, or browser URL" />
          </label>
          <label>
            Contact optional
            <input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Email, handle, or blank" />
          </label>
          <button type="submit" disabled={!formReady}>Capture feedback</button>
        </form>

        <aside className="nonrevy-beta-feedback__card">
          <h2>Export when ready</h2>
          <p>Feedback stays on-device so testers can review it before sharing. Export creates a plain-text handoff for the beta owner.</p>
          <div className="nonrevy-beta-feedback__actions">
            <button type="button" onClick={copyFeedback} disabled={!records.length}>Copy feedback</button>
            <a href={feedbackMailto(records)} aria-disabled={!records.length}>Export email</a>
            <button type="button" onClick={clearAll} disabled={!records.length}>Clear local history</button>
          </div>
          <details className="nonrevy-beta-feedback__details">
            <summary>What to report</summary>
            <ul>
              <li>Wrong or surprising route ranking.</li>
              <li>Any screen that feels crowded on mobile.</li>
              <li>Alert, watchlist, or notification behavior that reduces trust.</li>
            </ul>
          </details>
        </aside>
      </section>

      <section className="nonrevy-beta-feedback__history">
        <div className="nonrevy-beta-feedback__history-head">
          <h2>Local feedback history</h2>
          <span>{records.length} saved</span>
        </div>
        {records.length ? (
          <div className="nonrevy-beta-feedback__list">
            {records.map((item) => (
              <article key={item.id}>
                <div>
                  <span style={{ borderColor: sentimentColor(item.sentiment), color: sentimentColor(item.sentiment) }}>{item.sentiment}</span>
                  <span>{item.category}</span>
                  <span>{item.status}</span>
                </div>
                <p>{item.message}</p>
                <small>{timeLabel(item.createdAt)}{item.pageUrl ? ` · ${item.pageUrl}` : ''}{item.contact ? ` · ${item.contact}` : ''}</small>
                {item.status === 'new' ? <button type="button" onClick={() => markReviewed(item.id)}>Mark reviewed</button> : null}
              </article>
            ))}
          </div>
        ) : (
          <article className="nonrevy-beta-feedback__empty">
            <h3>No feedback captured yet</h3>
            <p>During private beta, use this page whenever a tester hits confusion, distrust, or a genuinely useful moment worth preserving.</p>
          </article>
        )}
      </section>
    </main>
  )
}
