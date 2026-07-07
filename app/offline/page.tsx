export default function OfflinePage() {
  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <section style={{ maxWidth: 760, margin: '0 auto', paddingTop: 56 }}>
        <p style={{ color: 'var(--color-rose-400)', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
          Offline mode
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>
          nonrevy is ready when the signal comes back.
        </h1>
        <p style={{ color: 'var(--color-slate-300)', fontSize: 18 }}>
          You are viewing the offline shell fallback. Saved pages and app chrome can still open from cache, but live flight searches, provider fallbacks, and account data need a network connection.
        </p>
        <div style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginTop: 24 }}>
          <strong style={{ color: 'var(--color-sky-400)' }}>Offline-safe next steps</strong>
          <ul style={{ color: 'var(--color-slate-300)', paddingLeft: 20, marginBottom: 0 }}>
            <li>Keep your current itinerary notes open.</li>
            <li>Retry live provider search once connectivity returns.</li>
            <li>Use saved watchlist context if this device has it cached locally.</li>
          </ul>
        </div>
        <a href="/plan" style={{ display: 'inline-block', marginTop: 24, padding: '14px 18px', borderRadius: 12, background: 'var(--color-sky-400)', color: 'var(--color-slate-950)', fontWeight: 'bold', textDecoration: 'none' }}>
          Back to planner
        </a>
      </section>
    </main>
  )
}
