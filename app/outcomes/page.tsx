'use client'

const outcomeCards = [
  { label: 'Successful nonrev trips', value: '18', color: '#22c55e', note: 'Mock aggregate until outcome capture is connected.' },
  { label: 'Rolled / missed flights', value: '4', color: '#f87171', note: 'Use this to tune future risk scoring.' },
  { label: 'Average route score', value: '72', color: '#38bdf8', note: 'Scaffold for historical score calibration.' }
]

const recentOutcomes = [
  { route: 'LAX → HNL', result: 'Boarded', lesson: 'Morning widebody remained the strongest play.' },
  { route: 'SFO → DEN', result: 'Boarded', lesson: 'Backup bank reduced risk during weather delay.' },
  { route: 'JFK → LHR', result: 'Verify next time', lesson: 'Close-in upgrades changed the standby picture.' }
]

export default function OutcomesPage() {
  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ color: '#22c55e' }}>Outcomes</a>
      </nav>

      <section>
        <p style={{ color: '#22c55e', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Outcome intelligence scaffold</p>
        <h1 style={{ fontSize: 40 }}>Outcomes</h1>
        <p style={{ color: '#94a3b8', maxWidth: 760 }}>Historical success/failure tracking, lessons learned, and score calibration are staged here for production data.</p>
      </section>

      <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
        {outcomeCards.map((card) => (
          <article key={card.label} className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
            <strong style={{ color: card.color, fontSize: 32 }}>{card.value}</strong>
            <h2 style={{ fontSize: 18 }}>{card.label}</h2>
            <p style={{ color: '#94a3b8' }}>{card.note}</p>
          </article>
        ))}
      </section>

      <section>
        <h2>Recent outcome notes</h2>
        {recentOutcomes.map((outcome) => (
          <article key={outcome.route} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 12, background: '#0f172a' }}>
            <h3 style={{ marginTop: 0 }}>{outcome.route}</h3>
            <p><strong>Result:</strong> {outcome.result}</p>
            <p style={{ color: '#cbd5e1' }}>{outcome.lesson}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
