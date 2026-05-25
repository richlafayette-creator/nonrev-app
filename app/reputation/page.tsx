'use client'

const signals = [
  { label: 'Verified responses', value: '24', detail: 'How many load answers later matched outcomes.' },
  { label: 'Helpful reports', value: '91%', detail: 'Future community feedback score.' },
  { label: 'Route expertise', value: 'Hawaii · Mountain West', detail: 'Scaffolded specialties from answered requests.' }
]

export default function ReputationPage() {
  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/outcomes" style={{ color: '#22c55e' }}>Outcomes</a>
      </nav>

      <p style={{ color: '#34d399', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Trust scaffold</p>
      <h1 style={{ fontSize: 44, margin: '8px 0' }}>Trust & reputation</h1>
      <p style={{ color: '#94a3b8', maxWidth: 760 }}>A production landing zone for contributor reliability, outcome-confirmed answers, and abuse-resistant reputation signals.</p>

      <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 24 }}>
        {signals.map((signal) => (
          <article key={signal.label} className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
            <strong style={{ color: '#34d399', fontSize: 30 }}>{signal.value}</strong>
            <h2>{signal.label}</h2>
            <p style={{ color: '#cbd5e1' }}>{signal.detail}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
