// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { InMemoryWeatherCacheStore, type WeatherCacheStore, type WeatherFreshnessPolicy } from './weatherCache.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { refreshRouteWeatherCacheServerSide, type RouteWeatherCacheRefreshResult } from './weatherCacheServer.ts'

export type WeatherPrefetchFlagStatus = 'enabled' | 'disabled'
export type WeatherPrefetchStatus = 'disabled' | 'skipped' | 'fresh' | 'prefetched' | 'failed'
export type WeatherPrefetchSource = 'api-internal' | 'server-action'

export type WeatherPrefetchRequest = {
  route?: string
  airportCodes?: string[]
  source?: WeatherPrefetchSource
}

export type WeatherPrefetchOptions = WeatherPrefetchRequest & {
  store?: WeatherCacheStore
  env?: Record<string, string | undefined>
  now?: Date
  timeoutMs?: number
  fetchImpl?: typeof fetch
  policy?: WeatherFreshnessPolicy
}

export type WeatherPrefetchResult = {
  status: WeatherPrefetchStatus
  serverOnly: true
  internalOnly: true
  advisoryOnly: true
  appliesToScoring: false
  unknownWeatherNeutral: true
  featureFlag: WeatherPrefetchFlagStatus
  source: WeatherPrefetchSource
  refresh: RouteWeatherCacheRefreshResult | null
  liveCallsAttempted: boolean
  cacheUpdated: boolean
  diagnostics: string[]
  limitations: string[]
}

const prefetchFlagName = 'NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED'

const prefetchLimitations = [
  'Internal weather prefetch is server-only and advisory-only.',
  'Unavailable, disabled, stale, or failed weather prefetch data remains neutral for itinerary scoring and ranking.',
  'Weather prefetch data never confirms standby availability, clearance probability, airline load factors, sellable seat inventory, delay, or cancellation.'
]

export const internalWeatherPrefetchStore = new InMemoryWeatherCacheStore()

function normalizeAirportCode(value: string) {
  return String(value || '').trim().toUpperCase().match(/^[A-Z]{3,4}$/)?.[0] || ''
}

function normalizeAirportCodes(values: string[] | undefined) {
  return (values || []).map(normalizeAirportCode).filter(Boolean)
}

function hasPrefetchTarget(input: WeatherPrefetchOptions) {
  return Boolean(input.route?.trim() || normalizeAirportCodes(input.airportCodes).length)
}

function sourceFromInput(source: WeatherPrefetchSource | undefined): WeatherPrefetchSource {
  return source === 'server-action' ? 'server-action' : 'api-internal'
}

function result(input: {
  status: WeatherPrefetchStatus
  featureFlag: WeatherPrefetchFlagStatus
  source: WeatherPrefetchSource
  refresh?: RouteWeatherCacheRefreshResult | null
  liveCallsAttempted?: boolean
  cacheUpdated?: boolean
  diagnostics: string[]
}): WeatherPrefetchResult {
  return {
    status: input.status,
    serverOnly: true,
    internalOnly: true,
    advisoryOnly: true,
    appliesToScoring: false,
    unknownWeatherNeutral: true,
    featureFlag: input.featureFlag,
    source: input.source,
    refresh: input.refresh || null,
    liveCallsAttempted: input.liveCallsAttempted || false,
    cacheUpdated: input.cacheUpdated || false,
    diagnostics: input.diagnostics,
    limitations: prefetchLimitations
  }
}

function statusFromRefresh(refresh: RouteWeatherCacheRefreshResult): WeatherPrefetchStatus {
  if (refresh.status === 'refreshed') return 'prefetched'
  if (refresh.status === 'fresh') return 'fresh'
  if (refresh.status === 'disabled') return 'disabled'
  if (refresh.status === 'skipped') return 'skipped'
  return 'failed'
}

export function getInternalWeatherPrefetchFlag(env: Record<string, string | undefined> = process.env): WeatherPrefetchFlagStatus {
  return env[prefetchFlagName]?.trim().toLowerCase() === 'true' ? 'enabled' : 'disabled'
}

export function isInternalWeatherPrefetchEnabled(env: Record<string, string | undefined> = process.env) {
  return getInternalWeatherPrefetchFlag(env) === 'enabled'
}

export async function prefetchRouteWeatherInternal(input: WeatherPrefetchOptions): Promise<WeatherPrefetchResult> {
  const env = input.env || process.env
  const featureFlag = getInternalWeatherPrefetchFlag(env)
  const source = sourceFromInput(input.source)

  if (featureFlag === 'disabled') {
    return result({
      status: 'disabled',
      featureFlag,
      source,
      diagnostics: [`${prefetchFlagName} is disabled; internal weather prefetch skipped without a provider request.`]
    })
  }

  if (typeof window !== 'undefined') {
    return result({
      status: 'skipped',
      featureFlag,
      source,
      diagnostics: ['Skipped internal weather prefetch outside the server runtime; no client-side provider request was attempted.']
    })
  }

  if (!hasPrefetchTarget(input)) {
    return result({
      status: 'skipped',
      featureFlag,
      source,
      diagnostics: ['No route or airport codes were supplied for internal weather prefetch; unknown weather remains neutral.']
    })
  }

  const airportCodes = normalizeAirportCodes(input.airportCodes)
  const refresh = await refreshRouteWeatherCacheServerSide({
    store: input.store || internalWeatherPrefetchStore,
    route: input.route,
    airportCodes: airportCodes.length ? airportCodes : undefined,
    env,
    now: input.now,
    timeoutMs: input.timeoutMs,
    fetchImpl: input.fetchImpl,
    policy: input.policy
  })

  return result({
    status: statusFromRefresh(refresh),
    featureFlag,
    source,
    refresh,
    liveCallsAttempted: refresh.liveCallsAttempted,
    cacheUpdated: refresh.cacheUpdated,
    diagnostics: [
      refresh.status === 'refreshed'
        ? 'Internal server-side weather prefetch refreshed advisory cache data.'
        : 'Internal server-side weather prefetch did not add scoring input; weather remains advisory/neutral unless fresh cache is explicitly read elsewhere.',
      ...refresh.diagnostics
    ]
  })
}
