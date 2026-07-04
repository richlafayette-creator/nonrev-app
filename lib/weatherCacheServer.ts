// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { fetchAviationWeatherMetarSignals } from './aviationWeatherMetarAdapter.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createWeatherCacheEntry, getWeatherFreshnessPolicy, readRouteWeatherCache, weatherCacheKeyForAirports, weatherCacheKeyForRoute, type WeatherCacheEntry, type WeatherCacheReadResult, type WeatherCacheStore, type WeatherFreshnessPolicy } from './weatherCache.ts'

export type WeatherCachePopulationFlagStatus = 'enabled' | 'disabled'
export type WeatherCacheRefreshFlagStatus = 'enabled' | 'disabled'
export type WeatherCachePopulationStatus = 'disabled' | 'skipped' | 'populated' | 'failed'
export type WeatherCacheRefreshStatus = 'disabled' | 'skipped' | 'fresh' | 'refreshed' | 'failed'

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

export type RefreshRouteWeatherCacheOptions = PopulateAviationWeatherCacheOptions

export type RouteWeatherCacheRefreshResult = {
  status: WeatherCacheRefreshStatus
  serverOnly: true
  advisoryOnly: true
  appliesToScoring: false
  unknownWeatherNeutral: true
  featureFlag: WeatherCacheRefreshFlagStatus
  key: string
  before: WeatherCacheReadResult
  after: WeatherCacheReadResult
  population: AviationWeatherCachePopulationResult | null
  liveCallsAttempted: boolean
  cacheUpdated: boolean
  diagnostics: string[]
  limitations: string[]
}

const aviationWeatherProvider = 'AviationWeather.gov / METAR / TAF' as const
const populationFlagName = 'NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED'
const refreshFlagName = 'NONREV_SERVER_WEATHER_REFRESH_ENABLED'

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

export function getServerWeatherRefreshFlag(env: Record<string, string | undefined> = process.env): WeatherCacheRefreshFlagStatus {
  return env[refreshFlagName]?.trim().toLowerCase() === 'true' ? 'enabled' : 'disabled'
}

export function isServerWeatherRefreshEnabled(env: Record<string, string | undefined> = process.env) {
  return getServerWeatherRefreshFlag(env) === 'enabled'
}

function readWeatherForRefresh(input: RefreshRouteWeatherCacheOptions, policy: WeatherFreshnessPolicy, now: Date) {
  return readRouteWeatherCache({
    store: input.store,
    route: input.route,
    airportCodes: input.airportCodes,
    now,
    policy,
    env: { ...(input.env || process.env), NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' }
  })
}

function refreshResult(input: {
  status: WeatherCacheRefreshStatus
  featureFlag: WeatherCacheRefreshFlagStatus
  before: WeatherCacheReadResult
  after?: WeatherCacheReadResult
  population?: AviationWeatherCachePopulationResult | null
  liveCallsAttempted?: boolean
  cacheUpdated?: boolean
  diagnostics: string[]
}): RouteWeatherCacheRefreshResult {
  const after = input.after || input.before
  return {
    status: input.status,
    serverOnly: true,
    advisoryOnly: true,
    appliesToScoring: false,
    unknownWeatherNeutral: true,
    featureFlag: input.featureFlag,
    key: beforeKey(input.before),
    before: input.before,
    after,
    population: input.population || null,
    liveCallsAttempted: input.liveCallsAttempted || false,
    cacheUpdated: input.cacheUpdated || false,
    diagnostics: input.diagnostics,
    limitations: populationLimitations
  }
}

function beforeKey(before: WeatherCacheReadResult) {
  return before.key
}

export async function refreshRouteWeatherCacheServerSide(input: RefreshRouteWeatherCacheOptions): Promise<RouteWeatherCacheRefreshResult> {
  const env = input.env || process.env
  const now = input.now || new Date()
  const policy = input.policy || getWeatherFreshnessPolicy(env)
  const featureFlag = getServerWeatherRefreshFlag(env)
  const before = readWeatherForRefresh(input, policy, now)

  if (featureFlag === 'disabled') {
    return refreshResult({
      status: 'disabled',
      featureFlag,
      before,
      diagnostics: [`${refreshFlagName} is disabled; server-side weather refresh was skipped without a provider request.`]
    })
  }

  if (typeof window !== 'undefined') {
    return refreshResult({
      status: 'skipped',
      featureFlag,
      before,
      diagnostics: ['Skipped server-side weather refresh outside the server runtime; no client-side provider request was attempted.']
    })
  }

  if (before.status === 'fresh') {
    return refreshResult({
      status: 'fresh',
      featureFlag,
      before,
      diagnostics: ['Cached route weather is already fresh; server-side refresh skipped without a provider request.']
    })
  }

  const population = await populateWeatherCacheFromAviationWeather({ ...input, env, now, policy })
  const after = readWeatherForRefresh(input, policy, now)
  const refreshed = population.status === 'populated' && after.status === 'fresh'

  return refreshResult({
    status: refreshed ? 'refreshed' : population.status === 'skipped' ? 'skipped' : 'failed',
    featureFlag,
    before,
    after,
    population,
    liveCallsAttempted: population.liveCallsAttempted,
    cacheUpdated: population.cacheUpdated,
    diagnostics: [
      refreshed
        ? 'Refreshed stale or unavailable route weather cache server-side with advisory-only data.'
        : 'Server-side weather refresh did not produce fresh cache data; weather remains unknown/neutral for scoring.',
      ...population.diagnostics
    ]
  })
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
