import type { AirportWeatherSignal } from './weatherIntelligence'
import type { WeatherProvider } from './weatherSourceReadiness'

export type RouteLiveWeatherFlagStatus = 'enabled' | 'disabled'
export type WeatherCacheFreshnessStatus = 'fresh' | 'stale' | 'expired' | 'missing' | 'disabled'

export type WeatherFreshnessPolicy = {
  /** Fresh cached observations may be considered for advisory route weather only within this age. */
  freshForMinutes: number
  /** Stale observations may be shown only as diagnostics, never as scoring/ranking input. */
  diagnosticStaleForMinutes: number
}

export type WeatherCacheEntry = {
  key: string
  provider: WeatherProvider
  advisoryOnly: true
  airportCodes: string[]
  signals: AirportWeatherSignal[]
  fetchedAt: string
  expiresAt: string
  diagnostics: string[]
  limitations: string[]
}

export type WeatherCacheReadResult = {
  status: WeatherCacheFreshnessStatus
  key: string
  featureFlag: RouteLiveWeatherFlagStatus
  entry: WeatherCacheEntry | null
  usableSignals: AirportWeatherSignal[]
  advisoryOnly: true
  appliesToScoring: false
  unknownWeatherNeutral: true
  diagnostics: string[]
  limitations: string[]
}

export interface WeatherCacheStore {
  get(key: string): WeatherCacheEntry | undefined
  set(entry: WeatherCacheEntry): void
  delete(key: string): void
  clear(): void
}

const defaultFreshForMinutes = 30
const defaultDiagnosticStaleForMinutes = 120
const minFreshForMinutes = 5
const maxFreshForMinutes = 180
const minDiagnosticStaleForMinutes = 30
const maxDiagnosticStaleForMinutes = 720

const nonAirportRouteTokens = new Set(['AND', 'FOR', 'THE', 'VIA'])

const advisoryLimitations = [
  'Weather cache entries are advisory only and must not be treated as confirmed operational disruption.',
  'Missing, stale, expired, or disabled weather cache data must remain neutral for itinerary scoring and ranking.',
  'Weather cache data never confirms standby availability, clearance probability, airline load factors, or sellable seat inventory.'
]

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function minutesFromEnv(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value?.trim()) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return clampInteger(parsed, min, max)
}

function normalizeAirportCode(value: string) {
  return String(value || '').trim().toUpperCase().match(/^[A-Z]{3,4}$/)?.[0] || ''
}

function isoFromDate(value: Date) {
  return value.toISOString()
}

function validInstant(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function getRouteLiveWeatherFlag(env: Record<string, string | undefined> = process.env): RouteLiveWeatherFlagStatus {
  return env.NONREV_ROUTE_LIVE_WEATHER_ENABLED?.trim().toLowerCase() === 'true' ? 'enabled' : 'disabled'
}

export function isRouteLiveWeatherEnabled(env: Record<string, string | undefined> = process.env) {
  return getRouteLiveWeatherFlag(env) === 'enabled'
}

export function getWeatherFreshnessPolicy(env: Record<string, string | undefined> = process.env): WeatherFreshnessPolicy {
  const freshForMinutes = minutesFromEnv(
    env.NONREV_WEATHER_CACHE_FRESH_MINUTES,
    defaultFreshForMinutes,
    minFreshForMinutes,
    maxFreshForMinutes
  )
  const diagnosticStaleForMinutes = Math.max(
    freshForMinutes,
    minutesFromEnv(
      env.NONREV_WEATHER_CACHE_DIAGNOSTIC_STALE_MINUTES,
      defaultDiagnosticStaleForMinutes,
      minDiagnosticStaleForMinutes,
      maxDiagnosticStaleForMinutes
    )
  )
  return { freshForMinutes, diagnosticStaleForMinutes }
}

export function weatherCacheKeyForAirports(airportCodes: string[]) {
  const normalized = airportCodes.map(normalizeAirportCode).filter(Boolean)
  return normalized.length ? `route-weather:${normalized.join('>')}` : 'route-weather:unknown'
}

export function weatherCacheKeyForRoute(route: string) {
  const airportCodes = (String(route || '').toUpperCase().match(/\b[A-Z]{3}\b/g) || [])
    .filter((code) => !nonAirportRouteTokens.has(code))
  return weatherCacheKeyForAirports(airportCodes)
}

export function createWeatherCacheEntry(input: {
  key?: string
  provider: WeatherProvider
  airportCodes: string[]
  signals: AirportWeatherSignal[]
  fetchedAt?: Date
  policy?: WeatherFreshnessPolicy
  diagnostics?: string[]
  limitations?: string[]
}): WeatherCacheEntry {
  const fetchedAt = input.fetchedAt || new Date()
  const policy = input.policy || getWeatherFreshnessPolicy({})
  const airportCodes = input.airportCodes.map(normalizeAirportCode).filter(Boolean)
  const expiresAt = new Date(fetchedAt.getTime() + policy.freshForMinutes * 60_000)

  return {
    key: input.key || weatherCacheKeyForAirports(airportCodes),
    provider: input.provider,
    advisoryOnly: true,
    airportCodes,
    signals: input.signals,
    fetchedAt: isoFromDate(fetchedAt),
    expiresAt: isoFromDate(expiresAt),
    diagnostics: input.diagnostics || [],
    limitations: [...advisoryLimitations, ...(input.limitations || [])]
  }
}

export class InMemoryWeatherCacheStore implements WeatherCacheStore {
  private entries = new Map<string, WeatherCacheEntry>()

  get(key: string) {
    return this.entries.get(key)
  }

  set(entry: WeatherCacheEntry) {
    this.entries.set(entry.key, entry)
  }

  delete(key: string) {
    this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }
}

function freshnessStatus(entry: WeatherCacheEntry | undefined, now: Date, policy: WeatherFreshnessPolicy): Exclude<WeatherCacheFreshnessStatus, 'disabled'> {
  if (!entry) return 'missing'
  const fetchedAt = validInstant(entry.fetchedAt)
  if (fetchedAt === null) return 'expired'
  const ageMinutes = Math.max(0, (now.getTime() - fetchedAt) / 60_000)
  if (ageMinutes <= policy.freshForMinutes) return 'fresh'
  if (ageMinutes <= policy.diagnosticStaleForMinutes) return 'stale'
  return 'expired'
}

export function readRouteWeatherCache(input: {
  store: WeatherCacheStore
  route?: string
  airportCodes?: string[]
  now?: Date
  env?: Record<string, string | undefined>
  policy?: WeatherFreshnessPolicy
}): WeatherCacheReadResult {
  const env = input.env || process.env
  const featureFlag = getRouteLiveWeatherFlag(env)
  const key = input.airportCodes ? weatherCacheKeyForAirports(input.airportCodes) : weatherCacheKeyForRoute(input.route || '')
  const now = input.now || new Date()
  const policy = input.policy || getWeatherFreshnessPolicy(env)

  if (featureFlag === 'disabled') {
    return {
      status: 'disabled',
      key,
      featureFlag,
      entry: null,
      usableSignals: [],
      advisoryOnly: true,
      appliesToScoring: false,
      unknownWeatherNeutral: true,
      diagnostics: ['Route-level live weather feature flag is disabled; cached weather is ignored safely.'],
      limitations: advisoryLimitations
    }
  }

  const entry = input.store.get(key)
  const status = freshnessStatus(entry, now, policy)
  const usableSignals = status === 'fresh' ? (entry?.signals || []) : []
  const staleDiagnostic = status === 'stale'
    ? 'Cached route weather is stale; it may be reported only as a diagnostic and remains neutral for scoring.'
    : status === 'expired'
      ? 'Cached route weather is expired; it is ignored and remains neutral for scoring.'
      : status === 'missing'
        ? 'No cached route weather is available; unknown weather remains neutral.'
        : 'Fresh cached route weather is available for future advisory route weather wiring only.'

  return {
    status,
    key,
    featureFlag,
    entry: entry || null,
    usableSignals,
    advisoryOnly: true,
    appliesToScoring: false,
    unknownWeatherNeutral: true,
    diagnostics: [staleDiagnostic, ...(entry?.diagnostics || [])],
    limitations: [...advisoryLimitations, ...(entry?.limitations || [])]
  }
}
