'use client'

import Link from 'next/link'
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
  if (sentiment === 'Positive') return 'var(--color-green-500)'
  if (sentiment === 'Blocked') return 'var(--color-rose-400)'
  return 'var(--color-sky-400)'
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
  const [status, setStatus] = useState('Beta feedback is saved locally. The backend endpoint is stubbed for this beta entry point.')

  function refreshFeedback() {
    setRecords(loadBetaFeedback())
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      setPageUrl(window.location.href)
      const entry = new URLSearchParams(window.location.search).get('entry')
      if (entry === 'issue') {
        setCategory('Bug')
        setSentiment('Blocked')
      } else if (entry === 'feedback') {
        setCategory('Other')
        setSentiment('Neutral')
      }
    })
    void syncBetaFeedback().then((result) => {
      setRecords(result.records)
      setStatus(result.detail)
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
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <Link href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Home</Link>
        <Link href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</Link>
        <Link href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</Link>
        <Link href="/alerts" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Alerts</Link>
        <Link href="/data-health" style={{ color: 'var(--color-purple-400)' }}>Data Health</Link>
      </nav>

      <section className="nonrevy-beta-feedback__hero">
        <div>
          <p className="nonrevy-beta-feedback__eyebrow">Private beta</p>
          <h1>Feedback capture</h1>
          <p>
            Report issues, confusing UI, missing features, bugs, and wins without adding noise to the planner. Feedback is kept local while the backend remains stubbed.
          </p>
          <p className="nonrevy-beta-feedback__status">{status}</p>
        </div>
        <div className="nonrevy-beta-feedback__summary" aria-label="Feedback summary">
          {[
            ['Total', summary.total, 'var(--color-sky-400)'],
            ['Open', summary.open, 'var(--color-yellow-400)'],
            ['Blocked', summary.blocked, 'var(--color-rose-400)'],
            ['Newest', timeLabel(summary.newest), 'var(--color-slate-400)']
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
          <button type="submit" disabled={!formReady}>Send feedback</button>
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
