// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type WeatherCacheStore, type WeatherFreshnessPolicy } from './weatherCache.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { refreshRouteWeatherCacheServerSide, type RouteWeatherCacheRefreshResult } from './weatherCacheServer.ts'
import { internalWeatherPrefetchStore } from './weatherCacheStore'

export type WeatherRefreshSchedulerFlagStatus = 'enabled' | 'disabled'
export type WeatherRefreshSchedulerStatus = 'disabled' | 'skipped' | 'completed'

export type WeatherRefreshSchedulerTarget = {
  route?: string
  airportCodes?: string[]
}

export type WeatherRefreshSchedulerOptions = {
  targets: WeatherRefreshSchedulerTarget[]
  store?: WeatherCacheStore
  env?: Record<string, string | undefined>
  now?: Date
  timeoutMs?: number
  fetchImpl?: typeof fetch
  policy?: WeatherFreshnessPolicy
}

export type WeatherRefreshSchedulerResult = {
  status: WeatherRefreshSchedulerStatus
  serverOnly: true
  advisoryOnly: true
  appliesToScoring: false
  unknownWeatherNeutral: true
  featureFlag: WeatherRefreshSchedulerFlagStatus
  refreshes: RouteWeatherCacheRefreshResult[]
  liveCallsAttempted: boolean
  cacheUpdated: boolean
  diagnostics: string[]
  limitations: string[]
}

const schedulerFlagName = 'NONREV_SERVER_WEATHER_REFRESH_SCHEDULER_ENABLED'

const schedulerLimitations = [
  'Server-side weather refresh scheduling is advisory-only and must not change itinerary ranking or standby scoring.',
  'Missing, unavailable, stale, expired, disabled, or failed weather remains neutral.',
  'Weather refresh scheduling never confirms standby availability, clearance probability, airline load factors, sellable seat inventory, delay, or cancellation.'
]

function normalizeAirportCode(value: string) {
  return String(value || '').trim().toUpperCase().match(/^[A-Z]{3,4}$/)?.[0] || ''
}

function normalizeTarget(target: WeatherRefreshSchedulerTarget): WeatherRefreshSchedulerTarget | null {
  const airportCodes = (target.airportCodes || []).map(normalizeAirportCode).filter(Boolean)
  const route = target.route?.trim()
  if (!route && !airportCodes.length) return null
  return {
    route: route || undefined,
    airportCodes: airportCodes.length ? airportCodes : undefined
  }
}

function result(input: {
  status: WeatherRefreshSchedulerStatus
  featureFlag: WeatherRefreshSchedulerFlagStatus
  refreshes?: RouteWeatherCacheRefreshResult[]
  diagnostics: string[]
}): WeatherRefreshSchedulerResult {
  const refreshes = input.refreshes || []
  return {
    status: input.status,
    serverOnly: true,
    advisoryOnly: true,
    appliesToScoring: false,
    unknownWeatherNeutral: true,
    featureFlag: input.featureFlag,
    refreshes,
    liveCallsAttempted: refreshes.some((refresh) => refresh.liveCallsAttempted),
    cacheUpdated: refreshes.some((refresh) => refresh.cacheUpdated),
    diagnostics: input.diagnostics,
    limitations: schedulerLimitations
  }
}

export function getServerWeatherRefreshSchedulerFlag(env: Record<string, string | undefined> = process.env): WeatherRefreshSchedulerFlagStatus {
  return env[schedulerFlagName]?.trim().toLowerCase() === 'true' ? 'enabled' : 'disabled'
}

export function isServerWeatherRefreshSchedulerEnabled(env: Record<string, string | undefined> = process.env) {
  return getServerWeatherRefreshSchedulerFlag(env) === 'enabled'
}

export async function runServerWeatherRefreshScheduler(input: WeatherRefreshSchedulerOptions): Promise<WeatherRefreshSchedulerResult> {
  const env = input.env || process.env
  const featureFlag = getServerWeatherRefreshSchedulerFlag(env)

  if (featureFlag === 'disabled') {
    return result({
      status: 'disabled',
      featureFlag,
      diagnostics: [`${schedulerFlagName} is disabled; scheduled weather refresh skipped without a provider request.`]
    })
  }

  if (typeof window !== 'undefined') {
    return result({
      status: 'skipped',
      featureFlag,
      diagnostics: ['Skipped scheduled weather refresh outside the server runtime; no client-side AviationWeather.gov request was attempted.']
    })
  }

  const targets = input.targets.map(normalizeTarget).filter((target): target is WeatherRefreshSchedulerTarget => Boolean(target))
  if (!targets.length) {
    return result({
      status: 'skipped',
      featureFlag,
      diagnostics: ['No weather refresh scheduler targets were supplied; unknown weather remains neutral.']
    })
  }

  const store = input.store || internalWeatherPrefetchStore
  const refreshes: RouteWeatherCacheRefreshResult[] = []
  for (const target of targets) {
    refreshes.push(await refreshRouteWeatherCacheServerSide({
      store,
      route: target.route,
      airportCodes: target.airportCodes,
      env,
      now: input.now,
      timeoutMs: input.timeoutMs,
      fetchImpl: input.fetchImpl,
      policy: input.policy
    }))
  }

  return result({
    status: 'completed',
    featureFlag,
    refreshes,
    diagnostics: [
      `Scheduled weather refresh evaluated ${targets.length} route target${targets.length === 1 ? '' : 's'} using the server cache refresh path.`,
      ...refreshes.flatMap((refresh) => refresh.diagnostics)
    ]
  })
}
