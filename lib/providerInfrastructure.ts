import type { NormalizedScheduleResult } from './liveScheduleProviders'
import type { ScheduleProviderCacheStatus, ScheduleProviderStatus } from './scheduleProviderAdapter'

export type ProviderCredentialConfig = {
  envKey: string
  label?: string
  required?: boolean
}

export type ProviderRateLimitConfig = {
  capacity: number
  intervalMs: number
}

export type ProviderRetryConfig = {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  retryableStatuses?: number[]
}

export type ProviderOnboardingConfig = {
  key: string
  label: string
  enabled: boolean
  priority: number
  timeoutMs: number
  credentials?: ProviderCredentialConfig[]
  rateLimit: ProviderRateLimitConfig
  retry: ProviderRetryConfig
}

export type ProviderCredentialState = {
  configured: boolean
  missingEnvKeys: string[]
  credentials: Record<string, string>
}

export type ProviderExecutionMetrics = {
  provider: string
  attempts: number
  latencyMs: number
  rateLimited: boolean
  cacheStatus: ScheduleProviderCacheStatus
  status: ScheduleProviderStatus
  failures: string[]
}

export type ProviderFreshnessSnapshot = {
  newestSourceCheckedAt?: string
  oldestSourceCheckedAt?: string
  freshnessHours?: number
}

export type ProviderHealthSnapshot = {
  provider: string
  status: ScheduleProviderStatus
  checkedAt: string
  latencyMs: number
  failures: string[]
  freshness: ProviderFreshnessSnapshot
}

export type ProviderInfrastructureSnapshot = {
  config: ProviderOnboardingConfig
  credentialState: Omit<ProviderCredentialState, 'credentials'>
  health?: ProviderHealthSnapshot
}

type RateLimitBucket = {
  remaining: number
  resetAt: number
}

export const defaultProviderRetry: ProviderRetryConfig = {
  maxAttempts: 2,
  baseDelayMs: 125,
  maxDelayMs: 1000,
  retryableStatuses: [408, 425, 429, 500, 502, 503, 504]
}

export const defaultProviderRateLimit: ProviderRateLimitConfig = {
  capacity: 30,
  intervalMs: 60_000
}

export const defaultProviderOnboardingConfigs: ProviderOnboardingConfig[] = [
  {
    key: 'flightaware',
    label: 'FlightAware AeroAPI',
    enabled: true,
    priority: 20,
    timeoutMs: 7000,
    credentials: [{ envKey: 'FLIGHTAWARE_API_KEY', label: 'AeroAPI key', required: true }],
    rateLimit: { capacity: 45, intervalMs: 60_000 },
    retry: defaultProviderRetry
  },
  {
    key: 'aviationstack',
    label: 'Aviationstack',
    enabled: true,
    priority: 30,
    timeoutMs: 7000,
    credentials: [{ envKey: 'AVIATIONSTACK_API_KEY', label: 'access key', required: true }],
    rateLimit: { capacity: 30, intervalMs: 60_000 },
    retry: defaultProviderRetry
  },
  {
    key: 'amadeus',
    label: 'Amadeus',
    enabled: false,
    priority: 40,
    timeoutMs: 7000,
    credentials: [
      { envKey: 'AMADEUS_CLIENT_ID', label: 'client id', required: true },
      { envKey: 'AMADEUS_CLIENT_SECRET', label: 'client secret', required: true }
    ],
    rateLimit: defaultProviderRateLimit,
    retry: defaultProviderRetry
  },
  {
    key: 'cirium',
    label: 'Cirium',
    enabled: false,
    priority: 50,
    timeoutMs: 7000,
    credentials: [{ envKey: 'CIRIUM_API_KEY', label: 'API key', required: true }],
    rateLimit: defaultProviderRateLimit,
    retry: defaultProviderRetry
  },
  {
    key: 'oag',
    label: 'OAG',
    enabled: false,
    priority: 60,
    timeoutMs: 7000,
    credentials: [{ envKey: 'OAG_API_KEY', label: 'API key', required: true }],
    rateLimit: defaultProviderRateLimit,
    retry: defaultProviderRetry
  },
  {
    key: 'community',
    label: 'Community provider',
    enabled: false,
    priority: 90,
    timeoutMs: 7000,
    credentials: [],
    rateLimit: { capacity: 120, intervalMs: 60_000 },
    retry: defaultProviderRetry
  }
]

export function providerOnboardingConfigFor(key: string, configs = defaultProviderOnboardingConfigs) {
  return configs.find((config) => config.key === key)
}

export function resolveProviderCredentials(config: ProviderOnboardingConfig, env: Record<string, string | undefined> = process.env): ProviderCredentialState {
  const credentials: Record<string, string> = {}
  const missingEnvKeys: string[] = []
  ;(config.credentials || []).forEach((credential) => {
    const value = env[credential.envKey]?.trim() || ''
    const placeholder = /^(placeholder|changeme|change-me|your[_-]?.*|test-key-here|example|none|null|undefined)$/i.test(value)
    if (value && !placeholder) credentials[credential.envKey] = value
    else if (credential.required !== false) missingEnvKeys.push(credential.envKey)
  })
  return { configured: missingEnvKeys.length === 0, missingEnvKeys, credentials }
}

export function redactCredential(value?: string) {
  if (!value) return '[missing]'
  if (value.length <= 8) return '[configured]'
  return `${value.slice(0, 3)}…${value.slice(-3)}`
}

export class ProviderRateLimitManager {
  private buckets = new Map<string, RateLimitBucket>()

  acquire(provider: string, config: ProviderRateLimitConfig, now = Date.now()) {
    const bucket = this.buckets.get(provider)
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(provider, { remaining: Math.max(0, config.capacity - 1), resetAt: now + config.intervalMs })
      return { allowed: config.capacity > 0, remaining: Math.max(0, config.capacity - 1), resetAt: now + config.intervalMs }
    }
    if (bucket.remaining <= 0) return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
    bucket.remaining -= 1
    return { allowed: true, remaining: bucket.remaining, resetAt: bucket.resetAt }
  }
}

export const globalProviderRateLimitManager = new ProviderRateLimitManager()

function retryDelay(attempt: number, retry: ProviderRetryConfig) {
  return Math.min(retry.maxDelayMs, retry.baseDelayMs * (2 ** Math.max(0, attempt - 1)))
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetryBackoff<T>(operation: (attempt: number) => Promise<T>, options: { retry?: ProviderRetryConfig; shouldRetry?: (error: unknown, attempt: number) => boolean; sleep?: (ms: number) => Promise<void> } = {}) {
  const retry = options.retry || defaultProviderRetry
  const sleep = options.sleep || wait
  let lastError: unknown
  for (let attempt = 1; attempt <= Math.max(1, retry.maxAttempts); attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (attempt >= retry.maxAttempts || options.shouldRetry?.(error, attempt) === false) break
      await sleep(retryDelay(attempt, retry))
    }
  }
  throw lastError
}

function freshnessFromTimes(times: string[], now = Date.now()): ProviderFreshnessSnapshot {
  const valid = times.filter((value) => Number.isFinite(Date.parse(value))).sort()
  const newestSourceCheckedAt = valid[valid.length - 1]
  const oldestSourceCheckedAt = valid[0]
  const freshnessHours = newestSourceCheckedAt ? Math.round(((now - Date.parse(newestSourceCheckedAt)) / 3600000) * 10) / 10 : undefined
  return { newestSourceCheckedAt, oldestSourceCheckedAt, freshnessHours }
}

export function freshnessFromNormalizedSchedules(results: NormalizedScheduleResult[], now = Date.now()): ProviderFreshnessSnapshot {
  return freshnessFromTimes(results.map((result) => result.sourceCheckedAt || result.departureTime), now)
}

export class ProviderHealthMonitor {
  private snapshots = new Map<string, ProviderHealthSnapshot>()

  record(snapshot: ProviderHealthSnapshot) {
    this.snapshots.set(snapshot.provider, snapshot)
    return snapshot
  }

  latest(provider: string) {
    return this.snapshots.get(provider)
  }

  all() {
    return [...this.snapshots.values()]
  }
}

export const globalProviderHealthMonitor = new ProviderHealthMonitor()

export async function executeProviderOperation<T>(config: ProviderOnboardingConfig, operation: () => Promise<T>, options: { rateLimitManager?: ProviderRateLimitManager; healthMonitor?: ProviderHealthMonitor; now?: () => number; sleep?: (ms: number) => Promise<void>; freshness?: () => ProviderFreshnessSnapshot } = {}) {
  const startedAt = options.now?.() ?? Date.now()
  const limiter = options.rateLimitManager || globalProviderRateLimitManager
  const healthMonitor = options.healthMonitor || globalProviderHealthMonitor
  const rate = limiter.acquire(config.key, config.rateLimit, startedAt)
  if (!config.enabled) throw new Error(`${config.label} provider is disabled`)
  if (!rate.allowed) throw new Error(`${config.label} rate limit reached; retry after ${new Date(rate.resetAt).toISOString()}`)

  let attempts = 0
  try {
    const result = await withRetryBackoff(async (attempt) => {
      attempts = attempt
      return operation()
    }, { retry: config.retry, sleep: options.sleep })
    const finishedAt = options.now?.() ?? Date.now()
    healthMonitor.record({
      provider: config.key,
      status: 'success',
      checkedAt: new Date(finishedAt).toISOString(),
      latencyMs: Math.max(0, finishedAt - startedAt),
      failures: [],
      freshness: options.freshness?.() || {}
    })
    return result
  } catch (error) {
    const finishedAt = options.now?.() ?? Date.now()
    const message = error instanceof Error ? error.message : `${config.label} operation failed`
    healthMonitor.record({
      provider: config.key,
      status: 'warning',
      checkedAt: new Date(finishedAt).toISOString(),
      latencyMs: Math.max(0, finishedAt - startedAt),
      failures: [message],
      freshness: options.freshness?.() || {}
    })
    throw error
  } finally {
    void attempts
  }
}

export function providerInfrastructureSnapshot(configs = defaultProviderOnboardingConfigs, env: Record<string, string | undefined> = process.env, monitor = globalProviderHealthMonitor): ProviderInfrastructureSnapshot[] {
  return configs.map((config) => {
    const credentialState = resolveProviderCredentials(config, env)
    return {
      config,
      credentialState: { configured: credentialState.configured, missingEnvKeys: credentialState.missingEnvKeys },
      health: monitor.latest(config.key)
    }
  })
}
