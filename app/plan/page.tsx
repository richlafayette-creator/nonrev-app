'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { flightMatchesSearch } from '../../lib/flightSearch'
import { delayRiskScore, rankItinerary } from '../../lib/intelligence'
import { allFlightFields, fieldValue, passengerFlightCoverageNotes, richFlightFieldLabels } from '../../lib/flightDataScaffold'
import { airportCodesFromRoute } from '../../lib/airportMapScaffold'
import { generateAiTripPlan, parseTripPlannerPrompt } from '../../lib/aiTripPlanner'
import { carrierScoringProfiles, getCarrierScoringScaffold, normalizeCarrierFamily, supportedCarrierOptions } from '../../lib/carrierScope'
import { historicalRouteStats, type HistoricalRoute } from '../../lib/historicalRoutes'
import { loadLoadReports, type LoadReport } from '../../lib/loadReports'
import { calculatePredictionEngine } from '../../lib/predictionEngine'
import { defaultTravelerProfile, loadTravelerProfileFromStorage } from '../../lib/travelerProfile'
import { loadTripOutcomes, type TripOutcome } from '../../lib/tripOutcomes'
import { saveTripWatch } from '../../lib/watchlist'
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

type ItineraryDebugMetadata = {
  parsedOrigin?: string
  parsedDestination?: string
  parsedDate?: string
  selectedCarrier: string
  supabaseResultCount: number
  aviationstackFallbackStatus: string
  flightAwareEnrichmentStatus: string
  finalItineraryCount: number
  safeErrors: string[]
}

function riskColor(risk: string) {
  if (risk.includes('Low')) return '#22c55e'
  if (risk.includes('Medium')) return '#facc15'
  return '#f87171'
}

type ItineraryComparison = {
  id: string
  route: string
  carrier: string
  score: number
  successProbability: number
  riskLevel: string
  connections: number
  totalTravelTime: string
  flightNumber: string
  isLive: boolean
  why: string[]
}

type FallbackItineraryResult = (typeof rankedItineraries)[number]

function clampScore(value: number) {
  return Math.max(1, Math.min(99, Math.round(value)))
}

function normalizeRouteText(route: string) {
  return route
    .toUpperCase()
    .replace(/\s*(?:→|->|–|—|-)\s*/g, ' → ')
    .replace(/\s+/g, ' ')
    .trim()
}

function routeLooksRelated(sourceRoute: string, targetRoute: string) {
  const source = normalizeRouteText(sourceRoute)
  const target = normalizeRouteText(targetRoute)
  return source === target || source.includes(target) || target.includes(source)
}

function matchingHistoricalRoute(route: string, historicalRoutes: HistoricalRoute[]) {
  return historicalRoutes.find((historicalRoute) => routeLooksRelated(route, historicalRoute.route))
}

function matchingRouteLoadReports(route: string, loadReports: LoadReport[]) {
  return loadReports.filter((report) => routeLooksRelated(route, report.route))
}

function matchingRouteOutcomes(route: string, outcomes: TripOutcome[]) {
  return outcomes.filter((outcome) => routeLooksRelated(route, outcome.route))
}

function loadReportAdjustment(reports: LoadReport[]) {
  return reports.reduce((total, report) => {
    const weight = report.trustedWeight || 1
    if (report.loadStatus === 'Seats open') return total + 3 * weight
    if (report.loadStatus === 'Looks workable') return total + 1.5 * weight
    if (report.loadStatus === 'Tight') return total - 2 * weight
    if (report.loadStatus === 'Full') return total - 5 * weight
    return total
  }, 0)
}

function outcomeSuccessRate(outcomes: TripOutcome[]) {
  if (!outcomes.length) return null
  const successes = outcomes.filter((outcome) => outcome.status === 'Yes, got on').length
  return Math.round((successes / outcomes.length) * 100)
}

function riskFromProbability(probability: number, fallbackRisk: string) {
  if (fallbackRisk && fallbackRisk !== 'Unknown') return fallbackRisk
  if (probability >= 82) return 'Low'
  if (probability >= 72) return 'Medium-Low'
  if (probability >= 60) return 'Medium'
  if (probability >= 48) return 'Medium-High'
  return 'High'
}

function parseScheduleTime(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function totalTravelTimeFromItinerary(itinerary: LiveItineraryResult) {
  const departure = parseScheduleTime(itinerary.legs[0]?.departureTime || itinerary.departureTime)
  const arrival = parseScheduleTime(itinerary.legs[itinerary.legs.length - 1]?.arrivalTime || itinerary.arrivalTime)
  if (!departure || !arrival || arrival <= departure) return 'Pending schedule data'
  const totalMinutes = Math.round((arrival - departure) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

function fallbackTravelTimeEstimate(itinerary: FallbackItineraryResult) {
  const airportCount = itinerary.route.split('→').length
  if (airportCount <= 1) return 'Pending schedule data'
  const estimatedMinutes = (airportCount - 1) * 165 + Math.max(0, airportCount - 2) * 75
  const hours = Math.floor(estimatedMinutes / 60)
  const minutes = estimatedMinutes % 60
  return `${hours}h ${minutes.toString().padStart(2, '0')}m estimate`
}

function buildLiveItineraryComparison(
  itinerary: LiveItineraryResult,
  predictionEngine: ReturnType<typeof calculatePredictionEngine>,
  historicalRoutes: HistoricalRoute[],
  loadReports: LoadReport[],
  outcomes: TripOutcome[]
): ItineraryComparison {
  const historicalRoute = matchingHistoricalRoute(itinerary.route, historicalRoutes)
  const routeReports = matchingRouteLoadReports(itinerary.route, loadReports)
  const routeOutcomes = matchingRouteOutcomes(itinerary.route, outcomes)
  const outcomeRate = outcomeSuccessRate(routeOutcomes)
  const connections = Math.max(0, itinerary.legs.length - 1)
  const loadAdjustment = Math.max(-8, Math.min(8, loadReportAdjustment(routeReports)))
  const historicalScore = historicalRoute?.score || predictionEngine.inputSummary.historicalAverageScore || itinerary.score
  const historicalSuccess = historicalRoute?.successRate || predictionEngine.inputSummary.historicalSuccessRate || predictionEngine.successProbability
  const outcomeSignal = outcomeRate === null ? 0 : (outcomeRate - historicalSuccess) * 0.16
  const connectionPenalty = connections * 4
  const successProbability = clampScore(
    predictionEngine.successProbability * 0.34 +
    itinerary.score * 0.26 +
    historicalSuccess * 0.22 +
    historicalScore * 0.12 +
    loadAdjustment +
    outcomeSignal -
    connectionPenalty
  )
  const score = clampScore(itinerary.score * 0.52 + successProbability * 0.32 + historicalScore * 0.16 - connectionPenalty)

  return {
    id: `live-${itinerary.id}`,
    route: itinerary.route,
    carrier: itinerary.carrier,
    score,
    successProbability,
    riskLevel: riskFromProbability(successProbability, itinerary.risk),
    connections,
    totalTravelTime: totalTravelTimeFromItinerary(itinerary),
    flightNumber: itinerary.flightNumber,
    isLive: true,
    why: [
      `Blends live itinerary score ${itinerary.score}/100 with probability engine baseline ${predictionEngine.successProbability}%.`,
      historicalRoute
        ? `Historical route match ${historicalRoute.route} contributes ${historicalRoute.successRate}% success and ${historicalRoute.reportCount} reports.`
        : `Carrier historical scaffold contributes ${predictionEngine.inputSummary.historicalSuccessRate}% average success.` ,
      routeReports.length
        ? `${routeReports.length} community load report${routeReports.length === 1 ? '' : 's'} add a ${loadAdjustment >= 0 ? '+' : ''}${loadAdjustment.toFixed(1)} weighted load signal.`
        : 'No matching community load reports yet, so the comparison keeps the route-neutral load assumption.',
      routeOutcomes.length
        ? `${routeOutcomes.length} saved outcome${routeOutcomes.length === 1 ? '' : 's'} calibrate this route at ${outcomeRate}% success.`
        : 'No saved outcomes for this exact route yet; traveler profile and historical signals carry more weight.',
      connections === 0 ? 'Nonstop option avoids connection risk.' : `${connections} connection${connections === 1 ? '' : 's'} adds a controlled recovery-risk penalty.`
    ]
  }
}

function buildFallbackItineraryComparison(
  itinerary: FallbackItineraryResult,
  predictionEngine: ReturnType<typeof calculatePredictionEngine>,
  historicalRoutes: HistoricalRoute[],
  loadReports: LoadReport[],
  outcomes: TripOutcome[],
  carrierLabel: string
): ItineraryComparison {
  const historicalRoute = matchingHistoricalRoute(itinerary.route, historicalRoutes)
  const routeReports = matchingRouteLoadReports(itinerary.route, loadReports)
  const routeOutcomes = matchingRouteOutcomes(itinerary.route, outcomes)
  const outcomeRate = outcomeSuccessRate(routeOutcomes)
  const airportCount = itinerary.route.split('→').length
  const connections = Math.max(0, airportCount - 2)
  const loadAdjustment = Math.max(-8, Math.min(8, loadReportAdjustment(routeReports)))
  const historicalScore = historicalRoute?.score || predictionEngine.inputSummary.historicalAverageScore || itinerary.ranking.score
  const historicalSuccess = historicalRoute?.successRate || predictionEngine.inputSummary.historicalSuccessRate || predictionEngine.successProbability
  const outcomeSignal = outcomeRate === null ? 0 : (outcomeRate - historicalSuccess) * 0.16
  const connectionPenalty = connections * 4
  const successProbability = clampScore(
    predictionEngine.successProbability * 0.36 +
    itinerary.ranking.score * 0.24 +
    historicalSuccess * 0.22 +
    historicalScore * 0.12 +
    loadAdjustment +
    outcomeSignal -
    connectionPenalty
  )
  const score = clampScore(itinerary.ranking.score * 0.5 + successProbability * 0.34 + historicalScore * 0.16 - connectionPenalty)

  return {
    id: `fallback-${itinerary.id}`,
    route: itinerary.route,
    carrier: carrierLabel,
    score,
    successProbability,
    riskLevel: riskFromProbability(successProbability, itinerary.confidence === 'Strong' ? 'Medium-Low' : 'Medium'),
    connections,
    totalTravelTime: fallbackTravelTimeEstimate(itinerary),
    flightNumber: itinerary.title,
    isLive: false,
    why: [
      `Combines fallback ranking ${itinerary.ranking.score}/100 with probability engine baseline ${predictionEngine.successProbability}%.`,
      historicalRoute
        ? `Historical route match ${historicalRoute.route} contributes ${historicalRoute.successRate}% success and ${historicalRoute.reportCount} reports.`
        : `Historical carrier scaffold contributes ${predictionEngine.inputSummary.historicalSuccessRate}% average success.`,
      routeReports.length
        ? `${routeReports.length} community load report${routeReports.length === 1 ? '' : 's'} add a ${loadAdjustment >= 0 ? '+' : ''}${loadAdjustment.toFixed(1)} weighted load signal.`
        : 'No matching community load reports yet; use this as planning guidance only.',
      routeOutcomes.length
        ? `${routeOutcomes.length} saved outcome${routeOutcomes.length === 1 ? '' : 's'} calibrate this route at ${outcomeRate}% success.`
        : 'No saved route outcomes yet; traveler profile and route intelligence remain the main signals.',
      connections === 0 ? 'Nonstop shape keeps connection risk low.' : `${connections} connection${connections === 1 ? '' : 's'} creates backup flexibility but adds transfer risk.`
    ]
  }
}

function comparisonMetricColor(value: number) {
  if (value >= 80) return '#22c55e'
  if (value >= 70) return '#38bdf8'
  if (value >= 60) return '#facc15'
  return '#f87171'
}

function ItineraryComparisonPanel({ comparisons, travelDate }: { comparisons: ItineraryComparison[]; travelDate: string }) {
  const [watchStatus, setWatchStatus] = useState('')

  if (comparisons.length < 2) return null

  function watchRoute(comparison: ItineraryComparison) {
    const saved = saveTripWatch({
      travelDate: travelDate.trim() || 'Flexible',
      carrier: comparison.carrier,
      selectedItinerary: comparison.route,
      score: comparison.score,
      successProbability: comparison.successProbability,
      riskLevel: comparison.riskLevel,
      connections: comparison.connections,
      totalTravelTime: comparison.totalTravelTime
    })

    if (saved) {
      setWatchStatus(`Watching ${saved.origin} → ${saved.destination} for ${saved.travelDate}.`)
    }
  }

  return (
    <section style={{ border: '1px solid #38bdf8', borderRadius: 24, padding: 20, background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.9))', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 1 }}>Itinerary comparison engine</strong>
          <h3 style={{ fontSize: 28, margin: '8px 0' }}>Top 3 recommended itineraries</h3>
          <p style={{ color: '#94a3b8', marginTop: 0 }}>
            Ranked with traveler profile, route intelligence, historical routes, community load reports, saved outcomes, and the probability engine.
          </p>
        </div>
        <span style={{ border: '1px solid #22c55e', borderRadius: 999, color: '#22c55e', padding: '8px 12px', fontWeight: 'bold' }}>
          Best: {comparisons[0]?.route}
        </span>
      </div>

      {watchStatus && <p style={{ color: '#22c55e', fontWeight: 'bold' }}>{watchStatus} <a href="/watchlist" style={{ color: '#38bdf8' }}>Open watchlist</a></p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 16 }}>
        {comparisons.map((comparison, index) => {
          const isBest = index === 0
          return (
            <article
              key={comparison.id}
              className="flight-card"
              style={{
                border: isBest ? '2px solid #22c55e' : '1px solid #334155',
                borderRadius: 20,
                padding: 18,
                background: isBest ? 'linear-gradient(135deg, rgba(20, 83, 45, 0.42), #0f172a)' : '#0f172a',
                position: 'relative'
              }}
            >
              {isBest && (
                <div style={{ position: 'absolute', top: -12, right: 16, borderRadius: 999, background: '#22c55e', color: '#020617', padding: '5px 10px', fontWeight: 'bold', fontSize: 12 }}>
                  Best Recommendation
                </div>
              )}
              <small style={{ color: isBest ? '#86efac' : '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1 }}>
                #{index + 1} · {comparison.isLive ? 'Live option' : 'Planning scaffold'}
              </small>
              <h4 style={{ color: '#f8fafc', fontSize: 22, margin: '8px 0' }}>{comparison.route}</h4>
              <p style={{ color: '#cbd5e1', margin: '0 0 12px' }}>
                Carrier: {comparison.carrier} · {comparison.flightNumber}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {[
                  ['Score', comparison.score, comparisonMetricColor(comparison.score)],
                  ['Success Probability', `${comparison.successProbability}%`, comparisonMetricColor(comparison.successProbability)],
                  ['Risk Level', comparison.riskLevel, riskColor(comparison.riskLevel)],
                  ['Connections', comparison.connections, comparison.connections === 0 ? '#22c55e' : '#facc15'],
                  ['Total Travel Time', comparison.totalTravelTime, '#38bdf8']
                ].map(([label, value, color]) => (
                  <div key={`${comparison.id}-${label}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>{label}</small>
                    <p style={{ margin: '4px 0 0', color: String(color), fontWeight: 'bold' }}>{value}</p>
                  </div>
                ))}
              </div>

              <details open={isBest} style={{ marginTop: 14 }}>
                <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>Why this route?</summary>
                <ul style={{ color: '#cbd5e1', paddingLeft: 20, marginBottom: 0 }}>
                  {comparison.why.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </details>
              <button
                type="button"
                onClick={() => watchRoute(comparison)}
                style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 12, border: 'none', background: isBest ? '#22c55e' : '#facc15', color: '#020617', fontWeight: 'bold' }}
              >
                Watch Route
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
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
  const [itineraryDebug, setItineraryDebug] = useState<ItineraryDebugMetadata | null>(null)
  const [query, setQuery] = useState('')
  const [flights, setFlights] = useState<any[]>([])
  const [lastUpdated, setLastUpdated] = useState('')
  const [travelerProfile, setTravelerProfile] = useState(defaultTravelerProfile)
  const [loadReports, setLoadReports] = useState<LoadReport[]>([])
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])
  const [aiTripPrompt, setAiTripPrompt] = useState('get me to Maui this weekend')
  const [aiPlannerStatus, setAiPlannerStatus] = useState('AI planner scaffold ready for natural language trip requests.')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialQuery = params.get('q') || ''
    const initialAiTrip = params.get('aiTrip') || ''
    setQuery(initialQuery || initialAiTrip)
    if (initialAiTrip) {
      setAiTripPrompt(initialAiTrip)
      setTripGoal(initialAiTrip)
      setAiPlannerStatus('AI trip planner scaffold parsed your homepage request.')
      runItinerarySearch(initialAiTrip)
    } else if (initialQuery) {
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
      setItineraryDebug(null)
      setItineraryStatus('Enter an itinerary request to search live flight data.')
      return
    }

    setItineraryLoading(true)
    setItineraryStatus('Searching Supabase flights first, then enriching matches when FlightAware is configured...')
    setItineraryWarnings([])
    setItineraryDebug(null)

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
      const apiWarnings = Array.isArray(data?.warnings) ? data.warnings : []
      setItineraryWarnings(data?.errorMessage ? [...new Set([...apiWarnings, data.errorMessage])] : apiWarnings)
      setItinerarySource(data?.sourceLabel || (data?.enrichedWithFlightAware ? 'Supabase flights + FlightAware enrichment' : 'Supabase flights table'))
      setItineraryDebug(data?.debug || null)
      setItineraryStatus(data?.statusMessage || (itineraries.length
        ? `${itineraries.length} live itinerary result${itineraries.length === 1 ? '' : 's'} found for ${data?.request?.origin || 'any origin'} → ${data?.request?.destination || 'any destination'}.`
        : 'No live flights found for this search. Showing fallback planning guidance.'
      ))
    } catch {
      setLiveItineraries([])
      setItineraryDebug(null)
      setItineraryStatus('Live itinerary search failed. Showing fallback planning guidance.')
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

  async function submitAiTripPlanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = aiTripPrompt.trim()
    if (!prompt) {
      setAiPlannerStatus('Add a natural language trip request to generate an AI planning scaffold.')
      return
    }

    setTripGoal(prompt)
    setQuery(prompt)
    setSubmitted(true)
    setAiPlannerStatus('AI planner scaffold generated route guidance and refreshed itinerary results.')
    window.history.replaceState(null, '', `/plan?aiTrip=${encodeURIComponent(prompt)}`)
    await runItinerarySearch(prompt)
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

  const itineraryComparisons = useMemo(() => {
    const comparisons = liveItineraries.length > 0
      ? liveItineraries.map((itinerary) => buildLiveItineraryComparison(
        itinerary,
        predictionEngine,
        historicalStats.routes,
        loadReports,
        outcomes
      ))
      : rankedItineraries.map((itinerary) => buildFallbackItineraryComparison(
        itinerary,
        predictionEngine,
        historicalStats.routes,
        loadReports,
        outcomes,
        scoringScaffold.recommendationScope
      ))

    return comparisons
      .sort((a, b) => b.score - a.score || b.successProbability - a.successProbability)
      .slice(0, 3)
  }, [liveItineraries, predictionEngine, historicalStats.routes, loadReports, outcomes, scoringScaffold.recommendationScope])

  const aiTripPreview = useMemo(
    () => parseTripPlannerPrompt(aiTripPrompt, travelerProfile),
    [aiTripPrompt, travelerProfile]
  )
  const aiTripPlan = useMemo(() => generateAiTripPlan({
    prompt: aiTripPrompt,
    travelerProfile,
    routeIntelligence: scoringScaffold.routeIntelligence,
    routeRecommendations: scoringScaffold.routeRecommendations,
    historicalRoutes: historicalStats.routes,
    predictionEngine
  }), [aiTripPrompt, travelerProfile, scoringScaffold.routeIntelligence, scoringScaffold.routeRecommendations, historicalStats.routes, predictionEngine])

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

        <section style={{ border: '1px solid #c084fc', borderRadius: 24, padding: 22, background: 'linear-gradient(135deg, rgba(49, 46, 129, 0.66), rgba(15, 23, 42, 0.96))', marginTop: 24 }}>
          <p style={{ color: '#c084fc', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>AI Trip Planner scaffold</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)', gap: 18, alignItems: 'start' }}>
            <form onSubmit={submitAiTripPlanner}>
              <h2 style={{ fontSize: 30, margin: '0 0 10px' }}>Ask in natural language.</h2>
              <p style={{ color: '#cbd5e1' }}>
                Examples: “get me to Maui this weekend”, “best Hawaii trip from LAX tomorrow”, “cheapest nonrev path to Tokyo”.
              </p>
              <textarea
                value={aiTripPrompt}
                onChange={(event) => setAiTripPrompt(event.target.value)}
                rows={4}
                placeholder="cheapest nonrev path to Tokyo"
                style={{ boxSizing: 'border-box', width: '100%', padding: 14, borderRadius: 16, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
                {[
                  ['Origin', aiTripPreview.origin],
                  ['Destination', `${aiTripPreview.destinationLabel} (${aiTripPreview.destination})`],
                  ['Date range', aiTripPreview.dateRange],
                  ['Preferences', aiTripPreview.preferences.join(', ')]
                ].map(([label, value]) => (
                  <article key={label} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>{label}</small>
                    <p style={{ margin: '4px 0 0', color: '#f8fafc', fontWeight: 'bold' }}>{value}</p>
                  </article>
                ))}
              </div>
              <button type="submit" style={{ marginTop: 14, padding: '14px 18px', borderRadius: 12, border: 'none', background: '#c084fc', color: '#020617', fontWeight: 'bold' }}>
                Generate AI trip plan
              </button>
              <p style={{ color: '#d8b4fe', marginBottom: 0 }}>{aiPlannerStatus}</p>
            </form>

            <aside style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#020617' }}>
              <strong style={{ color: '#22c55e' }}>Recommended plan</strong>
              <h3 style={{ color: '#f8fafc', margin: '8px 0' }}>{aiTripPlan.bestRoute}</h3>
              <p style={{ color: '#38bdf8', fontWeight: 'bold' }}>Backup: {aiTripPlan.backupRoute}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>Estimated success</small>
                  <p style={{ margin: '4px 0 0', color: '#22c55e', fontWeight: 'bold' }}>{aiTripPlan.estimatedSuccessProbability}%</p>
                </div>
                <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>Risk level</small>
                  <p style={{ margin: '4px 0 0', color: riskColor(aiTripPlan.riskLevel), fontWeight: 'bold' }}>{aiTripPlan.riskLevel}</p>
                </div>
              </div>
              <details open style={{ marginTop: 12 }}>
                <summary style={{ color: '#facc15', cursor: 'pointer', fontWeight: 'bold' }}>Why this route?</summary>
                <ul style={{ color: '#cbd5e1', paddingLeft: 20, marginBottom: 0 }}>
                  {aiTripPlan.whyThisRoute.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </details>
            </aside>
          </div>
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
              Supported today: United, Delta, Alaska Group. Alaska Group includes Alaska and Hawaiian. Search uses Supabase first, then Aviationstack fallback and FlightAware enrichment when configured.
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
          <div style={{ border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#020617', marginBottom: 16 }}>
            <strong style={{ color: '#38bdf8' }}>API/debug status</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 12 }}>
              {[
                ['Parsed origin', itineraryDebug?.parsedOrigin || 'Not parsed'],
                ['Parsed destination', itineraryDebug?.parsedDestination || 'Not parsed'],
                ['Parsed date', itineraryDebug?.parsedDate || 'Flexible'],
                ['Selected carrier', itineraryDebug?.selectedCarrier || carrier],
                ['Supabase result count', itineraryDebug?.supabaseResultCount ?? 'Pending'],
                ['Aviationstack fallback', itineraryDebug?.aviationstackFallbackStatus || 'Pending'],
                ['FlightAware enrichment', itineraryDebug?.flightAwareEnrichmentStatus || 'Pending'],
                ['Final itinerary count', itineraryDebug?.finalItineraryCount ?? liveItineraries.length]
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <p style={{ margin: '4px 0 0', color: '#f8fafc' }}>{value}</p>
                </article>
              ))}
            </div>
            {itineraryDebug?.safeErrors?.length ? (
              <div style={{ border: '1px solid #854d0e', borderRadius: 12, padding: 10, background: '#1c1917', color: '#fde68a', marginTop: 12 }}>
                <strong>Safe API messages</strong>
                <ul style={{ marginBottom: 0 }}>
                  {itineraryDebug.safeErrors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
          <ItineraryComparisonPanel comparisons={itineraryComparisons} travelDate={travelWindow} />
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
                No live flights found for this search. Showing fallback planning guidance.
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
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#0f172a', marginTop: 14 }}>
              <strong style={{ color: '#34d399' }}>Profile assumptions</strong>
              <ul style={{ color: '#cbd5e1', marginBottom: 0, paddingLeft: 20 }}>
                {predictionEngine.inputSummary.travelerProfileSignals.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
              <a href="/profile" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 12 }}>Edit profile scaffold</a>
            </div>
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


      </section>
    </main>
  )
}
