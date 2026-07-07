'use client'

const routeIdeas = [
  {
    id: 'west-hawaii',
    title: 'West Coast to Hawaii',
    route: 'LAX/SFO/SEA → HNL/OGG/KOA',
    confidence: 'Strong scaffold',
    why: 'Multiple gateways, widebody capacity, and frequent same-day island backup options.',
    watch: 'Weekend returns and holiday shoulder days.'
  },
  {
    id: 'northeast-europe',
    title: 'Northeast to Europe',
    route: 'JFK/EWR/BOS → LHR/CDG/AMS',
    confidence: 'Verify loads',
    why: 'Best when you can position between Northeast gateways and accept rail or short-haul recovery.',
    watch: 'Premium-heavy flights can look good until close-in upgrades clear.'
  },
  {
    id: 'mountain-weekend',
    title: 'Mountain West weekends',
    route: 'SFO/LAX/PHX → DEN/SLC',
    confidence: 'Strong scaffold',
    why: 'High frequency routes create several fallback banks for short trips.',
    watch: 'Weather and irregular operations during winter storms.'
  }
]

function confidenceColor(confidence: string) {
  return confidence.includes('Strong') ? 'var(--color-green-500)' : 'var(--color-yellow-400)'
}

export default function BestRoutesPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/agent" style={{ marginRight: 16, color: 'var(--color-violet-400)' }}>Agent</a>
        <a href="/requests" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Open Requests</a>
        <a href="/outcomes" style={{ color: 'var(--color-green-500)' }}>Outcomes</a>
      </nav>

      <section style={{ maxWidth: 1080, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-rose-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Route intelligence scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Best routes to watch right now</h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 760, fontSize: 18 }}>
          A production-ready landing zone for ranking routes by capacity, fallback options, historical outcomes, and close-in nonrev risk.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 28 }}>
          {routeIdeas.map((idea) => (
            <article key={idea.id} style={{ background: 'var(--color-slate-850)', border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 18 }}>
              <h2 style={{ marginTop: 0 }}>{idea.title}</h2>
              <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', fontSize: 18 }}>{idea.route}</p>
              <p style={{ color: confidenceColor(idea.confidence), fontWeight: 'bold' }}>{idea.confidence}</p>
              <p>{idea.why}</p>
              <p style={{ color: 'var(--color-slate-300)' }}><strong>Watch:</strong> {idea.watch}</p>
              <button style={{ padding: 12, borderRadius: 10, border: 'none', background: 'var(--color-sky-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
                Save route scaffold
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
