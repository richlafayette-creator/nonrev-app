'use client'

import { useEffect, useMemo, useState } from 'react'
import TrustScoreSection from '../TrustScoreSection'
import {
  communityContributorTrustBreakdown,
  loadCommunityContributorReputation,
  loadCommunityLoads,
  type CommunityLoadContributorReputation,
  type CommunityLoadReport
} from '../../lib/communityLoads'

export default function ReputationPage() {
  const [communityReputation, setCommunityReputation] = useState<CommunityLoadContributorReputation | null>(null)
  const [communityReports, setCommunityReports] = useState<CommunityLoadReport[]>([])

  useEffect(() => {
    function refreshCommunityTrust() {
      setCommunityReputation(loadCommunityContributorReputation())
      setCommunityReports(loadCommunityLoads())
    }
    refreshCommunityTrust()
    window.addEventListener('nonrevy-community-loads-updated', refreshCommunityTrust)
    window.addEventListener('nonrevy-reputation-updated', refreshCommunityTrust)
    window.addEventListener('storage', refreshCommunityTrust)
    return () => {
      window.removeEventListener('nonrevy-community-loads-updated', refreshCommunityTrust)
      window.removeEventListener('nonrevy-reputation-updated', refreshCommunityTrust)
      window.removeEventListener('storage', refreshCommunityTrust)
    }
  }, [])

  const communityBreakdown = useMemo(
    () => communityContributorTrustBreakdown(communityReputation || loadCommunityContributorReputation()),
    [communityReputation]
  )
  const contributorReports = useMemo(
    () => communityReports.filter((report) => !communityReputation || report.contributorId === communityReputation.contributorId),
    [communityReports, communityReputation]
  )

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Profile</a>
        <a href="/requests" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>My Requests</a>
        <a href="/credits" style={{ marginRight: 16, color: 'var(--color-amber-400)' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: 'var(--color-green-400)' }}>Trust</a>
        <a href="/load-reports" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Load Reports</a>
        <a href="/outcomes" style={{ color: 'var(--color-green-500)' }}>Outcomes</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-green-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Trust scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Trust & reputation</h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 760 }}>
          Local reputation signals for contributor reliability, outcome-confirmed answers, and community load quality weighting.
        </p>
        <TrustScoreSection />

        <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)', marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ color: 'var(--color-green-400)' }}>Community contributor trust</strong>
              <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>
                Trust now blends accepted reports, source quality, community validation, and a corroboration penalty for stale or inaccurate marks.
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ color: 'var(--color-slate-50)', fontSize: 32 }}>{communityBreakdown.trustScore}/100</strong>
              <p style={{ color: 'var(--color-slate-300)', margin: 0 }}>{communityBreakdown.trustLevel}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
            {[
              ['Reports', communityReputation?.totalReports ?? 0],
              ['Accepted', communityReputation?.acceptedReports ?? 0],
              ['Confirmed marks', communityReputation?.confirmedValidations ?? 0],
              ['Outdated marks', communityReputation?.outdatedValidations ?? 0],
              ['Inaccurate marks', communityReputation?.inaccurateValidations ?? 0],
              ['Avg source trust', communityReputation?.averageSourceTrustScore ?? 50]
            ].map(([label, value]) => (
              <article key={label} style={{ border: '1px solid var(--color-slate-800)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)' }}>
                <strong style={{ color: 'var(--color-slate-50)', fontSize: 24 }}>{value}</strong>
                <p style={{ color: 'var(--color-slate-400)', margin: '4px 0 0' }}>{label}</p>
              </article>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
            {[
              ['Submission quality', `${communityBreakdown.submissionQualityScore}/50`],
              ['Validation score', `${communityBreakdown.validationScore}/42`],
              ['Volume score', `${communityBreakdown.volumeScore}/24`],
              ['Corroboration penalty', `-${communityBreakdown.corroborationPenalty}`]
            ].map(([label, value]) => (
              <article key={label} style={{ border: '1px solid var(--color-slate-800)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)' }}>
                <strong style={{ color: 'var(--color-sky-300)' }}>{label}</strong>
                <p style={{ color: 'var(--color-slate-50)', margin: '8px 0 0', fontWeight: 'bold' }}>{value}</p>
              </article>
            ))}
          </div>

          <ul style={{ color: 'var(--color-slate-300)', paddingLeft: 20 }}>
            {communityBreakdown.explanation.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </section>

        <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)', marginTop: 18 }}>
          <strong style={{ color: 'var(--color-yellow-400)' }}>Recent community reports in this trust profile</strong>
          {contributorReports.length ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {contributorReports.slice(0, 5).map((report) => (
                <article key={report.id} style={{ border: '1px solid var(--color-slate-800)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)' }}>
                  <strong style={{ color: 'var(--color-slate-50)' }}>{report.flightNumber} · {report.route}</strong>
                  <p style={{ color: 'var(--color-slate-400)', margin: '6px 0 0' }}>{report.availableSeats} open · {report.standbyCount} standby · source trust {report.sourceTrustScore}/100</p>
                </article>
              ))}
            </div>
          ) : <p style={{ color: 'var(--color-slate-400)' }}>Submit community loads from the planner to build a local trust profile.</p>}
          <a href="/load-reports" style={{ color: 'var(--color-sky-400)', display: 'inline-block', marginTop: 12 }}>Open Load Reports</a>
        </section>
      </section>
    </main>
  )
}
