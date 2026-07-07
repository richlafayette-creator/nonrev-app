'use client'

import { useState } from 'react'
import { stripeCatalog } from '../../lib/monetization'

const ledger = [
  { id: 1, label: 'Starter balance scaffold', amount: '+12', note: 'Mock credit grant for UX planning.' },
  { id: 2, label: 'Verify load hold', amount: '-1', note: 'Represents a pending request reservation.' },
  { id: 3, label: 'Response accepted', amount: '+2', note: 'Future reputation/credit reward hook.' }
]

export default function CreditsPage() {
  const [checkoutMessage, setCheckoutMessage] = useState('Stripe checkout is scaffolded only — no live charges are made.')

  function startCheckoutScaffold(lookupKey: string) {
    setCheckoutMessage(`Checkout session scaffold prepared for ${lookupKey}. Server route and Stripe secret key intentionally not connected yet.`)
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/requests" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>My Requests</a>
        <a href="/credits" style={{ marginRight: 16, color: 'var(--color-amber-400)' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: 'var(--color-green-400)' }}>Trust</a>
        <a href="/notifications" style={{ color: 'var(--color-pink-400)' }}>Notifications</a>
      </nav>

      <section className="hero-grid">
        <div>
          <p style={{ color: 'var(--color-amber-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Credits scaffold</p>
          <h1 style={{ fontSize: 44, margin: '8px 0' }}>Credit balance</h1>
          <p style={{ color: 'var(--color-slate-400)' }}>A safe placeholder for request credits, holds, refunds, and future Stripe payment/subscription integration.</p>
          <p style={{ color: 'var(--color-sky-400)' }}>{checkoutMessage}</p>
        </div>
        <aside className="mini-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 22, background: 'var(--color-slate-850)' }}>
          <strong style={{ color: 'var(--color-amber-400)', fontSize: 36 }}>12</strong>
          <p>Available credits</p>
          <p style={{ color: 'var(--color-slate-400)' }}>0 reserved · 3 earned this month</p>
        </aside>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Stripe-ready packages (test scaffold)</h2>
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {stripeCatalog.map((item) => (
            <article key={item.id} className="mini-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
              <h3 style={{ marginTop: 0 }}>{item.name}</h3>
              <p style={{ color: 'var(--color-amber-400)', fontWeight: 'bold' }}>{item.credits} credits · {item.priceLabel}</p>
              <p style={{ color: 'var(--color-slate-400)' }}>Lookup key: {item.lookupKey}</p>
              <button onClick={() => startCheckoutScaffold(item.lookupKey)} style={{ padding: 12, borderRadius: 10, border: 'none', background: 'var(--color-amber-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
                Prepare checkout scaffold
              </button>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Ledger scaffold</h2>
        {ledger.map((entry) => (
          <article key={entry.id} className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, marginBottom: 12, background: 'var(--color-slate-850)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{entry.label}</strong>
              <span style={{ color: entry.amount.startsWith('+') ? 'var(--color-green-500)' : 'var(--color-red-400)', fontWeight: 'bold' }}>{entry.amount}</span>
            </div>
            <p style={{ color: 'var(--color-slate-300)' }}>{entry.note}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
