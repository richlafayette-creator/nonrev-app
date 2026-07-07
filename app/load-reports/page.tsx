'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  loadLoadReports,
  loadReportConfidenceOptions,
  loadReportStats,
  loadStatusOptions,
  saveLoadReport,
  type LoadReport,
  type LoadReportConfidenceLevel,
  type LoadStatus
} from '../../lib/loadReports'
import { calculateTrustScore } from '../../lib/reputation'
import { loadTravelerProfileFromStorage, type TravelerProfileScaffold } from '../../lib/travelerProfile'
import { loadTripOutcomes, type TripOutcome } from '../../lib/tripOutcomes'

function statusColor(status: LoadStatus) {
  if (status === 'Seats open') return 'var(--color-green-500)'
  if (status === 'Looks workable') return 'var(--color-sky-400)'
  if (status === 'Tight') return 'var(--color-yellow-400)'
  if (status === 'Full') return 'var(--color-red-400)'
  return 'var(--color-slate-400)'
}

export default function LoadReportsPage() {
  const [airline, setAirline] = useState('United')
  const [flightNumber, setFlightNumber] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('')
  const [seatsAvailableEstimate, setSeatsAvailableEstimate] = useState('')
  const [standbysClearedEstimate, setStandbysClearedEstimate] = useState('')
  const [confidenceLevel, setConfidenceLevel] = useState<LoadReportConfidenceLevel>('Medium')
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
  const recentReports = reports.slice(0, 6)
  const reportHistory = reports.slice(0, 40)

  function submitLoadReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const savedReport = saveLoadReport({
      airline: airline.trim() || 'Unknown airline',
      flightNumber: flightNumber.trim().toUpperCase() || 'TBD',
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      date: date || 'Date TBD',
      loadStatus,
      seatsAvailableEstimate: seatsAvailableEstimate === '' ? null : Number(seatsAvailableEstimate),
      standbysClearedEstimate: standbysClearedEstimate === '' ? null : Number(standbysClearedEstimate),
      confidenceLevel,
      notes: notes.trim(),
      contributorTrustScore: trust.trustScore
    })

    if (savedReport) {
      setReports(loadLoadReports())
      setSaveStatus(`Saved structured report for ${savedReport.flightNumber} with ${savedReport.reportTrustScore}/100 report trust and ${savedReport.recencyWeight} recency weight.`)
      setFlightNumber('')
      setOrigin('')
      setDestination('')
      setDate('')
      setSeatsAvailableEstimate('')
      setStandbysClearedEstimate('')
      setConfidenceLevel('Medium')
      setNotes('')
    }
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Profile</a>
        <a href="/reputation" style={{ marginRight: 16, color: 'var(--color-green-400)' }}>Trust</a>
        <a href="/outcomes" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Outcomes</a>
        <a href="/load-reports" style={{ color: 'var(--color-yellow-400)' }}>Load Reports</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-yellow-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          Community load verification scaffold
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Verify Load</h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 780, fontSize: 18 }}>
          Submit local-only load reports for future community validation. Trusted contributors receive placeholder weighting so later predictions can favor higher-quality signals.
        </p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {[
            ['Recent Reports', stats.totalReports, 'var(--color-sky-400)'],
            ['Verified Reports Count', stats.verifiedReportsCount, 'var(--color-green-500)'],
            ['Contributor Trust Score', `${trust.trustScore}/100`, 'var(--color-yellow-400)'],
            ['Avg Report Trust', `${stats.averageReportTrustScore}/100`, 'var(--color-green-400)'],
            ['Recency Weight', `${stats.averageRecencyWeight}x avg`, 'var(--color-sky-400)'],
            ['Trusted Weighting Signal', `${stats.trustedSignal}x`, 'var(--color-purple-400)']
          ].map(([label, value, color]) => (
            <article key={label} className="mini-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
              <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
              <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
            </article>
          ))}
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          <form onSubmit={submitLoadReport} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 22, background: 'var(--color-slate-850)' }}>
            <h2 style={{ marginTop: 0 }}>Submit load report</h2>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Airline
              <select
                value={airline}
                onChange={(event) => setAirline(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              >
                <option>United</option>
                <option>Delta</option>
                <option>Alaska Group</option>
                <option>Other</option>
              </select>
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Flight Number
              <input
                value={flightNumber}
                onChange={(event) => setFlightNumber(event.target.value.toUpperCase())}
                placeholder="UA123"
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Origin
              <input
                value={origin}
                onChange={(event) => setOrigin(event.target.value.toUpperCase())}
                placeholder="LAX"
                maxLength={3}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Destination
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value.toUpperCase())}
                placeholder="DEN"
                maxLength={3}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
                Seats available estimate
                <input
                  type="number"
                  min="0"
                  value={seatsAvailableEstimate}
                  onChange={(event) => setSeatsAvailableEstimate(event.target.value)}
                  placeholder="8"
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
                />
              </label>
              <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
                Standbys cleared estimate
                <input
                  type="number"
                  min="0"
                  value={standbysClearedEstimate}
                  onChange={(event) => setStandbysClearedEstimate(event.target.value)}
                  placeholder="3"
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
                />
              </label>
            </div>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Confidence level
              <select
                value={confidenceLevel}
                onChange={(event) => setConfidenceLevel(event.target.value as LoadReportConfidenceLevel)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              >
                {loadReportConfidenceOptions.map((level) => <option key={level}>{level}</option>)}
              </select>
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Load Status
              <select
                value={loadStatus}
                onChange={(event) => setLoadStatus(event.target.value as LoadStatus)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              >
                {loadStatusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Gate list looked short, agent said seats likely, jumpseat unknown..."
                rows={4}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              />
            </label>
            <button type="submit" style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: 'var(--color-yellow-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
              Save local load verification
            </button>
            <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{saveStatus}</p>
          </form>

          <aside style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 22, background: 'var(--color-slate-850)' }}>
            <h2 style={{ marginTop: 0 }}>Reputation integration</h2>
            <p style={{ color: 'var(--color-slate-400)' }}>
              Verified reports feed the Trust Score scaffold immediately and can later combine with trip outcomes to tune Success Probability.
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                ['Community Contribution Level', trust.communityContributionLevel],
                ['Weighted contributor rule', 'New 1.0x · Trusted 1.25x · Elite 1.5x, then confidence and recency weighted'],
                ['Traveler profile', `${profile?.employeeAirline || 'Profile pending'} · ${profile?.travelerType || 'Traveler pending'}`],
                ['Home airport', profile?.homeAirport || 'Profile pending']
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)' }}>
                  <small style={{ color: 'var(--color-slate-400)' }}>{label}</small>
                  <h3 style={{ color: 'var(--color-slate-50)', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <a href="/reputation" style={{ display: 'inline-block', color: 'var(--color-sky-400)', marginTop: 16 }}>View trust score scaffold</a>
          </aside>
        </div>

        <section style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ fontSize: 30, margin: 0 }}>Recent Reports</h2>
            <a href="/plan" style={{ color: 'var(--color-sky-400)' }}>Back to route recommendations</a>
          </div>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {recentReports.length === 0 && (
              <article className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                <h3 style={{ marginTop: 0 }}>No load reports yet</h3>
                <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>
                  Submit the first community load verification above. It stays in this browser until backend sync is added.
                </p>
              </article>
            )}
            {recentReports.map((report) => (
              <article key={report.id} className="flight-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{report.airline || report.carrier} {report.flightNumber}</h3>
                    <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', margin: '6px 0' }}>{report.origin || '???'} → {report.destination || '???'}</p>
                    <small style={{ color: 'var(--color-slate-400)' }}>{report.date} · {new Date(report.createdAt).toLocaleString()}</small>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: statusColor(report.loadStatus) }}>{report.loadStatus}</strong>
                    <p style={{ color: 'var(--color-slate-400)', margin: '6px 0 0' }}>{report.reportTrustScore}/100 report trust · {report.recencyWeight}x recency</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  <span style={{ border: '1px solid var(--color-slate-700)', borderRadius: 999, padding: '4px 8px', color: 'var(--color-slate-300)' }}>Seats est: {report.seatsAvailableEstimate ?? 'unknown'}</span>
                  <span style={{ border: '1px solid var(--color-slate-700)', borderRadius: 999, padding: '4px 8px', color: 'var(--color-slate-300)' }}>Standbys cleared est: {report.standbysClearedEstimate ?? 'unknown'}</span>
                  <span style={{ border: '1px solid var(--color-slate-700)', borderRadius: 999, padding: '4px 8px', color: 'var(--color-slate-300)' }}>{report.confidenceLevel} confidence</span>
                </div>
                {report.notes && <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>{report.notes}</p>}
              </article>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 30, border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 22, background: 'var(--color-slate-850)' }}>
          <h2 style={{ marginTop: 0 }}>Report History</h2>
          <p style={{ color: 'var(--color-slate-400)' }}>Structured local history used by route confidence, success probability, and route ranking. Most recent and highest-trust reports carry more weight.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr style={{ color: 'var(--color-slate-400)', textAlign: 'left' }}>
                  {['Flight', 'Date', 'Route', 'Seats', 'Cleared', 'Confidence', 'Report Trust', 'Recency', 'Submitted'].map((heading) => (
                    <th key={heading} style={{ borderBottom: '1px solid var(--color-slate-700)', padding: '10px 8px' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportHistory.map((report) => (
                  <tr key={`history-${report.id}`} style={{ color: 'var(--color-slate-200)' }}>
                    <td style={{ borderBottom: '1px solid var(--color-slate-800)', padding: '10px 8px' }}>{report.airline || report.carrier} {report.flightNumber}</td>
                    <td style={{ borderBottom: '1px solid var(--color-slate-800)', padding: '10px 8px' }}>{report.date}</td>
                    <td style={{ borderBottom: '1px solid var(--color-slate-800)', padding: '10px 8px' }}>{report.origin || '???'} → {report.destination || '???'}</td>
                    <td style={{ borderBottom: '1px solid var(--color-slate-800)', padding: '10px 8px' }}>{report.seatsAvailableEstimate ?? 'unknown'}</td>
                    <td style={{ borderBottom: '1px solid var(--color-slate-800)', padding: '10px 8px' }}>{report.standbysClearedEstimate ?? 'unknown'}</td>
                    <td style={{ borderBottom: '1px solid var(--color-slate-800)', padding: '10px 8px' }}>{report.confidenceLevel}</td>
                    <td style={{ borderBottom: '1px solid var(--color-slate-800)', padding: '10px 8px' }}>{report.reportTrustScore}/100</td>
                    <td style={{ borderBottom: '1px solid var(--color-slate-800)', padding: '10px 8px' }}>{report.recencyWeight}x</td>
                    <td style={{ borderBottom: '1px solid var(--color-slate-800)', padding: '10px 8px' }}>{new Date(report.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!reportHistory.length && <p style={{ color: 'var(--color-slate-300)' }}>No report history yet.</p>}
          </div>
        </section>
      </section>
    </main>
  )
}
