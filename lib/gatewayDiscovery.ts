import { type TripMission, normalizeTripMission } from './tripMission'

export interface GatewayCandidate {
  airportCode: string
  city: string
  country: string
  region: string
  score: number
  reasons: string[]
  onwardConnectivityScore: number
  zedCoverageScore: number
  historicalReliabilityScore: number
}

const SCORE_WEIGHTS = {
  historicalReliabilityScore: 0.4,
  onwardConnectivityScore: 0.35,
  zedCoverageScore: 0.25
}

const gatewayCatalog: GatewayCandidate[] = [
  { airportCode: 'FCO', city: 'Rome', country: 'Italy', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 82, zedCoverageScore: 78, historicalReliabilityScore: 76 },
  { airportCode: 'FRA', city: 'Frankfurt', country: 'Germany', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 97, zedCoverageScore: 94, historicalReliabilityScore: 91 },
  { airportCode: 'MUC', city: 'Munich', country: 'Germany', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 90, zedCoverageScore: 88, historicalReliabilityScore: 89 },
  { airportCode: 'ZRH', city: 'Zurich', country: 'Switzerland', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 86, zedCoverageScore: 84, historicalReliabilityScore: 92 },
  { airportCode: 'AMS', city: 'Amsterdam', country: 'Netherlands', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 94, zedCoverageScore: 87, historicalReliabilityScore: 88 },
  { airportCode: 'CDG', city: 'Paris', country: 'France', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 95, zedCoverageScore: 82, historicalReliabilityScore: 84 },
  { airportCode: 'MAD', city: 'Madrid', country: 'Spain', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 83, zedCoverageScore: 76, historicalReliabilityScore: 82 },
  { airportCode: 'LHR', city: 'London', country: 'United Kingdom', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 96, zedCoverageScore: 72, historicalReliabilityScore: 80 },
  { airportCode: 'VIE', city: 'Vienna', country: 'Austria', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 79, zedCoverageScore: 82, historicalReliabilityScore: 86 },
  { airportCode: 'BRU', city: 'Brussels', country: 'Belgium', region: 'Europe', score: 0, reasons: [], onwardConnectivityScore: 74, zedCoverageScore: 74, historicalReliabilityScore: 80 },
  { airportCode: 'HND', city: 'Tokyo', country: 'Japan', region: 'Asia', score: 0, reasons: [], onwardConnectivityScore: 91, zedCoverageScore: 84, historicalReliabilityScore: 93 },
  { airportCode: 'NRT', city: 'Tokyo', country: 'Japan', region: 'Asia', score: 0, reasons: [], onwardConnectivityScore: 89, zedCoverageScore: 88, historicalReliabilityScore: 89 },
  { airportCode: 'ICN', city: 'Seoul', country: 'South Korea', region: 'Asia', score: 0, reasons: [], onwardConnectivityScore: 95, zedCoverageScore: 86, historicalReliabilityScore: 92 },
  { airportCode: 'TPE', city: 'Taipei', country: 'Taiwan', region: 'Asia', score: 0, reasons: [], onwardConnectivityScore: 84, zedCoverageScore: 80, historicalReliabilityScore: 88 },
  { airportCode: 'SIN', city: 'Singapore', country: 'Singapore', region: 'Asia', score: 0, reasons: [], onwardConnectivityScore: 96, zedCoverageScore: 82, historicalReliabilityScore: 94 },
  { airportCode: 'HKG', city: 'Hong Kong', country: 'Hong Kong', region: 'Asia', score: 0, reasons: [], onwardConnectivityScore: 90, zedCoverageScore: 78, historicalReliabilityScore: 86 },
  { airportCode: 'BKK', city: 'Bangkok', country: 'Thailand', region: 'Asia', score: 0, reasons: [], onwardConnectivityScore: 86, zedCoverageScore: 76, historicalReliabilityScore: 82 },
  { airportCode: 'SYD', city: 'Sydney', country: 'Australia', region: 'South Pacific', score: 0, reasons: [], onwardConnectivityScore: 88, zedCoverageScore: 76, historicalReliabilityScore: 87 },
  { airportCode: 'AKL', city: 'Auckland', country: 'New Zealand', region: 'South Pacific', score: 0, reasons: [], onwardConnectivityScore: 76, zedCoverageScore: 72, historicalReliabilityScore: 84 }
]

function normalizeAirportCode(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim()) ? value.trim().toUpperCase() : ''
}

function normalizeRegion(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!text) return undefined
  if (text === 'japan') return 'Japan'
  if (text === 'south pacific' || text === 'pacific' || text === 'oceania') return 'South Pacific'
  return ['europe', 'asia', 'caribbean'].includes(text) ? text[0].toUpperCase() + text.slice(1) : undefined
}

function cloneCandidate(candidate: GatewayCandidate): GatewayCandidate {
  return {
    ...candidate,
    reasons: [...candidate.reasons]
  }
}

function normalizedScore(candidate: GatewayCandidate) {
  const weighted =
    candidate.historicalReliabilityScore * SCORE_WEIGHTS.historicalReliabilityScore +
    candidate.onwardConnectivityScore * SCORE_WEIGHTS.onwardConnectivityScore +
    candidate.zedCoverageScore * SCORE_WEIGHTS.zedCoverageScore
  return Math.max(0, Math.min(100, Math.round(weighted)))
}

function recommendationReasons(candidate: GatewayCandidate) {
  const reasons: string[] = []
  if (candidate.onwardConnectivityScore >= 90) reasons.push('Excellent onward connectivity')
  if (candidate.zedCoverageScore >= 85) reasons.push('Strong ZED coverage')
  if (candidate.onwardConnectivityScore >= 88 && candidate.historicalReliabilityScore >= 86) reasons.push('Large international hub')
  if (candidate.zedCoverageScore >= 80 && candidate.onwardConnectivityScore >= 84) reasons.push('Multiple alliance options')
  if (candidate.historicalReliabilityScore >= 90) reasons.push('High historical reliability')
  return reasons.length ? reasons : ['Balanced gateway profile']
}

function dedupeGateways(candidates: GatewayCandidate[]) {
  const bestByAirport = new Map<string, GatewayCandidate>()
  for (const candidate of candidates) {
    const code = normalizeAirportCode(candidate.airportCode)
    if (!code) continue
    const normalized = { ...cloneCandidate(candidate), airportCode: code }
    const existing = bestByAirport.get(code)
    if (!existing || normalizedScore(normalized) > normalizedScore(existing)) bestByAirport.set(code, normalized)
  }
  return [...bestByAirport.values()]
}

function sortGateways(a: GatewayCandidate, b: GatewayCandidate) {
  return b.score - a.score ||
    b.historicalReliabilityScore - a.historicalReliabilityScore ||
    b.onwardConnectivityScore - a.onwardConnectivityScore ||
    b.zedCoverageScore - a.zedCoverageScore ||
    a.airportCode.localeCompare(b.airportCode)
}

function japanPreferredSort(a: GatewayCandidate, b: GatewayCandidate) {
  const preferred = new Map([
    ['HND', 2],
    ['NRT', 1]
  ])
  return (preferred.get(b.airportCode) || 0) - (preferred.get(a.airportCode) || 0) || sortGateways(a, b)
}

function missionRegion(mission: TripMission) {
  return normalizeRegion(mission.destinationRegion)
}

function departureAirportsForMission(mission: TripMission) {
  const normalized = normalizeTripMission(mission)
  const preferred = normalized.preferredDepartureAirports.length
    ? normalized.preferredDepartureAirports
    : normalized.originAirports
  return mission.flexibleGateway ? normalized.originAirports : preferred
}

export function filterGatewaysByRegion(region?: string, candidates: GatewayCandidate[] = gatewayCatalog) {
  const normalizedRegion = normalizeRegion(region)
  const scoped = dedupeGateways(candidates)
  if (!normalizedRegion) return scoped.map(cloneCandidate)
  if (normalizedRegion === 'Japan') {
    return scoped.filter((candidate) => ['HND', 'NRT'].includes(candidate.airportCode)).map(cloneCandidate)
  }
  return scoped.filter((candidate) => candidate.region === normalizedRegion).map(cloneCandidate)
}

export function rankGateways(candidates: GatewayCandidate[], options: { destinationRegion?: string } = {}) {
  const normalizedRegion = normalizeRegion(options.destinationRegion)
  const ranked = dedupeGateways(candidates).map((candidate) => ({
    ...candidate,
    score: normalizedScore(candidate),
    reasons: recommendationReasons(candidate)
  }))
  return ranked.sort(normalizedRegion === 'Japan' ? japanPreferredSort : sortGateways)
}

export function discoverGateways(mission: TripMission) {
  const normalized = normalizeTripMission(mission)
  const region = missionRegion(mission) || normalized.destinationRegion
  if (!region) return []

  const candidates = filterGatewaysByRegion(region)
  const ranked = rankGateways(candidates, { destinationRegion: region })
  const departureAirports = departureAirportsForMission(mission)
  if (normalized.flexibleGateway || !departureAirports.length) return ranked
  return ranked.map((candidate) => ({
    ...candidate,
    reasons: [...candidate.reasons, 'Respects preferred departure airports']
  }))
}

export function gatewayAssumptions(mission: TripMission, candidates: GatewayCandidate[] = discoverGateways(mission)) {
  const normalized = normalizeTripMission(mission)
  const region = missionRegion(mission) || normalized.destinationRegion || 'not set'
  const departureAirports = departureAirportsForMission(mission)
  return [
    `Destination region: ${region}`,
    `Gateway flexibility: ${normalized.flexibleGateway ? 'flexible' : 'preferred departure airports respected'}`,
    `Preferred departure airports: ${departureAirports.join(', ') || 'not set'}`,
    `Evaluated gateways: ${candidates.length}`,
    'Scoring weights: historical reliability 40%, onward connectivity 35%, ZED coverage 25%'
  ]
}
