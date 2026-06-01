'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  carrierFamilyLabels,
  carrierScoringProfiles,
  getCarrierScoringScaffold,
  supportedCarrierOptions,
  type SupportedCarrierValue
} from '../../lib/carrierScope'
import { historicalRoutes, routesForCarrier, type HistoricalRoute } from '../../lib/historicalRoutes'
import { loadLoadReports, type LoadReport } from '../../lib/loadReports'
import { loadTravelerProfileFromStorage, defaultTravelerProfile } from '../../lib/travelerProfile'
import { loadTripOutcomes, type TripOutcome } from '../../lib/tripOutcomes'

type IntelligenceRoute = {
  id: string
  route: string
  carrier: HistoricalRoute['carrier']
  historicalScore: number
  historicalSuccessRate: number
  historicalReportCount: number
  outcomeCount: number
  successfulOutcomes: number
  localReportCount: number
  trustedLoadSignal: number
  successProbability: number
  confidenceScore: number
  confidenceLabel: 'Low' | 'Medium' | 'Medium-High' | 'High'
  notes: string
  signalSummary: string[]
}

function normalizeRoute(route: string) {
  return route
    .toUpperCase()
    .replace(/\s*(?:→|->|–|—|-)\s*/g, ' → ')
    .replace(/\s+/g, ' ')
    .trim()
}

function carrierColor(carrier: string) {
  if (carrier === 'United') return '#38bdf8'
  if (carrier === 'Delta') return '#fb7185'
  return '#34d399'
}

function probabilityColor(probability: number) {
  if (probability >= 80) return '#22c55e'
  if (probability >= 72) return '#38bdf8'
  if (probability >= 62) return '#facc15'
  return '#f87171'
}

function confidenceLabel(score: number): IntelligenceRoute['confidenceLabel'] {
  if (score >= 84) return 'High'
  if (score >= 70) return 'Medium-High'
  if (score >= 52) return 'Medium'
  return 'Low'
}

function loadReportSignal(report: LoadReport) {
  const weight = report.trustedWeight || 1
  if (report.loadStatus === 'Seats open') return 5 * weight
  if (report.loadStatus === 'Looks workable') return 3 * weight
  if (report.loadStatus === 'Tight') return -3 * weight
  if (report.loadStatus === 'Full') return -7 * weight
  return 0
}

function outcomeSuccessCount(outcomes: TripOutcome[]) {
  return outcomes.filter((outcome) => outcome.status === 'Yes, got on').length
}

function routeIncludesCarrier(routeCarrier: string, selectedCarrier: SupportedCarrierValue) {
  if (selectedCarrier === 'all') return true
  return carrierFamilyLabels[selectedCarrier] === routeCarrier
}

function routeBaseForCarrier(carrier: HistoricalRoute['carrier']) {
  if (carrier === 'United') return carrierScoringProfiles.united.successDefaults.probability
  if (carrier === 'Delta') return carrierScoringProfiles.delta.successDefaults.probability
  return carrierScoringProfiles['alaska-group'].successDefaults.probability
}

function routeMatchesRoute(reportOrOutcomeRoute: string, historicalRoute: string) {
  const normalizedSource = normalizeRoute(reportOrOutcomeRoute)
  const normalizedHistorical = normalizeRoute(historicalRoute)
  return normalizedSource === normalizedHistorical || normalizedHistorical.includes(normalizedSource) || normalizedSource.includes(normalizedHistorical)
}

function aggregateIntelligence(
  carrier: SupportedCarrierValue,
  loadReports: LoadReport[],
  outcomes: TripOutcome[]
): IntelligenceRoute[] {
  return routesForCarrier(carrier).map((route) => {
    const matchingReports = loadReports.filter((report) =>
      routeIncludesCarrier(route.carrier, carrier) &&
      (report.carrier === route.carrier || route.carrier === 'Alaska Group' && ['Alaska', 'Alaska Group', 'Hawaiian'].some((name) => report.carrier.includes(name))) &&
      routeMatchesRoute(report.route, route.route)
    )
    const matchingOutcomes = outcomes.filter((outcome) => routeMatchesRoute(outcome.route, route.route))
    const successfulOutcomes = outcomeSuccessCount(matchingOutcomes)
    const outcomeRate = matchingOutcomes.length ? Math.round((successfulOutcomes / matchingOutcomes.length) * 100) : route.successRate
    const trustedLoadSignal = Number(matchingReports.reduce((total, report) => total + loadReportSignal(report), 0).toFixed(1))
    const reportVolumeBonus = Math.min(5, Math.round((route.reportCount + matchingReports.length) / 8))
    const outcomeSignal = matchingOutcomes.length ? (outcomeRate - route.successRate) * 0.18 : 0
    const scoreSignal = (route.score - 78) * 0.22
    const loadSignal = Math.max(-8, Math.min(8, trustedLoadSignal))
    const rawProbability =
      routeBaseForCarrier(route.carrier) * 0.34 +
      route.successRate * 0.34 +
      route.score * 0.18 +
      outcomeSignal +
      scoreSignal +
      loadSignal +
      reportVolumeBonus
    const successProbability = Math.max(1, Math.min(99, Math.round(rawProbability)))
    const confidenceScore = Math.max(1, Math.min(99, Math.round(
      route.reportCount * 2.4 +
      matchingReports.length * 8 +
      matchingOutcomes.length * 10 +
      (route.successRate >= 74 ? 10 : 0) +
      (route.score >= 82 ? 8 : 0)
    )))

    return {
      id: `${route.carrier}-${route.route}`,
      route: route.route,
      carrier: route.carrier,
      historicalScore: route.score,
      historicalSuccessRate: route.successRate,
      historicalReportCount: route.reportCount,
      outcomeCount: matchingOutcomes.length,
      successfulOutcomes,
      localReportCount: matchingReports.length,
      trustedLoadSignal,
      successProbability,
      confidenceScore,
      confidenceLabel: confidenceLabel(confidenceScore),
      notes: route.notes,
      signalSummary: [
        `${route.reportCount} historical route reports`,
        `${matchingOutcomes.length} local outcomes (${outcomeRate}% success signal)`,
        `${matchingReports.length} community load reports`,
        `${trustedLoadSignal >= 0 ? '+' : ''}${trustedLoadSignal} weighted load signal`
      ]
    }
  })
}

function DashboardCard({ title, routes, metric }: { title: string; routes: IntelligenceRoute[]; metric: (route: IntelligenceRoute) => string | number }) {
  return (
    <section className="flight-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a' }}>
      <h2 style={{ marginTop: 0, fontSize: 24 }}>{title}</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {routes.map((route, index) => (
          <article key={`${title}-${route.id}`} style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <small style={{ color: carrierColor(route.carrier), textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1 }}>
                  #{index + 1} · {route.carrier}
                </small>
                <h3 style={{ margin: '6px 0', color: '#f8fafc' }}>{route.route}</h3>
              </div>
              <strong style={{ color: probabilityColor(route.successProbability), fontSize: 24 }}>{metric(route)}</strong>
            </div>
            <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>{route.signalSummary.join(' · ')}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function IntelligencePage() {
  const [carrier, setCarrier] = useState<SupportedCarrierValue>('all')
  const [loadReports, setLoadReports] = useState<LoadReport[]>([])
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])

  useEffect(() => {
    function refreshSignals() {
      setLoadReports(loadLoadReports())
      setOutcomes(loadTripOutcomes())
    }

    refreshSignals()
    window.addEventListener('nonrevy-load-reports-updated', refreshSignals)
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshSignals)
    window.addEventListener('storage', refreshSignals)
    return () => {
      window.removeEventListener('nonrevy-load-reports-updated', refreshSignals)
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshSignals)
      window.removeEventListener('storage', refreshSignals)
    }
  }, [])

  const routeIntelligence = useMemo(() => aggregateIntelligence(carrier, loadReports, outcomes), [carrier, loadReports, outcomes])
  const travelerProfile = useMemo(() => loadTravelerProfileFromStorage() || defaultTravelerProfile, [])
  const scoringScaffold = useMemo(() => getCarrierScoringScaffold(carrier, travelerProfile), [carrier, travelerProfile])
  const bestPerformingRoutes = useMemo(() => [...routeIntelligence].sort((a, b) => b.historicalScore - a.historicalScore).slice(0, 4), [routeIntelligence])
  const highestProbabilityRoutes = useMemo(() => [...routeIntelligence].sort((a, b) => b.successProbability - a.successProbability).slice(0, 4), [routeIntelligence])
  const mostReportedRoutes = useMemo(() => [...routeIntelligence].sort((a, b) => (b.historicalReportCount + b.localReportCount) - (a.historicalReportCount + a.localReportCount)).slice(0, 4), [routeIntelligence])
  const highestConfidenceRoutes = useMemo(() => [...routeIntelligence].sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 4), [routeIntelligence])
  const averageProbability = routeIntelligence.length
    ? Math.round(routeIntelligence.reduce((total, route) => total + route.successProbability, 0) / routeIntelligence.length)
    : 0
  const totalReports = routeIntelligence.reduce((total, route) => total + route.historicalReportCount + route.localReportCount, 0)
  const totalOutcomes = routeIntelligence.reduce((total, route) => total + route.outcomeCount, 0)
  const highConfidenceCount = routeIntelligence.filter((route) => route.confidenceLabel === 'High' || route.confidenceLabel === 'Medium-High').length

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/historical-routes" style={{ marginRight: 16, color: '#facc15' }}>Historical Routes</a>
        <a href="/load-reports" style={{ marginRight: 16, color: '#facc15' }}>Load Reports</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        <a href="/intelligence" style={{ color: '#c084fc' }}>Intelligence</a>
      </nav>

      <section style={{ maxWidth: 1180, margin: '0 auto' }}>
        <p style={{ color: '#c084fc', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          Route outcome intelligence dashboard
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Intelligence</h1>
        <p style={{ color: '#94a3b8', maxWidth: 820, fontSize: 18 }}>
          Local-only MVP dashboard blending historical route data, saved trip outcomes, community load reports, and placeholder success probability. No live airline inventory or production data is queried here.
        </p>

        <section className="filter-panel" style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', margin: '24px 0' }}>
          <label style={{ display: 'block', color: '#cbd5e1', maxWidth: 430 }}>
            Carrier filter
            <select
              value={carrier}
              onChange={(event) => setCarrier(event.target.value as SupportedCarrierValue)}
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
            >
              {supportedCarrierOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {[
            ['Routes Analyzed', routeIntelligence.length, '#38bdf8'],
            ['Avg Success Probability', `${averageProbability}%`, '#22c55e'],
            ['Reports Blended', totalReports, '#facc15'],
            ['Tracked Outcomes', totalOutcomes, '#fb7185'],
            ['High Confidence Routes', highConfidenceCount, '#c084fc']
          ].map(([label, value, color]) => (
            <article key={label} className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
              <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
              <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
            </article>
          ))}
        </section>

        <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginBottom: 24 }}>
          <strong style={{ color: '#34d399' }}>Signal blend</strong>
          <p style={{ color: '#94a3b8' }}>
            {scoringScaffold.recommendationScope} uses carrier scoring defaults, {historicalRoutes.length} bundled historical route examples, browser-local trip outcomes, and verified community load reports saved on this device.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {Object.entries(scoringScaffold.routeIntelligence).map(([label, value]) => (
              <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                <small style={{ color: '#94a3b8' }}>{label}</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
              </article>
            ))}
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          <DashboardCard title="Best performing routes" routes={bestPerformingRoutes} metric={(route) => route.historicalScore} />
          <DashboardCard title="Highest success probability routes" routes={highestProbabilityRoutes} metric={(route) => `${route.successProbability}%`} />
          <DashboardCard title="Most reported routes" routes={mostReportedRoutes} metric={(route) => route.historicalReportCount + route.localReportCount} />
          <DashboardCard title="Highest confidence routes" routes={highestConfidenceRoutes} metric={(route) => route.confidenceLabel} />
        </div>

        <section style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ fontSize: 30, margin: 0 }}>Route intelligence detail</h2>
            <a href="/plan" style={{ color: '#38bdf8' }}>Use these signals in planner</a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14, marginTop: 16 }}>
            {routeIntelligence.map((route) => (
              <article key={route.id} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
                <strong style={{ color: carrierColor(route.carrier), textTransform: 'uppercase', letterSpacing: 1 }}>{route.carrier}</strong>
                <h3 style={{ fontSize: 24, margin: '8px 0', color: '#f8fafc' }}>{route.route}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {[
                    ['Success Probability', `${route.successProbability}%`, probabilityColor(route.successProbability)],
                    ['Historical Score', route.historicalScore, '#facc15'],
                    ['Outcomes', `${route.successfulOutcomes}/${route.outcomeCount}`, '#22c55e'],
                    ['Confidence', route.confidenceLabel, '#c084fc']
                  ].map(([label, value, color]) => (
                    <div key={`${route.id}-${label}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                      <small style={{ color: '#94a3b8' }}>{label}</small>
                      <p style={{ margin: '4px 0 0', color: String(color), fontWeight: 'bold' }}>{value}</p>
                    </div>
                  ))}
                </div>
                <p style={{ color: '#cbd5e1' }}>{route.notes}</p>
                <p style={{ color: '#94a3b8', marginBottom: 0 }}>{route.signalSummary.join(' · ')}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
