'use client'

const billingItems = [
  { label: 'Current plan', value: 'Free scaffold' },
  { label: 'Available credits', value: '12 mock credits' },
  { label: 'Payment method', value: 'Not connected' },
  { label: 'Stripe status', value: 'Placeholder only — no live charges' }
]

export default function BillingPage() {
  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/account" style={{ marginRight: 16, color: '#38bdf8' }}>My Account</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/membership" style={{ marginRight: 16, color: '#34d399' }}>Membership</a>
        <a href="/plan" style={{ color: '#fb7185' }}>Plan</a>
      </nav>

      <section style={{ maxWidth: 900 }}>
        <p style={{ color: '#fbbf24', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Billing scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Billing</h1>
        <p style={{ color: '#94a3b8' }}>Billing history, invoices, credits, and Stripe customer portal links will live here after payment wiring is approved.</p>

        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginTop: 24 }}>
          {billingItems.map((item) => (
            <article key={item.label} className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
              <small style={{ color: '#94a3b8' }}>{item.label}</small>
              <p style={{ fontWeight: 'bold' }}>{item.value}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
