'use client'

import { useState } from 'react'

export default function MembershipPage() {
  const [message, setMessage] = useState('Membership actions are placeholders only — no billing changes will be made.')

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/account" style={{ marginRight: 16, color: '#38bdf8' }}>My Account</a>
        <a href="/billing" style={{ marginRight: 16, color: '#fbbf24' }}>Billing</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/plan" style={{ color: '#fb7185' }}>Plan</a>
      </nav>

      <section style={{ maxWidth: 900 }}>
        <p style={{ color: '#34d399', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Membership scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Membership</h1>
        <p style={{ color: '#94a3b8' }}>Upgrade and cancellation flows are staged here for future Stripe/customer-portal integration.</p>
        <p style={{ color: '#38bdf8' }}>{message}</p>

        <div className="hero-grid" style={{ marginTop: 24 }}>
          <article className="mini-card" style={{ border: '1px solid #334155', borderRadius: 20, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Upgrade Membership</h2>
            <p style={{ color: '#cbd5e1' }}>Future benefits: more route watches, richer alerts, deeper history, and extra request credits.</p>
            <button onClick={() => setMessage('Upgrade placeholder selected. No Stripe checkout was started.')} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#34d399', color: '#020617', fontWeight: 'bold' }}>
              Upgrade placeholder
            </button>
          </article>

          <article id="cancel" className="mini-card" style={{ border: '1px solid #334155', borderRadius: 20, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Cancel Membership</h2>
            <p style={{ color: '#cbd5e1' }}>Future cancellation flow will confirm status, billing period, retained credits, and data export options.</p>
            <button onClick={() => setMessage('Cancel placeholder selected. No membership changes were made.')} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#f87171', color: '#020617', fontWeight: 'bold' }}>
              Cancel placeholder
            </button>
          </article>
        </div>
      </section>
    </main>
  )
}
