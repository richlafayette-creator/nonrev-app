'use client'

const checks = [
  { name: 'Flight ingestion', status: 'Scaffolded', detail: 'Ready for scheduled carrier/source expansion.' },
  { name: 'Load request flow', status: 'Live', detail: 'Existing verify-load request path preserved.' },
  { name: 'Route ranking', status: 'Mocked', detail: 'Best-routes cards are static until scoring inputs are connected.' },
  { name: 'Watchlist alerts', status: 'Scaffolded', detail: 'UI shell ready for saved-route persistence and notification rules.' }
]

function statusColor(status: string) {
  if (status === 'Live') return 'var(--color-green-500)'
  if (status === 'Mocked') return 'var(--color-yellow-400)'
  return 'var(--color-sky-400)'
}

export default function AgentStatusPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/agent" style={{ marginRight: 16, color: 'var(--color-violet-400)' }}>Agent</a>
        <a href="/requests" style={{ color: 'var(--color-purple-400)' }}>Open Requests</a>
      </nav>

      <section style={{ maxWidth: 920, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-violet-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Agent operations</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Nonrev agent status</h1>
        <p style={{ color: 'var(--color-slate-400)', fontSize: 18 }}>
          A safe status dashboard scaffold for production readiness checks, data freshness, and automation health.
        </p>

        <div style={{ display: 'grid', gap: 14, marginTop: 28 }}>
          {checks.map((check) => (
            <article key={check.name} style={{ background: 'var(--color-slate-850)', border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>{check.name}</h2>
                <span style={{ color: statusColor(check.status), fontWeight: 'bold' }}>{check.status}</span>
              </div>
              <p style={{ color: 'var(--color-slate-300)' }}>{check.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
