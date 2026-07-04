import { airportCodesFromRoute } from './airportMapScaffold'
import { getWeatherSourceReadiness, weatherIntelligenceFutureDataSources, type WeatherProvider, type WeatherSourceReadiness } from './weatherSourceReadiness'

export type WeatherRiskLevel = 'clear' | 'watch' | 'risky' | 'unknown'
export type WeatherRiskCategory = 'Low' | 'Moderate' | 'High' | 'Severe'
export type WeatherRiskStatus = 'placeholder' | 'live-unavailable'
export type WeatherConfidence = 'low' | 'medium' | 'high' | 'unknown'
export type AirportWeatherSignal = {
  airportCode: string
  observedAt: string | null
  forecastTime: string | null
  condition: string
  windSpeed: number | null
  windGusts: number | null
  visibility: number | null
  ceiling: number | null
  precipitation: number | null
  thunderstormRisk: WeatherRiskLevel
  snowIceRisk: WeatherRiskLevel
  fogRisk: WeatherRiskLevel
  delayRisk: WeatherRiskLevel
  cancellationRisk: WeatherRiskLevel
  confidence: WeatherConfidence
  source: WeatherProvider
  limitations: string[]
}

export type RouteWeatherRisk = {
  level: WeatherRiskLevel
  label: 'Clear' | 'Watch' | 'Risky' | 'Unknown'
  category: WeatherRiskCategory
  scoreAdjustment: number
  scoreImpact: number
  successProbabilityImpact: number
  routeRankingImpact: number
  delayRisk: WeatherRiskLevel
  cancellationRisk: WeatherRiskLevel
  confidence: WeatherConfidence
  highRiskConnectionAirports: string[]
  summary: string
  limitations: string[]
}

export type WeatherIntelligence = {
  route: string
  airports: AirportWeatherSignal[]
  routeRisk: RouteWeatherRisk
  observedAt: string
  source: WeatherProvider
  dataSources: WeatherProvider[]
  futureDataSources: WeatherProvider[]
  sourceReadiness: WeatherSourceReadiness[]
  limitations: string[]
}

/** Backward-compatible weather shape used by existing UI and alerts. */
export type WeatherRisk = {
  category: WeatherRiskCategory
  level: WeatherRiskLevel
  displayLabel: RouteWeatherRisk['label']
  scoreImpact: number
  successProbabilityImpact: number
  routeRankingImpact: number
  source: string
  status: WeatherRiskStatus
  details: string[]
  diagnostics: string[]
  intelligence?: WeatherIntelligence
}

type AirportWeatherSeed = {
  condition: string
  windSpeed?: number
  windGusts?: number
  visibility?: number
  ceiling?: number
  precipitation?: number
  thunderstormRisk?: WeatherRiskLevel
  snowIceRisk?: WeatherRiskLevel
  fogRisk?: WeatherRiskLevel
  delayRisk: WeatherRiskLevel
  cancellationRisk: WeatherRiskLevel
  detail: string
}

const placeholderWeatherProvider: WeatherProvider = 'Placeholder Weather Intelligence'

const airportWeatherSeeds: Record<string, AirportWeatherSeed> = {
  SFO: { condition: 'Marine layer / low ceiling sensitivity', visibility: 6, ceiling: 1400, fogRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'clear', detail: 'SFO placeholder weather sensitivity: marine layer and low ceilings can reduce arrival rates.' },
  JFK: { condition: 'Northeast convective / winter sensitivity', windSpeed: 14, windGusts: 24, thunderstormRisk: 'watch', snowIceRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'watch', detail: 'JFK placeholder weather sensitivity: Northeast convection and winter operations can cascade into banks.' },
  LGA: { condition: 'Flow-control weather sensitivity', windSpeed: 13, windGusts: 22, thunderstormRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'clear', detail: 'LGA placeholder weather sensitivity: short-haul flow programs can tighten recovery options.' },
  EWR: { condition: 'Congestion plus weather sensitivity', windSpeed: 14, windGusts: 25, thunderstormRisk: 'watch', snowIceRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'watch', detail: 'EWR placeholder weather sensitivity: congestion and flow control can compound delay risk.' },
  ORD: { condition: 'Storm / winter operations sensitivity', windSpeed: 16, windGusts: 29, thunderstormRisk: 'watch', snowIceRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'watch', detail: 'ORD placeholder weather sensitivity: storms, winter operations, and banked connections raise variance.' },
  DEN: { condition: 'Thunderstorm / wind / deicing sensitivity', windSpeed: 17, windGusts: 31, thunderstormRisk: 'watch', snowIceRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'clear', detail: 'DEN placeholder weather sensitivity: thunderstorms, wind, or deicing windows can affect turns.' },
  DFW: { condition: 'Storm cell sensitivity', windSpeed: 15, windGusts: 28, thunderstormRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'clear', detail: 'DFW placeholder weather sensitivity: storm cells can create rolling delay programs.' },
  ATL: { condition: 'High-volume storm sensitivity', windSpeed: 11, windGusts: 21, thunderstormRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'clear', detail: 'ATL placeholder weather sensitivity: high-volume banks can amplify late inbound aircraft.' },
  SEA: { condition: 'Rain / low ceiling sensitivity', visibility: 7, ceiling: 1800, precipitation: 0.08, fogRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'clear', detail: 'SEA placeholder weather sensitivity: low ceilings and rain can slow turns.' },
  BOS: { condition: 'Coastal wind / winter sensitivity', windSpeed: 15, windGusts: 27, snowIceRisk: 'watch', fogRisk: 'watch', delayRisk: 'watch', cancellationRisk: 'clear', detail: 'BOS placeholder weather sensitivity: coastal wind, fog, and winter operations can affect banks.' },
  HNL: { condition: 'Generally manageable island weather', windSpeed: 12, windGusts: 20, precipitation: 0.04, delayRisk: 'clear', cancellationRisk: 'clear', detail: 'HNL placeholder weather sensitivity: island operations are usually stable, but backup frequencies matter.' },
  OGG: { condition: 'Generally manageable island weather with limited recovery', windSpeed: 13, windGusts: 22, precipitation: 0.05, delayRisk: 'clear', cancellationRisk: 'clear', detail: 'OGG placeholder weather sensitivity: fewer long-haul frequencies increase recovery exposure more than weather itself.' }
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizeAirport(value?: string) {
  return String(value || '').trim().toUpperCase().match(/\b[A-Z]{3}\b/)?.[0] || ''
}

function riskSeverity(level: WeatherRiskLevel) {
  if (level === 'risky') return 3
  if (level === 'watch') return 2
  if (level === 'clear') return 1
  return 0
}

function maxRiskLevel(levels: WeatherRiskLevel[]): WeatherRiskLevel {
  const max = Math.max(...levels.map(riskSeverity), 0)
  if (max >= 3) return 'risky'
  if (max === 2) return 'watch'
  if (max === 1) return 'clear'
  return 'unknown'
}

export function weatherRiskDisplayLabel(level: WeatherRiskLevel): RouteWeatherRisk['label'] {
  if (level === 'clear') return 'Clear'
  if (level === 'watch') return 'Watch'
  if (level === 'risky') return 'Risky'
  return 'Unknown'
}

export function weatherRiskDisplayWithIcon(level: WeatherRiskLevel) {
  if (level === 'clear') return '🟢 Clear'
  if (level === 'watch') return '🟡 Watch'
  if (level === 'risky') return '🔴 Risky'
  return 'Unknown'
}

export function weatherRiskColor(categoryOrLevel: WeatherRiskCategory | WeatherRiskLevel | RouteWeatherRisk['label']) {
  if (categoryOrLevel === 'Low' || categoryOrLevel === 'clear' || categoryOrLevel === 'Clear') return '#22c55e'
  if (categoryOrLevel === 'Moderate' || categoryOrLevel === 'watch' || categoryOrLevel === 'Watch') return '#facc15'
  if (categoryOrLevel === 'High' || categoryOrLevel === 'risky' || categoryOrLevel === 'Risky') return '#fb7185'
  if (categoryOrLevel === 'Unknown' || categoryOrLevel === 'unknown') return '#94a3b8'
  return '#f87171'
}

export function categoryFromWeatherImpact(scoreImpact: number): WeatherRiskCategory {
  if (scoreImpact >= 30) return 'Severe'
  if (scoreImpact >= 18) return 'High'
  if (scoreImpact >= 7) return 'Moderate'
  return 'Low'
}

function levelFromImpact(scoreImpact: number, hasKnownSignal: boolean): WeatherRiskLevel {
  if (!hasKnownSignal) return 'unknown'
  if (scoreImpact >= 18) return 'risky'
  if (scoreImpact >= 7) return 'watch'
  return 'clear'
}

export function weatherIntelligenceScoreAdjustment(intelligence?: WeatherIntelligence) {
  const level = intelligence?.routeRisk.level || 'unknown'
  if (level === 'clear') return 1.5
  if (level === 'watch') return -1.5
  if (level === 'risky') return -5
  return 0
}

function airportSignalFromSeed(airportCode: string, seed?: AirportWeatherSeed): AirportWeatherSignal {
  const limitations = [
    'Weather intelligence is advisory and does not guarantee delay, cancellation, or on-time operation.',
    'Placeholder architecture only; no live weather provider API is called in this phase.'
  ]
  if (!seed) {
    return {
      airportCode,
      observedAt: null,
      forecastTime: null,
      condition: 'Unknown',
      windSpeed: null,
      windGusts: null,
      visibility: null,
      ceiling: null,
      precipitation: null,
      thunderstormRisk: 'unknown',
      snowIceRisk: 'unknown',
      fogRisk: 'unknown',
      delayRisk: 'unknown',
      cancellationRisk: 'unknown',
      confidence: 'unknown',
      source: 'Unknown',
      limitations
    }
  }

  return {
    airportCode,
    observedAt: null,
    forecastTime: null,
    condition: seed.condition,
    windSpeed: seed.windSpeed ?? null,
    windGusts: seed.windGusts ?? null,
    visibility: seed.visibility ?? null,
    ceiling: seed.ceiling ?? null,
    precipitation: seed.precipitation ?? null,
    thunderstormRisk: seed.thunderstormRisk || 'clear',
    snowIceRisk: seed.snowIceRisk || 'clear',
    fogRisk: seed.fogRisk || 'clear',
    delayRisk: seed.delayRisk,
    cancellationRisk: seed.cancellationRisk,
    confidence: 'low',
    source: placeholderWeatherProvider,
    limitations
  }
}

function routeRiskFromAirportSignals(route: string, airports: AirportWeatherSignal[]): RouteWeatherRisk {
  const knownSignals = airports.filter((airport) => airport.confidence !== 'unknown')
  const watchedSignals = knownSignals.filter((airport) => ['watch', 'risky'].includes(airport.delayRisk) || ['watch', 'risky'].includes(airport.cancellationRisk))
  const rawImpact = knownSignals.reduce((sum, airport) => {
    const delayImpact = { clear: 1, watch: 7, risky: 18, unknown: 0 }[airport.delayRisk]
    const cancellationImpact = { clear: 0, watch: 4, risky: 12, unknown: 0 }[airport.cancellationRisk]
    const ceilingImpact = airport.ceiling !== null && airport.ceiling < 1200 ? 4 : 0
    const windImpact = airport.windGusts !== null && airport.windGusts >= 30 ? 4 : 0
    return sum + delayImpact + cancellationImpact + ceilingImpact + windImpact
  }, 0)
  const scoreImpact = clamp(rawImpact, 0, 40)
  const level = levelFromImpact(scoreImpact, knownSignals.length > 0)
  const category = categoryFromWeatherImpact(scoreImpact)
  const delayRisk = maxRiskLevel(airports.map((airport) => airport.delayRisk))
  const cancellationRisk = maxRiskLevel(airports.map((airport) => airport.cancellationRisk))
  const connectionAirports = airportCodesFromRoute(route).slice(1, -1)
  const highRiskConnectionAirports = connectionAirports.filter((airport) => {
    const signal = airports.find((item) => item.airportCode === airport)
    return signal?.delayRisk === 'risky' || signal?.cancellationRisk === 'risky'
  })
  const label = weatherRiskDisplayLabel(level)

  return {
    level,
    label,
    category,
    scoreAdjustment: weatherIntelligenceScoreAdjustment({ route, airports, routeRisk: { level, label, category, scoreAdjustment: 0, scoreImpact, successProbabilityImpact: 0, routeRankingImpact: 0, delayRisk, cancellationRisk, confidence: 'low', highRiskConnectionAirports, summary: '', limitations: [] }, observedAt: new Date().toISOString(), source: placeholderWeatherProvider, dataSources: [placeholderWeatherProvider], futureDataSources: weatherIntelligenceFutureDataSources, sourceReadiness: getWeatherSourceReadiness(), limitations: [] }),
    scoreImpact,
    successProbabilityImpact: level === 'risky' ? -8 : level === 'watch' ? -3 : level === 'clear' ? 1 : 0,
    routeRankingImpact: level === 'risky' ? -6 : level === 'watch' ? -2 : level === 'clear' ? 1 : 0,
    delayRisk,
    cancellationRisk,
    confidence: knownSignals.length ? 'low' : 'unknown',
    highRiskConnectionAirports,
    summary: level === 'unknown'
      ? 'Weather intelligence unknown; no live provider data is configured.'
      : `Weather: ${label}. Advisory placeholder signal from ${watchedSignals.length} airport weather profile${watchedSignals.length === 1 ? '' : 's'}.`,
    limitations: [
      'Weather signal is advisory only and should not be treated as certain.',
      'No NOAA, NWS, METAR, TAF, airline, or FlightAware weather-alert API is called in this phase.'
    ]
  }
}

export function buildWeatherIntelligenceForRoute(route: string): WeatherIntelligence {
  const airportCodes = airportCodesFromRoute(route)
  const airports = airportCodes.map((airportCode) => airportSignalFromSeed(airportCode, airportWeatherSeeds[airportCode]))
  const observedAt = new Date().toISOString()
  const routeRisk = routeRiskFromAirportSignals(route, airports)
  const knownSources = [...new Set(airports.map((airport) => airport.source).filter((source) => source !== 'Unknown'))]

  return {
    route,
    airports,
    routeRisk,
    observedAt,
    source: knownSources[0] || 'Unknown',
    dataSources: knownSources.length ? knownSources : ['Unknown'],
    futureDataSources: weatherIntelligenceFutureDataSources,
    sourceReadiness: getWeatherSourceReadiness(),
    limitations: [
      'Weather intelligence is optional and advisory.',
      'Unknown weather applies no scoring penalty.',
      'This phase does not modify provider integrations or scrape airline websites.'
    ]
  }
}

export function buildWeatherIntelligenceForItinerary(itinerary: { route: string; dataFreshnessRule?: string; weatherIntelligence?: WeatherIntelligence }): WeatherIntelligence | undefined {
  if (itinerary.weatherIntelligence) return itinerary.weatherIntelligence
  if (!itinerary.route) return undefined
  return buildWeatherIntelligenceForRoute(itinerary.route)
}

export function getRouteWeatherRisk(route: string, intelligence = buildWeatherIntelligenceForRoute(route)): WeatherRisk {
  const unmatchedAirports = intelligence.airports.filter((airport) => airport.confidence === 'unknown').map((airport) => airport.airportCode)
  const matched = intelligence.airports.filter((airport) => airport.confidence !== 'unknown')

  return {
    category: intelligence.routeRisk.category,
    level: intelligence.routeRisk.level,
    displayLabel: intelligence.routeRisk.label,
    scoreImpact: intelligence.routeRisk.scoreImpact,
    successProbabilityImpact: intelligence.routeRisk.successProbabilityImpact,
    routeRankingImpact: intelligence.routeRisk.routeRankingImpact,
    source: intelligence.source,
    status: intelligence.source === 'Unknown' ? 'live-unavailable' : 'placeholder',
    details: matched.length
      ? matched.map((airport) => airportWeatherSeeds[airport.airportCode]?.detail || `${airport.airportCode}: ${airport.condition}`)
      : ['Weather intelligence unknown; no route-specific live weather provider is configured.'],
    diagnostics: [
      'Live weather provider not configured; using optional placeholder weather intelligence where available.',
      matched.length ? `Matched weather profiles: ${matched.map((airport) => airport.airportCode).join(', ')}.` : 'No airport-specific placeholder weather profiles matched this route.',
      unmatchedAirports.length ? `No placeholder weather profile for: ${unmatchedAirports.join(', ')}.` : 'All route airports have placeholder weather profiles.',
      `Future weather providers: ${weatherIntelligenceFutureDataSources.join(', ')}.`,
      'Weather source readiness is adapter-only in this phase; live weather calls remain disabled.'
    ],
    intelligence
  }
}
