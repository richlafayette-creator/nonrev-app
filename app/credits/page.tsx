'use client'

const ledger = [
  { id: 1, label: 'Starter balance scaffold', amount: '+12', note: 'Mock credit grant for UX planning.' },
  { id: 2, label: 'Verify load hold', amount: '-1', note: 'Represents a pending request reservation.' },
  { id: 3, label: 'Response accepted', amount: '+2', note: 'Future reputation/credit reward hook.' }
]

export default function CreditsPage() {
  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/notifications" style={{ color: '#f472b6' }}>Notifications</a>
      </nav>

      <section className="hero-grid">
        <div>
          <p style={{ color: '#fbbf24', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Credits scaffold</p>
          <h1 style={{ fontSize: 44, margin: '8px 0' }}>Credit balance</h1>
          <p style={{ color: '#94a3b8' }}>A safe placeholder for request credits, holds, refunds, and future payment/subscription integration.</p>
        </div>
        <aside className="mini-card" style={{ border: '1px solid #334155', borderRadius: 20, padding: 22, background: '#0f172a' }}>
          <strong style={{ color: '#fbbf24', fontSize: 36 }}>12</strong>
          <p>Available credits</p>
          <p style={{ color: '#94a3b8' }}>0 reserved · 3 earned this month</p>
        </aside>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Ledger scaffold</h2>
        {ledger.map((entry) => (
          <article key={entry.id} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 12, background: '#0f172a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{entry.label}</strong>
              <span style={{ color: entry.amount.startsWith('+') ? '#22c55e' : '#f87171', fontWeight: 'bold' }}>{entry.amount}</span>
            </div>
            <p style={{ color: '#cbd5e1' }}>{entry.note}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
