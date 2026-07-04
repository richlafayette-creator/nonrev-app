// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { fetchAviationWeatherMetarSignals } from './aviationWeatherMetarAdapter.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createWeatherCacheEntry, getWeatherFreshnessPolicy, weatherCacheKeyForAirports, weatherCacheKeyForRoute, type WeatherCacheEntry, type WeatherCacheStore, type WeatherFreshnessPolicy } from './weatherCache.ts'

export type WeatherCachePopulationFlagStatus = 'enabled' | 'disabled'
export type WeatherCachePopulationStatus = 'disabled' | 'skipped' | 'populated' | 'failed'

export type AviationWeatherCachePopulationResult = {
  status: WeatherCachePopulationStatus
  provider: 'AviationWeather.gov / METAR / TAF'
  serverOnly: true
  advisoryOnly: true
  liveCallsAttempted: boolean
  cacheUpdated: boolean
  key: string
  entry: WeatherCacheEntry | null
  diagnostics: string[]
  limitations: string[]
}

export type PopulateAviationWeatherCacheOptions = {
  store: WeatherCacheStore
  airportCodes?: string[]
  route?: string
  env?: Record<string, string | undefined>
  now?: Date
  timeoutMs?: number
  fetchImpl?: typeof fetch
  policy?: WeatherFreshnessPolicy
}

const aviationWeatherProvider = 'AviationWeather.gov / METAR / TAF' as const
const populationFlagName = 'NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED'

const populationLimitations = [
  'Server-populated aviation weather cache data is advisory only and must not be treated as confirmed operational disruption.',
  'Unavailable, failed, unsupported, missing, stale, or expired weather cache data must remain neutral for itinerary scoring and ranking.',
  'Aviation weather cache data never confirms standby availability, clearance probability, airline load factors, or sellable seat inventory.'
]

function normalizeAirportCode(value: string) {
  return String(value || '').trim().toUpperCase().match(/^[A-Z]{3,4}$/)?.[0] || ''
}

function airportCodesFromRoute(route: string) {
  return String(route || '').toUpperCase().match(/\b[A-Z]{3}\b/g) || []
}

function requestedAirportCodes(input: PopulateAviationWeatherCacheOptions) {
  const source = input.airportCodes?.length ? input.airportCodes : airportCodesFromRoute(input.route || '')
  return source.map(normalizeAirportCode).filter(Boolean)
}

function baseResult(input: {
  status: WeatherCachePopulationStatus
  key: string
  liveCallsAttempted?: boolean
  cacheUpdated?: boolean
  entry?: WeatherCacheEntry | null
  diagnostics: string[]
}): AviationWeatherCachePopulationResult {
  return {
    status: input.status,
    provider: aviationWeatherProvider,
    serverOnly: true,
    advisoryOnly: true,
    liveCallsAttempted: input.liveCallsAttempted || false,
    cacheUpdated: input.cacheUpdated || false,
    key: input.key,
    entry: input.entry || null,
    diagnostics: input.diagnostics,
    limitations: populationLimitations
  }
}

export function getAviationWeatherCachePopulationFlag(env: Record<string, string | undefined> = process.env): WeatherCachePopulationFlagStatus {
  return env[populationFlagName]?.trim().toLowerCase() === 'true' ? 'enabled' : 'disabled'
}

export function isAviationWeatherCachePopulationEnabled(env: Record<string, string | undefined> = process.env) {
  return getAviationWeatherCachePopulationFlag(env) === 'enabled'
}

export async function populateWeatherCacheFromAviationWeather(input: PopulateAviationWeatherCacheOptions): Promise<AviationWeatherCachePopulationResult> {
  const env = input.env || process.env
  const airports = requestedAirportCodes(input)
  const key = input.airportCodes ? weatherCacheKeyForAirports(airports) : weatherCacheKeyForRoute(input.route || '')

  if (typeof window !== 'undefined') {
    return baseResult({
      status: 'skipped',
      key,
      diagnostics: ['Skipped AviationWeather.gov cache population outside the server runtime; no client-side weather request was attempted.']
    })
  }

  if (!isAviationWeatherCachePopulationEnabled(env)) {
    return baseResult({
      status: 'disabled',
      key,
      diagnostics: [`${populationFlagName} is disabled; AviationWeather.gov cache population was skipped without a live request.`]
    })
  }

  if (!airports.length) {
    return baseResult({
      status: 'skipped',
      key,
      diagnostics: ['No airport codes were available for AviationWeather.gov cache population; unknown weather remains neutral.']
    })
  }

  const now = input.now || new Date()
  const policy = input.policy || getWeatherFreshnessPolicy(env)
  const metarResult = await fetchAviationWeatherMetarSignals(airports, {
    liveCallsEnabled: true,
    timeoutMs: input.timeoutMs,
    fetchImpl: input.fetchImpl,
    now
  })

  if (!metarResult.airports.length) {
    return baseResult({
      status: metarResult.liveCallsAttempted ? 'failed' : 'skipped',
      key,
      liveCallsAttempted: metarResult.liveCallsAttempted,
      diagnostics: [
        'AviationWeather.gov returned no cacheable advisory METAR signals; existing cache was left unchanged and unknown weather remains neutral.',
        ...metarResult.diagnostics
      ]
    })
  }

  const entry = createWeatherCacheEntry({
    key,
    provider: metarResult.provider,
    airportCodes: airports,
    signals: metarResult.airports,
    fetchedAt: now,
    policy,
    diagnostics: metarResult.diagnostics,
    limitations: metarResult.limitations
  })
  input.store.set(entry)

  return baseResult({
    status: 'populated',
    key,
    liveCallsAttempted: metarResult.liveCallsAttempted,
    cacheUpdated: true,
    entry,
    diagnostics: [
      `Populated server-side weather cache with ${metarResult.airports.length} advisory AviationWeather.gov METAR signal${metarResult.airports.length === 1 ? '' : 's'}.`,
      ...metarResult.diagnostics
    ]
  })
}
