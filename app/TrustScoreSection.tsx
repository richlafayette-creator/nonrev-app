'use client'

import { useEffect, useMemo, useState } from 'react'
import { calculateTrustScore, loadVerifiedLoadReportCount } from '../lib/reputation'
import { loadTripOutcomes, type TripOutcome } from '../lib/tripOutcomes'

export default function TrustScoreSection() {
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])
  const [verifiedLoadReports, setVerifiedLoadReports] = useState(0)

  useEffect(() => {
    function refreshTrustSignals() {
      setOutcomes(loadTripOutcomes())
      setVerifiedLoadReports(loadVerifiedLoadReportCount())
    }

    refreshTrustSignals()
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshTrustSignals)
    window.addEventListener('nonrevy-reputation-updated', refreshTrustSignals)
    window.addEventListener('nonrevy-load-reports-updated', refreshTrustSignals)
    window.addEventListener('storage', refreshTrustSignals)
    return () => {
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshTrustSignals)
      window.removeEventListener('nonrevy-reputation-updated', refreshTrustSignals)
      window.removeEventListener('nonrevy-load-reports-updated', refreshTrustSignals)
      window.removeEventListener('storage', refreshTrustSignals)
    }
  }, [])

  const trust = useMemo(() => calculateTrustScore(outcomes, verifiedLoadReports), [outcomes, verifiedLoadReports])

  return (
    <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 22, background: 'var(--color-slate-850)', marginTop: 24 }}>
      <p style={{ color: 'var(--color-green-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>
        Reputation scaffold
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '4px 0' }}>Trust Score</h2>
          <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>
            Local-only placeholder score based on verified outcomes and future load-report signals.
          </p>
        </div>
        <strong style={{ color: 'var(--color-green-400)', fontSize: 44 }}>{trust.trustScore}/100</strong>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        {[
          ['Trust Score', `${trust.trustScore}/100`],
          ['Verified Outcomes', trust.verifiedOutcomes],
          ['Verified Load Reports', trust.verifiedLoadReports],
          ['Community Contribution Level', trust.communityContributionLevel]
        ].map(([label, value]) => (
          <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)' }}>
            <small style={{ color: 'var(--color-slate-400)' }}>{label}</small>
            <h3 style={{ color: 'var(--color-slate-50)', margin: '6px 0 0' }}>{value}</h3>
          </article>
        ))}
      </div>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 16, padding: 14, background: 'var(--color-slate-950)', marginTop: 14 }}>
        <strong style={{ color: 'var(--color-sky-400)' }}>Badges</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 12 }}>
          {trust.badges.map((badge) => (
            <article
              key={badge.label}
              style={{
                border: `1px solid ${badge.active ? 'var(--color-green-400)' : 'var(--color-slate-700)'}`,
                borderRadius: 14,
                padding: 14,
                background: badge.active ? 'rgba(20, 83, 45, 0.35)' : 'var(--color-slate-850)',
                color: badge.active ? '#dcfce7' : 'var(--color-slate-400)'
              }}
            >
              <h3 style={{ margin: 0 }}>{badge.label}</h3>
              <p style={{ margin: '6px 0 0' }}>Unlocks at {badge.threshold}+ trust.</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 16, padding: 14, background: 'var(--color-slate-950)', marginTop: 14 }}>
        <strong style={{ color: 'var(--color-yellow-400)' }}>Future Prediction Impact</strong>
        <ul style={{ color: 'var(--color-slate-300)', marginBottom: 0, paddingLeft: 20 }}>
          {trust.predictionImpact.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </section>
  )
}
