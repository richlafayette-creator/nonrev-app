export default function ReferralsPage() {
  return (
    <main className="app-shell nonrevy-traveler-page nonrevy-referrals-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <section className="nonrevy-traveler-page__inner" style={{ maxWidth: 920, margin: '0 auto' }}>
        <p className="nonrevy-traveler-page__eyebrow" style={{ color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          Referrals
        </p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Referrals are not active in private beta.</h1>
        <p style={{ color: '#4B5563', maxWidth: 760 }}>
          The invited private beta is focused on flight search, saved trips, watchlists, and load requests.
          Referral rewards and partner programs are not live yet.
        </p>

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Future referral ideas</h2>
          <p style={{ color: '#4B5563' }}>
            Future traveler partnerships may include hotels, rental cars, crash pads, airport transportation,
            travel insurance, eSIMs, and related traveler services.
          </p>
          <p style={{ color: '#4B5563', marginBottom: 0 }}>
            Nonrevy is not showing partner payouts, vendor offers, or balances during this private beta.
          </p>
        </section>

        <section className="nonrevy-traveler-empty" style={{ border: '1px dashed #cbd5e1', borderRadius: 22, padding: 22, background: '#ffffff', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Want to invite someone?</h2>
          <p style={{ color: '#4B5563' }}>
            Share feedback with the beta team from Profile instead of using an automated referral link.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="nonrevy-traveler-link-action" href="/profile" style={{ border: '1px solid #d1d5db', borderRadius: 999, padding: '10px 14px', color: '#111827', fontWeight: 800, textDecoration: 'none' }}>
              Back to Profile
            </a>
            <a className="nonrevy-traveler-link-action" href="/beta-feedback" style={{ border: '1px solid #2563eb', borderRadius: 999, padding: '10px 14px', color: '#2563eb', fontWeight: 800, textDecoration: 'none' }}>
              Send Feedback
            </a>
          </div>
        </section>
      </section>
    </main>
  )
}
