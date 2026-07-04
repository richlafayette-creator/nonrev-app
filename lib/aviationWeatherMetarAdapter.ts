import type { AirportWeatherSignal, WeatherConfidence, WeatherRiskLevel } from './weatherIntelligence'

export type AviationWeatherMetarFetchOptions = {
  /** Explicit opt-in gate so importing this adapter never triggers live calls. */
  liveCallsEnabled?: boolean
  timeoutMs?: number
  fetchImpl?: typeof fetch
  now?: Date
}

export type AviationWeatherMetarFetchResult = {
  provider: 'AviationWeather.gov / METAR / TAF'
  advisoryOnly: true
  liveCallsAttempted: boolean
  fetchedAt: string
  airports: AirportWeatherSignal[]
  diagnostics: string[]
  limitations: string[]
}

type AviationWeatherMetarRecord = {
  icaoId?: unknown
  obsTime?: unknown
  rawOb?: unknown
  flightCategory?: unknown
  wxString?: unknown
  wspd?: unknown
  wgst?: unknown
  visib?: unknown
  ceil?: unknown
}

const aviationWeatherProvider = 'AviationWeather.gov / METAR / TAF' as const
const aviationWeatherMetarEndpoint = 'https://aviationweather.gov/api/data/metar'
const defaultTimeoutMs = 4500

const iataToIcao: Record<string, string> = {
  ATL: 'KATL',
  BOS: 'KBOS',
  DEN: 'KDEN',
  DFW: 'KDFW',
  EWR: 'KEWR',
  HNL: 'PHNL',
  JFK: 'KJFK',
  LAX: 'KLAX',
  LGA: 'KLGA',
  OGG: 'PHOG',
  ORD: 'KORD',
  SBP: 'KSBP',
  SEA: 'KSEA',
  SFO: 'KSFO'
}

const icaoToIata = Object.fromEntries(Object.entries(iataToIcao).map(([iata, icao]) => [icao, iata]))

function unique(values: string[]) {
  return [...new Set(values)]
}

function normalizeAirportCode(value: string) {
  return String(value || '').trim().toUpperCase().match(/^[A-Z]{3,4}$/)?.[0] || ''
}

export function aviationWeatherStationForAirport(airportCode: string) {
  const normalized = normalizeAirportCode(airportCode)
  if (!normalized) return ''
  if (normalized.length === 4) return normalized
  return iataToIcao[normalized] || ''
}

function stationToAirportCode(station: string) {
  const normalized = normalizeAirportCode(station)
  if (!normalized) return ''
  return icaoToIata[normalized] || normalized
}

function numberFromMetarValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace('+', ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function stringFromMetarValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function riskFromFlightCategory(category: string): WeatherRiskLevel {
  const normalized = category.toUpperCase()
  if (normalized === 'LIFR' || normalized === 'IFR') return 'risky'
  if (normalized === 'MVFR') return 'watch'
  if (normalized === 'VFR') return 'clear'
  return 'unknown'
}

function maxRisk(a: WeatherRiskLevel, b: WeatherRiskLevel): WeatherRiskLevel {
  const severity = { unknown: 0, clear: 1, watch: 2, risky: 3 } satisfies Record<WeatherRiskLevel, number>
  return severity[b] > severity[a] ? b : a
}

function riskFromObservedValues(record: AviationWeatherMetarRecord): {
  delayRisk: WeatherRiskLevel
  cancellationRisk: WeatherRiskLevel
  thunderstormRisk: WeatherRiskLevel
  snowIceRisk: WeatherRiskLevel
  fogRisk: WeatherRiskLevel
} {
  const raw = `${stringFromMetarValue(record.rawOb)} ${stringFromMetarValue(record.wxString)}`.toUpperCase()
  const categoryRisk = riskFromFlightCategory(stringFromMetarValue(record.flightCategory))
  const windGusts = numberFromMetarValue(record.wgst)
  const visibility = numberFromMetarValue(record.visib)
  const ceiling = numberFromMetarValue(record.ceil)

  let delayRisk: WeatherRiskLevel = categoryRisk === 'unknown' ? 'clear' : categoryRisk
  if (windGusts !== null && windGusts >= 35) delayRisk = maxRisk(delayRisk, 'risky')
  else if (windGusts !== null && windGusts >= 25) delayRisk = maxRisk(delayRisk, 'watch')
  if (visibility !== null && visibility < 3) delayRisk = maxRisk(delayRisk, 'risky')
  else if (visibility !== null && visibility < 6) delayRisk = maxRisk(delayRisk, 'watch')
  if (ceiling !== null && ceiling < 800) delayRisk = maxRisk(delayRisk, 'risky')
  else if (ceiling !== null && ceiling < 1800) delayRisk = maxRisk(delayRisk, 'watch')

  const thunderstormRisk: WeatherRiskLevel = /\bTS|VCTS|\+TS/.test(raw) ? 'risky' : 'clear'
  const snowIceRisk: WeatherRiskLevel = /\bSN|FZ|PL|ICE/.test(raw) ? 'watch' : 'clear'
  const fogRisk: WeatherRiskLevel = /\bFG|BR\b/.test(raw) || (visibility !== null && visibility < 6) ? maxRisk('watch', delayRisk) : 'clear'
  const cancellationRisk: WeatherRiskLevel = delayRisk === 'risky' && (thunderstormRisk === 'risky' || snowIceRisk === 'watch') ? 'watch' : 'clear'

  return { delayRisk, cancellationRisk, thunderstormRisk, snowIceRisk, fogRisk }
}

function confidenceFromObservationTime(obsTime: string, now: Date): WeatherConfidence {
  const observedMs = Date.parse(obsTime)
  if (!Number.isFinite(observedMs)) return 'medium'
  const ageMinutes = Math.max(0, Math.round((now.getTime() - observedMs) / 60000))
  if (ageMinutes <= 90) return 'high'
  if (ageMinutes <= 180) return 'medium'
  return 'low'
}

export function airportWeatherSignalFromAviationWeatherMetar(record: AviationWeatherMetarRecord, now = new Date()): AirportWeatherSignal {
  const station = stringFromMetarValue(record.icaoId)
  const airportCode = stationToAirportCode(station)
  const observedAt = stringFromMetarValue(record.obsTime) || null
  const rawObservation = stringFromMetarValue(record.rawOb)
  const weatherString = stringFromMetarValue(record.wxString)
  const flightCategory = stringFromMetarValue(record.flightCategory)
  const risks = riskFromObservedValues(record)

  return {
    airportCode,
    observedAt,
    forecastTime: null,
    condition: rawObservation || weatherString || flightCategory || 'METAR observation available',
    windSpeed: numberFromMetarValue(record.wspd),
    windGusts: numberFromMetarValue(record.wgst),
    visibility: numberFromMetarValue(record.visib),
    ceiling: numberFromMetarValue(record.ceil),
    precipitation: null,
    thunderstormRisk: risks.thunderstormRisk,
    snowIceRisk: risks.snowIceRisk,
    fogRisk: risks.fogRisk,
    delayRisk: risks.delayRisk,
    cancellationRisk: risks.cancellationRisk,
    confidence: observedAt ? confidenceFromObservationTime(observedAt, now) : 'medium',
    source: aviationWeatherProvider,
    limitations: [
      'Live METAR observations are advisory and do not guarantee delay, cancellation, or on-time operation.',
      'METAR data does not provide standby list position, airline load factors, or sellable seat availability.'
    ]
  }
}

async function readJsonSafely(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function failureDiagnostics(status: number) {
  if (status === 204) return 'AviationWeather.gov returned no recent METAR data for the requested stations.'
  if (status === 429) return 'AviationWeather.gov rate limit reached; skipped live weather safely.'
  if (status >= 500) return `AviationWeather.gov service unavailable (${status}); skipped live weather safely.`
  return `AviationWeather.gov returned HTTP ${status}; skipped live weather safely.`
}

export async function fetchAviationWeatherMetarSignals(airportCodes: string[], options: AviationWeatherMetarFetchOptions = {}): Promise<AviationWeatherMetarFetchResult> {
  const now = options.now || new Date()
  const baseResult = {
    provider: aviationWeatherProvider,
    advisoryOnly: true as const,
    fetchedAt: now.toISOString(),
    airports: [] as AirportWeatherSignal[],
    limitations: [
      'Live aviation weather is advisory only and must not be treated as confirmed operational disruption.',
      'Weather data never confirms standby availability, clearance probability, or sellable seat inventory.'
    ]
  }

  if (!options.liveCallsEnabled) {
    return {
      ...baseResult,
      liveCallsAttempted: false,
      diagnostics: ['AviationWeather.gov METAR adapter is available but live calls are disabled by default.']
    }
  }

  const stations = unique(airportCodes.map(aviationWeatherStationForAirport).filter(Boolean))
  if (!stations.length) {
    return {
      ...baseResult,
      liveCallsAttempted: false,
      diagnostics: ['No supported ICAO weather stations were resolved for the requested airports.']
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || defaultTimeoutMs)
  const url = new URL(aviationWeatherMetarEndpoint)
  url.searchParams.set('ids', stations.join(','))
  url.searchParams.set('format', 'json')
  url.searchParams.set('hours', '2')

  try {
    const response = await (options.fetchImpl || fetch)(url.toString(), {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'Nonrevy weather-adapter advisory beta' }
    })
    if (!response.ok) {
      return { ...baseResult, liveCallsAttempted: true, diagnostics: [failureDiagnostics(response.status)] }
    }
    const json = await readJsonSafely(response)
    const records = Array.isArray(json) ? json : []
    const airports = records
      .map((record) => airportWeatherSignalFromAviationWeatherMetar(record as AviationWeatherMetarRecord, now))
      .filter((signal) => Boolean(signal.airportCode))

    return {
      ...baseResult,
      liveCallsAttempted: true,
      airports,
      diagnostics: [
        `Requested AviationWeather.gov METAR stations: ${stations.join(', ')}.`,
        airports.length ? `Received ${airports.length} advisory METAR observation${airports.length === 1 ? '' : 's'}.` : 'No parseable advisory METAR observations were returned.'
      ]
    }
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'AviationWeather.gov METAR request timed out; skipped live weather safely.'
      : 'AviationWeather.gov METAR request failed; skipped live weather safely.'
    return { ...baseResult, liveCallsAttempted: true, diagnostics: [message] }
  } finally {
    clearTimeout(timeout)
  }
}
