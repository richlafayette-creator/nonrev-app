'use client'

const checks = [
  { name: 'Flight ingestion', status: 'Scaffolded', detail: 'Ready for scheduled carrier/source expansion.' },
  { name: 'Load request flow', status: 'Live', detail: 'Existing verify-load request path preserved.' },
  { name: 'Route ranking', status: 'Mocked', detail: 'Best-routes cards are static until scoring inputs are connected.' },
  { name: 'Watchlist alerts', status: 'Scaffolded', detail: 'UI shell ready for saved-route persistence and notification rules.' }
]

function statusColor(status: string) {
  if (status === 'Live') return '#22c55e'
  if (status === 'Mocked') return '#facc15'
  return '#38bdf8'
}

export default function AgentStatusPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/agent" style={{ marginRight: 16, color: '#a78bfa' }}>Agent</a>
        <a href="/requests" style={{ color: '#c084fc' }}>Open Requests</a>
      </nav>

      <section style={{ maxWidth: 920, margin: '0 auto' }}>
        <p style={{ color: '#a78bfa', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Agent operations</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Nonrev agent status</h1>
        <p style={{ color: '#94a3b8', fontSize: 18 }}>
          A safe status dashboard scaffold for production readiness checks, data freshness, and automation health.
        </p>

        <div style={{ display: 'grid', gap: 14, marginTop: 28 }}>
          {checks.map((check) => (
            <article key={check.name} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 18, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>{check.name}</h2>
                <span style={{ color: statusColor(check.status), fontWeight: 'bold' }}>{check.status}</span>
              </div>
              <p style={{ color: '#cbd5e1' }}>{check.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
