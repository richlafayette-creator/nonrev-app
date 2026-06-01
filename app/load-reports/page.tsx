'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  loadLoadReports,
  loadReportStats,
  loadStatusOptions,
  saveLoadReport,
  type LoadReport,
  type LoadStatus
} from '../../lib/loadReports'
import { calculateTrustScore } from '../../lib/reputation'
import { loadTravelerProfileFromStorage, type TravelerProfileScaffold } from '../../lib/travelerProfile'
import { loadTripOutcomes, type TripOutcome } from '../../lib/tripOutcomes'

function statusColor(status: LoadStatus) {
  if (status === 'Seats open') return '#22c55e'
  if (status === 'Looks workable') return '#38bdf8'
  if (status === 'Tight') return '#facc15'
  if (status === 'Full') return '#f87171'
  return '#94a3b8'
}

export default function LoadReportsPage() {
  const [carrier, setCarrier] = useState('United')
  const [flightNumber, setFlightNumber] = useState('')
  const [route, setRoute] = useState('')
  const [date, setDate] = useState('')
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('Looks workable')
  const [notes, setNotes] = useState('')
  const [reports, setReports] = useState<LoadReport[]>([])
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])
  const [profile, setProfile] = useState<TravelerProfileScaffold | null>(null)
  const [saveStatus, setSaveStatus] = useState('Load verification scaffold ready.')

  useEffect(() => {
    function refreshReports() {
      setReports(loadLoadReports())
      setOutcomes(loadTripOutcomes())
      setProfile(loadTravelerProfileFromStorage())
    }

    refreshReports()
    window.addEventListener('nonrevy-load-reports-updated', refreshReports)
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshReports)
    window.addEventListener('storage', refreshReports)
    return () => {
      window.removeEventListener('nonrevy-load-reports-updated', refreshReports)
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshReports)
      window.removeEventListener('storage', refreshReports)
    }
  }, [])

  const stats = useMemo(() => loadReportStats(reports), [reports])
  const trust = useMemo(() => calculateTrustScore(outcomes, stats.verifiedReportsCount), [outcomes, stats.verifiedReportsCount])
  const recentReports = reports.slice(0, 12)

  function submitLoadReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const savedReport = saveLoadReport({
      carrier: carrier.trim() || 'Unknown carrier',
      flightNumber: flightNumber.trim().toUpperCase() || 'TBD',
      route: route.trim().toUpperCase() || 'Route TBD',
      date: date || 'Date TBD',
      loadStatus,
      notes: notes.trim(),
      contributorTrustScore: trust.trustScore
    })

    if (savedReport) {
      setReports(loadLoadReports())
      setSaveStatus(`Saved local verification for ${savedReport.flightNumber} with ${savedReport.trustedWeight}x placeholder trust weight.`)
      setFlightNumber('')
      setRoute('')
      setDate('')
      setNotes('')
    }
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        <a href="/load-reports" style={{ color: '#facc15' }}>Load Reports</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#facc15', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          Community load verification scaffold
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Verify Load</h1>
        <p style={{ color: '#94a3b8', maxWidth: 780, fontSize: 18 }}>
          Submit local-only load reports for future community validation. Trusted contributors receive placeholder weighting so later predictions can favor higher-quality signals.
        </p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {[
            ['Recent Reports', stats.totalReports, '#38bdf8'],
            ['Verified Reports Count', stats.verifiedReportsCount, '#22c55e'],
            ['Contributor Trust Score', `${trust.trustScore}/100`, '#facc15'],
            ['Trusted Weighting Signal', `${stats.trustedSignal}x`, '#c084fc']
          ].map(([label, value, color]) => (
            <article key={label} className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
              <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
              <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
            </article>
          ))}
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          <form onSubmit={submitLoadReport} style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Submit load report</h2>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Carrier
              <select
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                <option>United</option>
                <option>Delta</option>
                <option>Alaska Group</option>
                <option>Other</option>
              </select>
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Flight Number
              <input
                value={flightNumber}
                onChange={(event) => setFlightNumber(event.target.value.toUpperCase())}
                placeholder="UA123"
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Route
              <input
                value={route}
                onChange={(event) => setRoute(event.target.value.toUpperCase())}
                placeholder="LAX → DEN"
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Load Status
              <select
                value={loadStatus}
                onChange={(event) => setLoadStatus(event.target.value as LoadStatus)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                {loadStatusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Gate list looked short, agent said seats likely, jumpseat unknown..."
                rows={4}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <button type="submit" style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#facc15', color: '#020617', fontWeight: 'bold' }}>
              Save local load verification
            </button>
            <p style={{ color: '#94a3b8', marginBottom: 0 }}>{saveStatus}</p>
          </form>

          <aside style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Reputation integration</h2>
            <p style={{ color: '#94a3b8' }}>
              Verified reports feed the Trust Score scaffold immediately and can later combine with trip outcomes to tune Success Probability.
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                ['Community Contribution Level', trust.communityContributionLevel],
                ['Weighted contributor rule', 'New 1.0x · Trusted 1.25x · Elite 1.5x'],
                ['Traveler profile', `${profile?.employeeAirline || 'Profile pending'} · ${profile?.travelerType || 'Traveler pending'}`],
                ['Home airport', profile?.homeAirport || 'Profile pending']
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <a href="/reputation" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 16 }}>View trust score scaffold</a>
          </aside>
        </div>

        <section style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ fontSize: 30, margin: 0 }}>Recent Reports</h2>
            <a href="/plan" style={{ color: '#38bdf8' }}>Back to route recommendations</a>
          </div>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {recentReports.length === 0 && (
              <article className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
                <h3 style={{ marginTop: 0 }}>No load reports yet</h3>
                <p style={{ color: '#cbd5e1', marginBottom: 0 }}>
                  Submit the first community load verification above. It stays in this browser until backend sync is added.
                </p>
              </article>
            )}
            {recentReports.map((report) => (
              <article key={report.id} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{report.carrier} {report.flightNumber}</h3>
                    <p style={{ color: '#38bdf8', fontWeight: 'bold', margin: '6px 0' }}>{report.route}</p>
                    <small style={{ color: '#94a3b8' }}>{report.date} · {new Date(report.createdAt).toLocaleString()}</small>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: statusColor(report.loadStatus) }}>{report.loadStatus}</strong>
                    <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>{report.trustedWeight}x trust weight</p>
                  </div>
                </div>
                {report.notes && <p style={{ color: '#cbd5e1', marginBottom: 0 }}>{report.notes}</p>}
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
