export default function CreditsPage() {
  return (
    <main className="app-shell nonrevy-traveler-page nonrevy-credits-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <section className="nonrevy-traveler-page__inner" style={{ maxWidth: 920, margin: '0 auto' }}>
        <p className="nonrevy-traveler-page__eyebrow" style={{ color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          AI Concierge credits
        </p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Credits are not active yet.</h1>
        <p style={{ color: '#4B5563', maxWidth: 760 }}>
          Private beta access is currently complimentary. Monthly AI Concierge credits are planned for the paid
          Concierge membership, but no credit balance or purchase flow is active today.
        </p>

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>What credits will cover</h2>
          <ul style={{ color: '#4B5563', paddingLeft: 18 }}>
            <li>Broader travel-focused AI conversation</li>
            <li>Destination research</li>
            <li>Personalized trip-planning help</li>
            <li>Current travel-information assistance</li>
          </ul>
          <p style={{ color: '#4B5563', marginBottom: 0 }}>
            Core flight search and brief flight-specific explanations remain part of the planned Core membership.
          </p>
        </section>

        <section className="nonrevy-traveler-empty" style={{ border: '1px dashed #cbd5e1', borderRadius: 22, padding: 22, background: '#ffffff', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>No balance is shown during private beta</h2>
          <p style={{ color: '#4B5563' }}>
            Payment details and credit allowances will be introduced only when paid memberships launch.
          </p>
          <a className="nonrevy-traveler-link-action" href="/membership" style={{ border: '1px solid #2563eb', borderRadius: 999, padding: '10px 14px', color: '#2563eb', fontWeight: 800, textDecoration: 'none' }}>
            View Membership
          </a>
        </section>
      </section>
    </main>
  )
}
