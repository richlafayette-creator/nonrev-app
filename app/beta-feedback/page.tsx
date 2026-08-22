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
  syncBetaFeedback,
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
  const [category, setCategory] = useState<BetaFeedbackCategory>('Wrong flight/time')
  const [sentiment, setSentiment] = useState<BetaFeedbackSentiment>('Neutral')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [deviceClass, setDeviceClass] = useState('')
  const [status, setStatus] = useState('Feedback is saved to your beta account when available. This browser keeps a copy if account saving is unavailable.')

  function refreshFeedback() {
    setRecords(loadBetaFeedback())
  }

  useEffect(() => {
    refreshFeedback()
    setPageUrl(window.location.href)
    setDeviceClass(`${window.innerWidth <= 640 ? 'mobile' : window.innerWidth <= 1024 ? 'tablet' : 'desktop'} · ${window.innerWidth}x${window.innerHeight}`)
    void syncBetaFeedback().then((result) => {
      setRecords(result.records)
      setStatus(result.storageMode === 'supabase' ? 'Feedback is saved to your beta account.' : 'Feedback is saved in this browser until account saving is available again.')
    })
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
    const saved = submitBetaFeedback({ category, sentiment, message, contact, pageUrl, deviceClass })
    refreshFeedback()
    setMessage('')
    setStatus(saved ? 'Feedback captured. Thanks for helping shape the beta.' : 'Feedback could not be saved. Try again with a short note.')
  }

  async function copyFeedback() {
    try {
      await navigator.clipboard.writeText(betaFeedbackExportText(records))
      setStatus('Feedback copied. Paste it into email, chat, or an issue when ready.')
    } catch {
      setStatus('Copy was blocked by the browser. Use email export instead.')
    }
  }

  function markReviewed(id: string) {
    setRecords(markBetaFeedbackReviewed(id))
    setStatus('Marked feedback resolved for this browser.')
  }

  function clearAll() {
    setRecords(clearBetaFeedback())
    setStatus('Cleared feedback history from this browser.')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Search</a>
        <a href="/saved-searches" style={{ marginRight: 16, color: '#67e8f9' }}>Saved</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/profile" style={{ color: '#22c55e' }}>Profile</a>
      </nav>

      <section className="nonrevy-beta-feedback__hero">
        <div>
          <p className="nonrevy-beta-feedback__eyebrow">Private beta</p>
          <h1>Feedback capture</h1>
          <p>
            Send wrong flight data, missing routes, ZED issues, load-request problems, and confusing screens with useful page context attached.
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
            <input value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} placeholder="/results, route, flight, or browser URL" />
          </label>
          <label>
            Contact optional
            <input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Email, handle, or blank" />
          </label>
          <button type="submit" disabled={!formReady}>Capture feedback</button>
        </form>

        <aside className="nonrevy-beta-feedback__card">
          <h2>Share a copy</h2>
          <p>Your beta account is the main feedback history when available. Export creates a plain-text copy if you need to send it another way.</p>
          <div className="nonrevy-beta-feedback__actions">
            <button type="button" onClick={copyFeedback} disabled={!records.length}>Copy feedback</button>
            <a href={feedbackMailto(records)} aria-disabled={!records.length}>Export email</a>
            <button type="button" onClick={clearAll} disabled={!records.length}>Clear browser history</button>
          </div>
          <details className="nonrevy-beta-feedback__details">
            <summary>What to report</summary>
            <ul>
              <li>Incorrect flight, schedule, time, or route data.</li>
              <li>Recommendations that feel confusing or unsafe.</li>
              <li>Any screen that feels crowded or unclear on mobile.</li>
              <li>Missing airline, route, or workflow you expected.</li>
            </ul>
          </details>
        </aside>
      </section>

      <section className="nonrevy-beta-feedback__history">
        <div className="nonrevy-beta-feedback__history-head">
          <h2>Feedback history</h2>
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
                {item.status === 'new' ? <button type="button" onClick={() => markReviewed(item.id)}>Mark resolved</button> : null}
              </article>
            ))}
          </div>
        ) : (
          <article className="nonrevy-beta-feedback__empty">
            <h3>No feedback captured yet</h3>
            <p>Use this whenever something blocks trust, looks wrong, or would make the beta easier to use.</p>
          </article>
        )}
      </section>
    </main>
  )
}
