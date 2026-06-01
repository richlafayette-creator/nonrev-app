'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { flightMatchesSearch } from '../../lib/flightSearch'
import { delayRiskScore, rankItinerary } from '../../lib/intelligence'
import { allFlightFields, fieldValue, passengerFlightCoverageNotes, richFlightFieldLabels } from '../../lib/flightDataScaffold'
import { airportCodesFromRoute } from '../../lib/airportMapScaffold'
import { carrierScoringProfiles, getCarrierScoringScaffold, normalizeCarrierFamily, supportedCarrierOptions } from '../../lib/carrierScope'
import { historicalRouteStats } from '../../lib/historicalRoutes'
import { loadLoadReports, type LoadReport } from '../../lib/loadReports'
import { calculatePredictionEngine } from '../../lib/predictionEngine'
import { defaultTravelerProfile, loadTravelerProfileFromStorage } from '../../lib/travelerProfile'
import { loadTripOutcomes, type TripOutcome } from '../../lib/tripOutcomes'
import MapboxAirportMap from '../MapboxAirportMap'
import OutcomeCapture from '../OutcomeCapture'

const mockItineraries = [
  {
    id: 1,
    title: 'Island hop with backup options',
    route: 'LAX → HNL → OGG',
    confidence: 'Strong',
    window: 'Apr 12-18',
    notes: 'Start with the earliest LAX-HNL bank, keep OGG as a same-day fallback, and verify return loads 48 hours out.',
    segments: ['LAX to HNL: morning widebody preferred', 'HNL to OGG: flexible island hop', 'OGG to LAX: midweek return'],
    backupOptions: 4,
    travelerFriction: 4
  },
  {
    id: 2,
    title: 'Europe shoulder-season sprint',
    route: 'JFK → LHR → CDG',
    confidence: 'Verify',
    window: 'May 3-9',
    notes: 'Prioritize nonstop transatlantic options, then use rail or short-haul backup positioning if Paris loads tighten.',
    segments: ['JFK to LHR: overnight departure', 'London stopover: 2 nights', 'CDG return: monitor premium spillover'],
    backupOptions: 3,
    travelerFriction: 9
  },
  {
    id: 3,
    title: 'Long weekend mileage saver',
    route: 'SFO → DEN → SFO',
    confidence: 'Strong',
    window: 'Next 3-day weekend',
    notes: 'A simple out-and-back with multiple daily frequencies and easy same-day recovery options.',
    segments: ['SFO to DEN: Friday afternoon', 'Denver: flexible stay', 'DEN to SFO: Monday morning'],
    backupOptions: 5,
    travelerFriction: 2
  }
]

const rankedItineraries = [...mockItineraries]
  .map((itinerary) => ({ ...itinerary, ranking: rankItinerary(itinerary) }))
  .sort((a, b) => b.ranking.score - a.ranking.score)

function confidenceColor(confidence: string) {
  if (confidence === 'Strong') return '#22c55e'
  if (confidence === 'Verify') return '#facc15'
  return '#f87171'
}

type LiveItineraryLeg = {
  id?: string | number
  route: string
  origin: string
  destination: string
  carrier: string
  flightNumber: string
  departureTime: string
  arrivalTime: string
  aircraft: string
  status: string
  gate?: string
  terminal?: string
  score: number
  risk: string
  source: string
}

type LiveItineraryResult = {
  id: string
  route: string
  legs: LiveItineraryLeg[]
  carrier: string
  flightNumber: string
  departureTime: string
  arrivalTime: string
  aircraft: string
  status: string
  gate?: string
  terminal?: string
  score: number
  risk: string
  source: string
}

function riskColor(risk: string) {
  if (risk.includes('Low')) return '#22c55e'
  if (risk.includes('Medium')) return '#facc15'
  return '#f87171'
}

export default function PlanPage() {
  const [tripGoal, setTripGoal] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [travelWindow, setTravelWindow] = useState('')
  const [travelerCount, setTravelerCount] = useState('1')
  const [maxLegs, setMaxLegs] = useState('2')
  const [carrier, setCarrier] = useState('all')
  const [voiceStatus, setVoiceStatus] = useState('Voice capture scaffold ready.')
  const [submitted, setSubmitted] = useState(false)
  const [itineraryStatus, setItineraryStatus] = useState('Enter an itinerary request to search live flight data.')
  const [itineraryLoading, setItineraryLoading] = useState(false)
  const [liveItineraries, setLiveItineraries] = useState<LiveItineraryResult[]>([])
  const [itineraryWarnings, setItineraryWarnings] = useState<string[]>([])
  const [itinerarySource, setItinerarySource] = useState('Supabase flights table')
  const [query, setQuery] = useState('')
  const [flights, setFlights] = useState<any[]>([])
  const [lastUpdated, setLastUpdated] = useState('')
  const [travelerProfile, setTravelerProfile] = useState(defaultTravelerProfile)
  const [loadReports, setLoadReports] = useState<LoadReport[]>([])
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get('q') || ''
    setQuery(initialQuery)
    if (initialQuery) {
      setTripGoal(initialQuery)
      runItinerarySearch(initialQuery)
    }
  }, [])

  useEffect(() => {
    function refreshLocalScaffolds() {
      setTravelerProfile(loadTravelerProfileFromStorage())
      setLoadReports(loadLoadReports())
      setOutcomes(loadTripOutcomes())
    }

    refreshLocalScaffolds()
    window.addEventListener('nonrevy-load-reports-updated', refreshLocalScaffolds)
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshLocalScaffolds)
    window.addEventListener('storage', refreshLocalScaffolds)
    return () => {
      window.removeEventListener('nonrevy-load-reports-updated', refreshLocalScaffolds)
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshLocalScaffolds)
      window.removeEventListener('storage', refreshLocalScaffolds)
    }
  }, [])

  useEffect(() => {
    async function loadFlights() {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/flights?select=*&order=created_at.desc&limit=100`,
        { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' } }
      )
      const data = await res.json()
      setFlights(Array.isArray(data) ? data : [])
      setLastUpdated(new Date().toLocaleTimeString())
    }

    loadFlights()
    const refresh = window.setInterval(loadFlights, 30000)
    return () => window.clearInterval(refresh)
  }, [])

  async function runItinerarySearch(searchText: string) {
    const trimmedSearch = searchText.trim()
    if (!trimmedSearch && !homeAirport.trim()) {
      setLiveItineraries([])
      setItineraryStatus('Enter an itinerary request to search live flight data.')
      return
    }

    setItineraryLoading(true)
    setItineraryStatus('Searching Supabase flights first, then enriching matches when FlightAware is configured...')
    setItineraryWarnings([])

    const params = new URLSearchParams()
    if (trimmedSearch) params.set('q', trimmedSearch)
    if (homeAirport.trim()) params.set('origin', homeAirport.trim().toUpperCase())
    if (travelWindow.trim()) params.set('date', travelWindow.trim())
    params.set('carrier', carrier)
    params.set('maxLegs', maxLegs)

    try {
      const response = await fetch(`/api/itinerary/search?${params.toString()}`)
      const data = await response.json()
      const itineraries = Array.isArray(data?.itineraries) ? data.itineraries as LiveItineraryResult[] : []
      setLiveItineraries(itineraries)
      setItineraryWarnings(Array.isArray(data?.warnings) ? data.warnings : [])
      setItinerarySource(data?.enrichedWithFlightAware ? 'Supabase flights + FlightAware enrichment' : 'Supabase flights table')
      setItineraryStatus(itineraries.length
        ? `${itineraries.length} live itinerary result${itineraries.length === 1 ? '' : 's'} found for ${data?.request?.origin || 'any origin'} → ${data?.request?.destination || 'any destination'}.`
        : 'No matching live flight data found yet. Showing placeholder itinerary fallback below.'
      )
    } catch {
      setLiveItineraries([])
      setItineraryStatus('Live itinerary search failed. Showing placeholder itinerary fallback below.')
      setItineraryWarnings(['Itinerary API request failed'])
    } finally {
      setItineraryLoading(false)
    }
  }

  async function submitPlanRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (tripGoal.trim()) {
      setQuery(tripGoal.trim())
      window.history.replaceState(null, '', `/plan?q=${encodeURIComponent(tripGoal.trim())}`)
    }
    await runItinerarySearch(tripGoal)
  }

  function startVoiceScaffold() {
    setVoiceStatus('Listening scaffold active — speech-to-itinerary capture will plug in here.')
  }

  const matchingFlights = useMemo(
    () => flights.filter((flight) => flightMatchesSearch(flight, query || tripGoal)),
    [flights, query, tripGoal]
  )
  const scoringScaffold = useMemo(() => getCarrierScoringScaffold(carrier, travelerProfile), [carrier, travelerProfile])
  const historicalStats = useMemo(() => historicalRouteStats(carrier), [carrier])
  const carrierProfile = useMemo(() => {
    const normalizedCarrier = normalizeCarrierFamily(carrier)
    return normalizedCarrier === 'all' ? carrierScoringProfiles.united : carrierScoringProfiles[normalizedCarrier]
  }, [carrier])
  const predictionEngine = useMemo(() => calculatePredictionEngine({
    carrier,
    travelerProfile,
    carrierProfile,
    recommendationScope: scoringScaffold.recommendationScope,
    routeIntelligence: scoringScaffold.routeIntelligence,
    routeRecommendations: scoringScaffold.routeRecommendations,
    historicalStats,
    loadReports,
    outcomes
  }), [carrier, travelerProfile, carrierProfile, scoringScaffold, historicalStats, loadReports, outcomes])

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/historical-routes" style={{ marginRight: 16, color: '#facc15' }}>Historical Routes</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        <a href="/load-reports" style={{ marginRight: 16, color: '#facc15' }}>Load Reports</a>
        <a href="/profile" style={{ marginRight: 16, color: '#34d399' }}>Profile</a>
        <a href="/login" style={{ color: '#f472b6' }}>Login</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#fb7185', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
          Search and itinerary planner
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>
          Plan your nonrevy route.
        </h1>
        <p style={{ color: '#94a3b8', maxWidth: 720, fontSize: 18 }}>
          Flight results, itinerary results, and searchable flight data live here so the homepage can stay focused on search.
        </p>
        <div style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a', color: '#cbd5e1' }}>
          <strong style={{ color: '#38bdf8' }}>Passenger flight coverage scaffold</strong>
          <ul style={{ marginBottom: 0 }}>
            {passengerFlightCoverageNotes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>

        <section style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a', color: '#cbd5e1', marginTop: 18 }}>
          <strong style={{ color: '#38bdf8' }}>Scoring engine scaffold</strong>
          <p style={{ color: '#94a3b8' }}>
            Placeholder airline-aware scoring model for {scoringScaffold.familyLabel}. Alaska Group is treated as one supported carrier family covering Alaska Airlines and Hawaiian Airlines. No live load integration yet.
          </p>
          <p style={{ color: '#cbd5e1' }}>
            Selected carrier profile: {scoringScaffold.selectedCarrier} · Active family: {scoringScaffold.familyLabel} · Members: {scoringScaffold.members.join(', ')}
          </p>
          <p style={{ color: '#cbd5e1' }}>
            Placeholder weights: Hub Strength {scoringScaffold.weights['Hub Strength']} · Route Complexity {scoringScaffold.weights['Route Complexity']} · Seasonal Demand {scoringScaffold.weights['Seasonal Demand']} · Historical Performance {scoringScaffold.weights['Historical Performance']}
          </p>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginBottom: 14 }}>
            <strong style={{ color: '#facc15' }}>Historical route score explanation</strong>
            <p style={{ color: '#94a3b8' }}>
              {historicalStats.explanation}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                ['Historical score', historicalStats.averageScore],
                ['Historical success', `${historicalStats.averageSuccessRate}%`],
                ['Report count', historicalStats.reportCount],
                ['Top sample', historicalStats.topRoute?.route || 'Pending']
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <a href="/historical-routes" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 12 }}>
              View historical route database scaffold
            </a>
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {scoringScaffold.breakdown.map((item) => (
              <article key={item.label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                <small style={{ color: '#94a3b8' }}>{item.label}</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0' }}>{item.value}</h3>
                <p style={{ margin: 0, color: '#cbd5e1' }}>{item.note}</p>
              </article>
            ))}
          </div>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
            <strong style={{ color: '#38bdf8' }}>Success Probability</strong>
            <p style={{ color: '#94a3b8' }}>
              Prediction engine scaffold blended from traveler profile, carrier scoring, route intelligence, historical route stats, community load reports, and outcome history for {scoringScaffold.recommendationScope}.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                <small style={{ color: '#94a3b8' }}>Probability %</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{predictionEngine.successProbability}%</h3>
              </article>
              <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                <small style={{ color: '#94a3b8' }}>Confidence level</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{predictionEngine.confidenceLevel}</h3>
              </article>
              <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                <small style={{ color: '#94a3b8' }}>Risk category</small>
                <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{predictionEngine.riskCategory}</h3>
              </article>
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
              <strong style={{ color: '#facc15' }}>Explanation bullets</strong>
              <ul style={{ color: '#cbd5e1', marginBottom: 0, paddingLeft: 20 }}>
                {predictionEngine.explanationBullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 14 }}>
              {[
                ['Carrier base', `${predictionEngine.inputSummary.carrierDefaultProbability}%`],
                ['Route risk', predictionEngine.inputSummary.routeRisk],
                ['Load reports', predictionEngine.inputSummary.communityReportCount],
                ['Outcome rate', `${predictionEngine.inputSummary.outcomeSuccessRate}%`]
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
              <strong style={{ color: '#34d399' }}>Profile assumptions</strong>
              <ul style={{ color: '#cbd5e1', marginBottom: 0, paddingLeft: 20 }}>
                {predictionEngine.inputSummary.travelerProfileSignals.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
              <a href="/profile" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 12 }}>Edit profile scaffold</a>
            </div>
          </section>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
            <strong style={{ color: '#34d399' }}>Traveler profile summary</strong>
            <p style={{ color: '#94a3b8' }}>
              Local profile values currently feeding route scoring assumptions.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                ['Employee airline', travelerProfile.employeeAirline],
                ['Traveler type', travelerProfile.travelerType],
                ['Pass priority', travelerProfile.passPriority],
                ['Home airport', travelerProfile.homeAirport],
                ['Preferred airports', travelerProfile.preferredAirports.join(', ')]
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <a href="/profile" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 12 }}>Update local profile</a>
          </section>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
            <strong style={{ color: '#facc15' }}>Historical route intelligence scaffold</strong>
            <p style={{ color: '#94a3b8' }}>
              Placeholder route guidance tied to the selected carrier profile. No backend APIs yet.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {Object.entries(scoringScaffold.routeIntelligence).map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
          </section>
          <section style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginTop: 14 }}>
            <strong style={{ color: '#22c55e' }}>Top 3 route recommendations</strong>
            <p style={{ color: '#94a3b8' }}>
              Placeholder ranking tied to the score card and route intelligence for {scoringScaffold.recommendationScope}.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '10px 8px' }}>Rank</th>
                    <th style={{ padding: '10px 8px' }}>Route</th>
                    <th style={{ padding: '10px 8px' }}>Score</th>
                    <th style={{ padding: '10px 8px' }}>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {scoringScaffold.routeRecommendations.map((recommendation) => (
                    <tr key={`${recommendation.rank}-${recommendation.route}`} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '12px 8px', color: '#22c55e', fontWeight: 'bold' }}>{recommendation.rank}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <strong style={{ color: '#f8fafc' }}>{recommendation.route}</strong>
                        <br />
                        <small style={{ color: '#94a3b8' }}>{recommendation.carrier}</small>
                      </td>
                      <td style={{ padding: '12px 8px' }}>{recommendation.score}</td>
                      <td style={{ padding: '12px 8px' }}>{recommendation.risk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <a href="/load-reports" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 12 }}>
              Verify a load for these recommendations
            </a>
            <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              {scoringScaffold.routeRecommendations.map((recommendation) => (
                <OutcomeCapture
                  key={`outcome-${recommendation.rank}-${recommendation.route}`}
                  subjectType="route-recommendation"
                  subjectId={`${recommendation.carrier}-${recommendation.rank}-${recommendation.route}`}
                  title={`Rank ${recommendation.rank} ${recommendation.carrier} recommendation`}
                  route={recommendation.route}
                />
              ))}
            </div>
          </section>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 28 }}>
          <form
            onSubmit={submitPlanRequest}
            style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}
          >
            <h2 style={{ marginTop: 0 }}>Itinerary request</h2>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Trip goal or flight search
              <textarea
                value={tripGoal}
                onChange={(event) => setTripGoal(event.target.value)}
                placeholder="LAX-HNL, LAX to HNL, AA123, beach weekend from SFO..."
                rows={4}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Home airport
              <input
                value={homeAirport}
                onChange={(event) => setHomeAirport(event.target.value.toUpperCase())}
                placeholder="LAX"
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
                Travel window
                <input
                  value={travelWindow}
                  onChange={(event) => setTravelWindow(event.target.value)}
                  placeholder="Apr 12-18"
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
                />
              </label>
              <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
                Travelers
                <input
                  value={travelerCount}
                  onChange={(event) => setTravelerCount(event.target.value)}
                  inputMode="numeric"
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
                />
              </label>
            </div>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Max legs
              <select
                value={maxLegs}
                onChange={(event) => setMaxLegs(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                <option value="1">Nonstop only</option>
                <option value="2">Up to 2 legs</option>
                <option value="3">Up to 3 legs scaffold</option>
              </select>
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Carrier scope scaffold
              <select
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                {supportedCarrierOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <p style={{ color: '#94a3b8' }}>
              Supported today: United, Delta, Alaska Group. Alaska Group includes Alaska and Hawaiian. Search now calls the itinerary pipeline using Supabase flights first.
            </p>
            <button
              type="submit"
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}
            >
              Update planner results
            </button>
            {submitted && (
              <p style={{ color: '#38bdf8', marginBottom: 0 }}>
                Draft request staged for {homeAirport || 'your home airport'} · {travelWindow || 'flexible dates'} · {travelerCount || '1'} traveler(s).
              </p>
            )}
          </form>

          <aside style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: 'linear-gradient(135deg, #111827, #312e81)' }}>
            <h2 style={{ marginTop: 0 }}>Voice input scaffold</h2>
            <p style={{ color: '#cbd5e1' }}>
              Capture spoken trip ideas here, then convert them into structured itinerary requests in a later integration.
            </p>
            <button
              type="button"
              onClick={startVoiceScaffold}
              style={{ padding: 14, borderRadius: 999, border: '1px solid #fda4af', background: '#fb7185', color: 'white', fontWeight: 'bold' }}
            >
              🎙 Start voice note
            </button>
            <p style={{ color: '#fecdd3' }}>{voiceStatus}</p>
            <div style={{ marginTop: 20, padding: 14, borderRadius: 16, background: 'rgba(15, 23, 42, 0.7)' }}>
              <strong>Current search</strong>
              <p style={{ color: '#cbd5e1', marginBottom: 0 }}>
                {query || 'No homepage query yet. Try searching from nonrevy home.'}
              </p>
            </div>
          </aside>
        </div>

        <section style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: 30 }}>Flight results</h2>
          <p style={{ color: '#94a3b8' }}>
            {query || tripGoal ? `${matchingFlights.length} matching flights` : `${flights.length} searchable flights loaded`} · Last refresh {lastUpdated || 'pending'}
          </p>
          {(query || tripGoal ? matchingFlights : flights).map((flight) => {
            const risk = delayRiskScore(flight)
            return (
              <article key={flight.id} className="flight-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, marginBottom: 14, background: '#0f172a' }}>
                <h3 style={{ marginTop: 0 }}>{flight.flight_number}</h3>
                <p style={{ color: '#38bdf8' }}>{flight.origin} → {flight.destination}</p>
                <p>Aircraft: {flight.aircraft || 'Unknown'} · Status: {flight.status || 'Unknown'} · Score: {flight.score ?? 'Not scored'}</p>
                <p>Delay risk: {risk.label} ({risk.score}/100)</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
                  <MapboxAirportMap airportCode={flight.origin} title={`${flight.origin || 'Origin'} airport map`} compact />
                  <MapboxAirportMap airportCode={flight.destination} title={`${flight.destination || 'Destination'} airport map`} compact />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
                  {richFlightFieldLabels.map((field) => (
                    <div key={field.key} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                      <small style={{ color: '#94a3b8' }}>{field.label}</small>
                      <p style={{ margin: '4px 0 0' }}>{fieldValue(flight, field.key)}</p>
                    </div>
                  ))}
                </div>
                <details style={{ marginTop: 12 }}>
                  <summary style={{ color: '#38bdf8', cursor: 'pointer' }}>Show all DB fields</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
                    {allFlightFields(flight).map(([key, value]) => (
                      <div key={key} style={{ border: '1px solid #334155', borderRadius: 10, padding: 8, background: '#020617' }}>
                        <small style={{ color: '#94a3b8' }}>{key}</small>
                        <p style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{value === null || value === undefined || value === '' ? 'Not available yet' : String(value)}</p>
                      </div>
                    ))}
                  </div>
                </details>
                <a href={`/flights/${flight.id}`} style={{ color: '#38bdf8' }}>View flight detail</a>
              </article>
            )
          })}
        </section>

        <section style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: 30 }}>Live itinerary results</h2>
          <p style={{ color: itineraryLoading ? '#facc15' : '#94a3b8' }}>
            {itineraryStatus} · Source: {itinerarySource}
          </p>
          {itineraryWarnings.length > 0 && (
            <div style={{ border: '1px solid #854d0e', borderRadius: 14, padding: 14, background: '#1c1917', color: '#fde68a', marginBottom: 14 }}>
              <strong>Pipeline notes</strong>
              <ul style={{ marginBottom: 0 }}>
                {itineraryWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
          {liveItineraries.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {liveItineraries.map((itinerary) => (
                <article key={itinerary.id} style={{ border: '1px solid #334155', borderRadius: 20, padding: 18, background: '#0f172a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>{itinerary.flightNumber}</h3>
                    <span style={{ color: riskColor(itinerary.risk), fontWeight: 'bold' }}>{itinerary.risk}</span>
                  </div>
                  <p style={{ color: '#38bdf8', fontSize: 18, fontWeight: 'bold' }}>{itinerary.route}</p>
                  <p style={{ color: '#facc15', fontWeight: 'bold' }}>Live score: {itinerary.score}/100</p>
                  <p style={{ color: '#cbd5e1' }}>
                    Carrier: {itinerary.carrier} · Aircraft: {itinerary.aircraft} · Status: {itinerary.status}
                  </p>
                  <p style={{ color: '#94a3b8' }}>
                    Depart: {itinerary.departureTime} · Arrive: {itinerary.arrivalTime}
                  </p>
                  <p style={{ color: '#94a3b8' }}>
                    Gate: {itinerary.gate || 'Not available'} · Terminal: {itinerary.terminal || 'Not available'} · {itinerary.source}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, margin: '12px 0' }}>
                    {airportCodesFromRoute(itinerary.route).map((code) => (
                      <MapboxAirportMap key={`${itinerary.id}-${code}`} airportCode={code} title={`${code} airport preview`} compact />
                    ))}
                  </div>
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    {itinerary.legs.map((leg, index) => (
                      <div key={`${itinerary.id}-${leg.flightNumber}-${index}`} style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
                        <strong style={{ color: '#f8fafc' }}>Leg {index + 1}: {leg.flightNumber}</strong>
                        <p style={{ color: '#38bdf8', margin: '6px 0' }}>{leg.origin} → {leg.destination}</p>
                        <p style={{ color: '#cbd5e1', margin: 0 }}>
                          {leg.departureTime} → {leg.arrivalTime} · {leg.aircraft} · {leg.status} · Score {leg.score}
                        </p>
                      </div>
                    ))}
                  </div>
                  <OutcomeCapture
                    subjectType="saved-itinerary"
                    subjectId={`live-${itinerary.id}`}
                    title={`Live itinerary ${itinerary.flightNumber}`}
                    route={itinerary.route}
                  />
                </article>
              ))}
            </div>
          ) : (
            <>
              <h3 style={{ color: '#facc15' }}>Placeholder fallback itinerary cards</h3>
              <p style={{ color: '#94a3b8' }}>
                These appear only when the live itinerary pipeline has no matching Supabase/FlightAware-backed results yet.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                {rankedItineraries.map((itinerary) => (
              <article key={itinerary.id} style={{ border: '1px solid #334155', borderRadius: 20, padding: 18, background: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>{itinerary.title}</h3>
                  <span style={{ color: confidenceColor(itinerary.confidence), fontWeight: 'bold' }}>{itinerary.confidence}</span>
                </div>
                <p style={{ color: '#facc15', fontWeight: 'bold' }}>{itinerary.ranking.label}: {itinerary.ranking.score}/100</p>
                <p style={{ color: '#38bdf8', fontSize: 18, fontWeight: 'bold' }}>{itinerary.route}</p>
                <p style={{ color: '#94a3b8' }}>Window: {itinerary.window}</p>
                <p>{itinerary.notes}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, margin: '12px 0' }}>
                  {airportCodesFromRoute(itinerary.route).map((code) => (
                    <MapboxAirportMap key={`${itinerary.id}-${code}`} airportCode={code} title={`${code} airport preview`} compact />
                  ))}
                </div>
                <p style={{ color: '#cbd5e1' }}>Ranking notes: {itinerary.ranking.notes.join(' · ')}</p>
                <ul style={{ color: '#cbd5e1', paddingLeft: 20 }}>
                  {itinerary.segments.map((segment) => (
                    <li key={segment}>{segment}</li>
                  ))}
                </ul>
                <OutcomeCapture
                  subjectType="saved-itinerary"
                  subjectId={String(itinerary.id)}
                  title={itinerary.title}
                  route={itinerary.route}
                />
              </article>
                ))}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  )
}
