'use client'

import TrustScoreSection from '../TrustScoreSection'

export default function ReputationPage() {
  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/load-reports" style={{ marginRight: 16, color: '#facc15' }}>Load Reports</a>
        <a href="/outcomes" style={{ color: '#22c55e' }}>Outcomes</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#34d399', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Trust scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Trust & reputation</h1>
        <p style={{ color: '#94a3b8', maxWidth: 760 }}>
          Local placeholder reputation signals for contributor reliability, outcome-confirmed answers, and future load-report quality weighting.
        </p>
        <TrustScoreSection />
        <section style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a', marginTop: 18 }}>
          <strong style={{ color: '#facc15' }}>Community load verification</strong>
          <p style={{ color: '#94a3b8' }}>
            Load reports update the verified report count and placeholder trusted-contributor weighting in this score.
          </p>
          <a href="/load-reports" style={{ color: '#38bdf8' }}>Open Load Reports</a>
        </section>
      </section>
    </main>
  )
}
