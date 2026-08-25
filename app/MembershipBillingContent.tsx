const coreFeatures = [
  'Flight search',
  'Itinerary refinements',
  'ZED-aware planning',
  'Destination and place resolution for flight search',
  'Saved searches',
  'Watchlist',
  'Load requests',
  'My Requests',
  'Brief flight-specific explanations'
]

const conciergeFeatures = [
  'Everything in Core',
  'Broader travel-focused AI conversation',
  'Destination research',
  'Personalized trip planning',
  'Current travel-information assistance',
  'Monthly metered AI credits and fair-use allowance'
]

const tripPasses = [
  {
    name: 'Core 30-day Trip Pass',
    price: '$14.99',
    detail: 'Planned short-trip access for core flight planning.'
  },
  {
    name: 'Concierge 30-day Trip Pass',
    price: '$24.99',
    detail: 'Planned short-trip access with the AI Concierge allowance.'
  }
]

export default function MembershipBillingContent({ context = 'membership' }: { context?: 'membership' | 'billing' }) {
  return (
    <main className="app-shell nonrevy-traveler-page nonrevy-membership-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <section className="nonrevy-traveler-page__inner" style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p className="nonrevy-traveler-page__eyebrow" style={{ color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          Membership
        </p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Membership & Billing</h1>
        <p style={{ color: '#4B5563', maxWidth: 760 }}>
          Private beta access is currently complimentary. Founding-member pricing is planned for the paid beta.
          Payment details will be requested only when paid memberships launch.
        </p>
        {context === 'billing' ? (
          <p style={{ color: '#4B5563', maxWidth: 760 }}>
            Billing details live with Membership for the private beta so there is one clear source of truth.
          </p>
        ) : null}

        <section className="nonrevy-traveler-card nonrevy-current-access-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {[
              ['Current plan', 'Private Beta'],
              ['Price', 'Complimentary'],
              ['Status', 'Active']
            ].map(([label, value]) => (
              <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                <small style={{ color: '#6b7280' }}>{label}</small>
                <strong style={{ display: 'block', color: '#111827', marginTop: 4 }}>{value}</strong>
              </article>
            ))}
          </div>
          <p style={{ color: '#4B5563', marginBottom: 0 }}>
            Core beta features are available to invited private-beta travelers now. Paid memberships and trip passes are not active yet.
          </p>
        </section>

        <section className="nonrevy-traveler-page__grid nonrevy-membership-plans" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 24 }}>
          <article className="nonrevy-traveler-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <small style={{ color: '#2563eb', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Planned paid beta</small>
            <h2 style={{ margin: '8px 0' }}>Core Founding Membership</h2>
            <p style={{ color: '#111827', fontSize: 28, fontWeight: 900, margin: '8px 0' }}>$49/year</p>
            <p style={{ color: '#4B5563' }}>The planned foundation for everyday nonrev flight planning.</p>
            <ul style={{ color: '#4B5563', paddingLeft: 18 }}>
              {coreFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </article>

          <article className="nonrevy-traveler-card" style={{ border: '1px solid #2563eb', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <small style={{ color: '#2563eb', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Planned paid beta</small>
            <h2 style={{ margin: '8px 0' }}>AI Travel Concierge Founding Membership</h2>
            <p style={{ color: '#111827', fontSize: 28, fontWeight: 900, margin: '8px 0' }}>$99/year</p>
            <p style={{ color: '#4B5563' }}>Core plus broader travel help with a monthly usage allowance.</p>
            <ul style={{ color: '#4B5563', paddingLeft: 18 }}>
              {conciergeFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </article>
        </section>

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Planned trip passes</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {tripPasses.map((pass) => (
              <article key={pass.name} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                <h3 style={{ margin: '0 0 6px' }}>{pass.name}</h3>
                <strong style={{ color: '#111827', fontSize: 22 }}>{pass.price}</strong>
                <p style={{ color: '#4B5563', marginBottom: 0 }}>{pass.detail}</p>
              </article>
            ))}
          </div>
          <p style={{ color: '#4B5563', marginBottom: 0 }}>
            These are planned founding paid-beta prices, not active charges.
          </p>
        </section>

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>AI Concierge</h2>
          <p style={{ color: '#4B5563' }}>
            Core flight-search conversation remains part of Core. Broader travel conversation, destination research,
            personalized planning, and current travel-information help are planned for Concierge with a monthly
            usage allowance.
          </p>
          <p style={{ color: '#4B5563', marginBottom: 0 }}>
            If a premium travel-chat question is unavailable during beta, Nonrevy should preserve the active flight search
            and keep the trip state intact.
          </p>
        </section>

        <section className="nonrevy-traveler-empty" style={{ border: '1px dashed #cbd5e1', borderRadius: 22, padding: 22, background: '#ffffff', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Billing status</h2>
          <p style={{ color: '#4B5563' }}>
            No paid-account controls are shown because paid memberships are not live.
            Future paid beta billing can connect secure checkout, billing management, verified webhooks, and server-side
            membership entitlement.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="nonrevy-traveler-link-action" href="/profile" style={{ border: '1px solid #d1d5db', borderRadius: 999, padding: '10px 14px', color: '#111827', fontWeight: 800, textDecoration: 'none' }}>
              Back to Profile
            </a>
            <a className="nonrevy-traveler-link-action" href="/" style={{ border: '1px solid #2563eb', borderRadius: 999, padding: '10px 14px', color: '#2563eb', fontWeight: 800, textDecoration: 'none' }}>
              Search Flights
            </a>
          </div>
        </section>
      </section>
    </main>
  )
}
