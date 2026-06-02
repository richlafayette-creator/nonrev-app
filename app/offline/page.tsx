export default function OfflinePage() {
  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <section style={{ maxWidth: 760, margin: '0 auto', paddingTop: 56 }}>
        <p style={{ color: '#fb7185', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
          Offline mode
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>
          nonrevy is ready when the signal comes back.
        </h1>
        <p style={{ color: '#cbd5e1', fontSize: 18 }}>
          You are viewing the offline shell fallback. Saved pages and app chrome can still open from cache, but live flight searches, provider fallbacks, and account data need a network connection.
        </p>
        <div style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginTop: 24 }}>
          <strong style={{ color: '#38bdf8' }}>Offline-safe next steps</strong>
          <ul style={{ color: '#cbd5e1', paddingLeft: 20, marginBottom: 0 }}>
            <li>Keep your current itinerary notes open.</li>
            <li>Retry live provider search once connectivity returns.</li>
            <li>Use saved watchlist context if this device has it cached locally.</li>
          </ul>
        </div>
        <a href="/plan" style={{ display: 'inline-block', marginTop: 24, padding: '14px 18px', borderRadius: 12, background: '#38bdf8', color: '#020617', fontWeight: 'bold', textDecoration: 'none' }}>
          Back to planner
        </a>
      </section>
    </main>
  )
}
