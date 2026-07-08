export const providerHealthDiagnosticsFeatureFlag = 'NONREV_PROVIDER_HEALTH_DIAGNOSTICS_ENABLED' as const

export type ProviderHealthAvailability = 'available' | 'unavailable' | 'unknown'
export type ProviderHealthEnabledState = 'enabled' | 'disabled'
export type ProviderHealthCacheStatus = 'fresh' | 'stale' | 'expired' | 'missing' | 'disabled' | 'unknown'
export type ProviderHealthOverallStatus = 'healthy' | 'degraded' | 'disabled' | 'unavailable' | 'unknown'

export type ProviderHealthInput = {
  provider: string
  category?: string
  enabled?: boolean
  disabled?: boolean
  available?: boolean
  status?: string
  availability?: string
  cacheAgeMinutes?: number | null
  cacheFetchedAt?: string | null
  cacheObservedAt?: string | null
  cacheFreshForMinutes?: number | null
  cacheStaleAfterMinutes?: number | null
  cacheExpiresAfterMinutes?: number | null
  cacheStatus?: string | null
  stale?: boolean | null
  lastSuccessfulRefresh?: string | null
  lastSuccessAt?: string | null
  timeoutCount?: number | null
  failureCount?: number | null
  neutralFallbackReason?: string | null
  detail?: string | null
  diagnostics?: unknown[]
  metadata?: Record<string, unknown>
}

export type ProviderHealthDiagnosticsInput = {
  providers: ProviderHealthInput[]
  expectedProviders?: Array<string | ProviderHealthInput>
  now?: Date
  env?: Record<string, string | undefined>
}

export type ProviderHealthDiagnostic = {
  provider: string
  category: string | null
  enabled: ProviderHealthEnabledState
  availability: ProviderHealthAvailability
  available: boolean
  cacheAgeMinutes: number | null
  lastSuccessfulRefresh: string | null
  staleStatus: ProviderHealthCacheStatus
  timeoutCount: number
  failureCount: number
  neutralFallbackReason: string
  status: ProviderHealthOverallStatus
  summary: string
  diagnosticsOnly: true
  missingProviderNeutral: true
  noItineraryGenerationChange: true
  noPlannerBehaviorChange: true
  noRankingChange: true
  noScoringChange: true
  noAdvisoryWordingChange: true
  noUiChange: true
  noApiContractChange: true
  metadata: Record<string, string | number | boolean | null>
}

export type ProviderHealthAggregationSummary = {
  totalProviders: number
  enabledProviders: number
  disabledProviders: number
  availableProviders: number
  unavailableProviders: number
  staleProviders: number
  healthyProviders: number
  degradedProviders: number
  timedOutProviders: number
  failedProviders: number
  missingProviders: number
  neutralFallbackProviders: number
  overallStatus: 'healthy' | 'degraded' | 'disabled' | 'unknown'
  summary: string
}

export type ProviderHealthDiagnostics = {
  enabled: true
  featureFlagEnvVar: typeof providerHealthDiagnosticsFeatureFlag
  generatedAt: string
  diagnosticsOnly: true
  advisoryOnly: true
  missingProvidersNeutral: true
  unknownProvidersDoNotThrow: true
  noItineraryGenerationChange: true
  noPlannerBehaviorChange: true
  noRankingChange: true
  noScoringChange: true
  noAdvisoryWordingChange: true
  noUiChange: true
  noApiContractChange: true
  providers: ProviderHealthDiagnostic[]
  summary: ProviderHealthAggregationSummary
  limitations: string[]
}

const defaultCategory = 'provider'

const limitations = [
  'Provider health diagnostics are diagnostics-only and do not change itinerary generation, planner behavior, ranking, scoring, advisory wording, UI, or API contracts.',
  'Missing, disabled, unavailable, stale, timed-out, failed, and unknown providers remain neutral.',
  'Provider health does not claim live flight availability, standby clearance, booking, boarding, reaccommodation, hotel, ride, or seat availability.',
  'Credentials, provider secrets, token-like values, and internal implementation details are redacted from diagnostics.'
]

function featureEnabled(env: Record<string, string | undefined>) {
  const value = String(env[providerHealthDiagnosticsFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function sanitizeText(value: string, env: Record<string, string | undefined>) {
  let sanitized = value
  for (const secret of Object.values(env)) {
    if (secret?.trim()) sanitized = sanitized.split(secret).join('[redacted]')
  }
  return sanitized
    .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, '$1[redacted]')
    .replace(/([?&](?:api_?key|token|access_token)=)[^\s&]+/gi, '$1[redacted]')
    .replace(/\b(?:sk|pk|key|token)_[a-z0-9_\-]{8,}\b/gi, '[redacted]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g, '[redacted]')
    .replace(/\b[A-Za-z]:?\/?(?:root|home|Users|workspace|app|lib|src)\/[\w./-]+\b/g, '[internal]')
    .replace(/\b(?:lib|app|src)\/[\w./-]+\.(?:ts|tsx|js|jsx)(?::\d+(?::\d+)?)?/g, '[internal]')
    .replace(/\bat\s+[\w.$<>]+\s+\([^)]*\)/g, 'at [internal]')
    .replace(/\b(?:function|method|class)\s+[A-Za-z0-9_$<>.]+/g, '[internal]')
}

function sanitizeValue(value: unknown, env: Record<string, string | undefined>): string | number | boolean | null {
  if (typeof value === 'string') return sanitizeText(value, env)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value
  return null
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined, env: Record<string, string | undefined>) {
  if (!metadata) return {}
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [sanitizeText(key, env), sanitizeValue(value, env)]))
}

function normalizedProviderKey(provider: string) {
  return provider.trim().toLowerCase()
}

function enabledState(provider: ProviderHealthInput): ProviderHealthEnabledState {
  if (provider.disabled === true) return 'disabled'
  if (provider.enabled === false) return 'disabled'
  const status = String(provider.status || '').toLowerCase()
  if (['disabled', 'feature-disabled', 'credential-missing', 'not-implemented', 'skipped'].includes(status)) return 'disabled'
  return 'enabled'
}

function availability(provider: ProviderHealthInput, enabled: ProviderHealthEnabledState): ProviderHealthAvailability {
  if (enabled === 'disabled') return 'unavailable'
  if (provider.available === true) return 'available'
  if (provider.available === false) return 'unavailable'
  const normalized = String(provider.availability || provider.status || '').toLowerCase()
  if (['available', 'ready', 'success', 'healthy', 'fresh', 'cache-hit', 'fetched', 'enabled'].includes(normalized)) return 'available'
  if (['unavailable', 'failed', 'failure', 'timeout', 'timed-out', 'error', 'provider-unavailable', 'credential-missing', 'not-implemented'].includes(normalized)) return 'unavailable'
  return 'unknown'
}

function finiteNonNegative(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.floor(value))
}

function minutesBetween(now: Date, iso: string | null | undefined) {
  if (!iso) return null
  const parsed = new Date(iso)
  const millis = parsed.getTime()
  if (!Number.isFinite(millis)) return null
  return Math.max(0, Math.floor((now.getTime() - millis) / 60000))
}

function cacheAge(provider: ProviderHealthInput, now: Date) {
  return finiteNonNegative(provider.cacheAgeMinutes)
    ?? minutesBetween(now, provider.cacheObservedAt)
    ?? minutesBetween(now, provider.cacheFetchedAt)
    ?? minutesBetween(now, provider.lastSuccessfulRefresh)
    ?? minutesBetween(now, provider.lastSuccessAt)
}

function staleStatus(provider: ProviderHealthInput, enabled: ProviderHealthEnabledState, ageMinutes: number | null): ProviderHealthCacheStatus {
  if (enabled === 'disabled') return 'disabled'
  if (provider.stale === true) return 'stale'
  if (provider.stale === false && ageMinutes !== null) return 'fresh'
  const normalized = String(provider.cacheStatus || '').toLowerCase()
  if (['fresh', 'stale', 'expired', 'missing', 'disabled', 'unknown'].includes(normalized)) return normalized as ProviderHealthCacheStatus
  const expiresAfter = finiteNonNegative(provider.cacheExpiresAfterMinutes)
  if (expiresAfter !== null && ageMinutes !== null && ageMinutes > expiresAfter) return 'expired'
  const staleAfter = finiteNonNegative(provider.cacheStaleAfterMinutes) ?? finiteNonNegative(provider.cacheFreshForMinutes)
  if (staleAfter !== null && ageMinutes !== null) return ageMinutes > staleAfter ? 'stale' : 'fresh'
  return ageMinutes === null ? 'missing' : 'unknown'
}

function counter(value: unknown) {
  return finiteNonNegative(value) ?? 0
}

function fallbackReason(provider: ProviderHealthInput, enabled: ProviderHealthEnabledState, providerAvailability: ProviderHealthAvailability, stale: ProviderHealthCacheStatus, timeoutCount: number, failureCount: number) {
  if (provider.neutralFallbackReason?.trim()) return provider.neutralFallbackReason
  if (enabled === 'disabled') return 'Provider disabled; neutral fallback applied.'
  if (timeoutCount > 0) return 'Provider timeout recorded; neutral fallback applied.'
  if (failureCount > 0) return 'Provider failure recorded; neutral fallback applied.'
  if (providerAvailability === 'unavailable') return 'Provider unavailable; neutral fallback applied.'
  if (stale === 'stale' || stale === 'expired') return 'Provider cache stale or expired; neutral fallback applied.'
  if (stale === 'missing') return 'Provider cache missing; neutral fallback applied.'
  if (providerAvailability === 'unknown') return 'Provider health unknown; neutral fallback applied.'
  return 'Provider healthy; no fallback required.'
}

function overallStatus(enabled: ProviderHealthEnabledState, providerAvailability: ProviderHealthAvailability, stale: ProviderHealthCacheStatus, timeoutCount: number, failureCount: number): ProviderHealthOverallStatus {
  if (enabled === 'disabled') return 'disabled'
  if (providerAvailability === 'unavailable' || failureCount > 0) return 'unavailable'
  if (timeoutCount > 0 || stale === 'stale' || stale === 'expired' || stale === 'missing') return 'degraded'
  if (providerAvailability === 'available' && (stale === 'fresh' || stale === 'unknown')) return 'healthy'
  return 'unknown'
}

function providerSummary(providerName: string, status: ProviderHealthOverallStatus, reason: string) {
  if (status === 'healthy') return `${providerName} is healthy for diagnostics.`
  if (status === 'disabled') return `${providerName} is disabled; neutral fallback remains in effect.`
  if (status === 'unavailable') return `${providerName} is unavailable; neutral fallback remains in effect.`
  if (status === 'degraded') return `${providerName} is degraded; ${reason}`
  return `${providerName} health is unknown; neutral fallback remains in effect.`
}

function diagnosticFor(provider: ProviderHealthInput, now: Date, env: Record<string, string | undefined>): ProviderHealthDiagnostic {
  const name = provider.provider?.trim() || 'unknown-provider'
  const enabled = enabledState(provider)
  const providerAvailability = availability(provider, enabled)
  const ageMinutes = cacheAge(provider, now)
  const stale = staleStatus(provider, enabled, ageMinutes)
  const timeoutCount = counter(provider.timeoutCount)
  const failureCount = counter(provider.failureCount)
  const reason = sanitizeText(fallbackReason(provider, enabled, providerAvailability, stale, timeoutCount, failureCount), env)
  const status = overallStatus(enabled, providerAvailability, stale, timeoutCount, failureCount)
  const metadata: ProviderHealthDiagnostic['metadata'] = { ...sanitizeMetadata(provider.metadata, env) }
  if (provider.detail) metadata.detail = sanitizeText(provider.detail, env)
  return {
    provider: sanitizeText(name, env),
    category: provider.category ? sanitizeText(provider.category, env) : null,
    enabled,
    availability: providerAvailability,
    available: providerAvailability === 'available',
    cacheAgeMinutes: ageMinutes,
    lastSuccessfulRefresh: provider.lastSuccessfulRefresh || provider.lastSuccessAt ? sanitizeText(String(provider.lastSuccessfulRefresh || provider.lastSuccessAt), env) : null,
    staleStatus: stale,
    timeoutCount,
    failureCount,
    neutralFallbackReason: reason,
    status,
    summary: sanitizeText(providerSummary(name, status, reason), env),
    diagnosticsOnly: true,
    missingProviderNeutral: true,
    noItineraryGenerationChange: true,
    noPlannerBehaviorChange: true,
    noRankingChange: true,
    noScoringChange: true,
    noAdvisoryWordingChange: true,
    noUiChange: true,
    noApiContractChange: true,
    metadata
  }
}

function expectedProviderInput(provider: string | ProviderHealthInput): ProviderHealthInput {
  if (typeof provider === 'string') {
    return {
      provider,
      enabled: false,
      available: false,
      cacheStatus: 'missing',
      neutralFallbackReason: 'Expected provider was not supplied; neutral fallback applied.',
      metadata: { missingProvider: true }
    }
  }
  return provider
}

function mergeProviders(providers: ProviderHealthInput[], expectedProviders: Array<string | ProviderHealthInput> | undefined): ProviderHealthInput[] {
  const merged = [...providers]
  const seen = new Set(providers.map((provider) => normalizedProviderKey(provider.provider || 'unknown-provider')))
  for (const expected of expectedProviders || []) {
    const normalized = expectedProviderInput(expected)
    const key = normalizedProviderKey(normalized.provider || 'unknown-provider')
    if (!seen.has(key)) {
      merged.push(normalized)
      seen.add(key)
    }
  }
  return merged
}

function aggregation(providers: ProviderHealthDiagnostic[]): ProviderHealthAggregationSummary {
  const totalProviders = providers.length
  const enabledProviders = providers.filter((provider) => provider.enabled === 'enabled').length
  const disabledProviders = providers.filter((provider) => provider.enabled === 'disabled').length
  const availableProviders = providers.filter((provider) => provider.availability === 'available').length
  const unavailableProviders = providers.filter((provider) => provider.availability === 'unavailable').length
  const staleProviders = providers.filter((provider) => provider.staleStatus === 'stale' || provider.staleStatus === 'expired').length
  const healthyProviders = providers.filter((provider) => provider.status === 'healthy').length
  const degradedProviders = providers.filter((provider) => provider.status === 'degraded').length
  const timedOutProviders = providers.filter((provider) => provider.timeoutCount > 0).length
  const failedProviders = providers.filter((provider) => provider.failureCount > 0 || provider.status === 'unavailable').length
  const missingProviders = providers.filter((provider) => provider.staleStatus === 'missing' || provider.metadata.missingProvider === true).length
  const neutralFallbackProviders = providers.filter((provider) => !/no fallback required/i.test(provider.neutralFallbackReason)).length
  const overallStatus = totalProviders === 0
    ? 'unknown'
    : enabledProviders === 0
      ? 'disabled'
      : degradedProviders > 0 || unavailableProviders > 0 || staleProviders > 0 || timedOutProviders > 0 || failedProviders > 0 || missingProviders > 0
        ? 'degraded'
        : 'healthy'
  return {
    totalProviders,
    enabledProviders,
    disabledProviders,
    availableProviders,
    unavailableProviders,
    staleProviders,
    healthyProviders,
    degradedProviders,
    timedOutProviders,
    failedProviders,
    missingProviders,
    neutralFallbackProviders,
    overallStatus,
    summary: `${healthyProviders}/${totalProviders} provider${totalProviders === 1 ? '' : 's'} healthy; ${neutralFallbackProviders} neutral fallback${neutralFallbackProviders === 1 ? '' : 's'} recorded.`
  }
}

export function buildProviderHealthDiagnostics(input: ProviderHealthDiagnosticsInput): ProviderHealthDiagnostics | undefined {
  const env = input.env || process.env
  if (!featureEnabled(env)) return undefined
  const now = input.now || new Date()
  const providers = mergeProviders(input.providers || [], input.expectedProviders).map((provider) => diagnosticFor(provider, now, env))
  return {
    enabled: true,
    featureFlagEnvVar: providerHealthDiagnosticsFeatureFlag,
    generatedAt: now.toISOString(),
    diagnosticsOnly: true,
    advisoryOnly: true,
    missingProvidersNeutral: true,
    unknownProvidersDoNotThrow: true,
    noItineraryGenerationChange: true,
    noPlannerBehaviorChange: true,
    noRankingChange: true,
    noScoringChange: true,
    noAdvisoryWordingChange: true,
    noUiChange: true,
    noApiContractChange: true,
    providers,
    summary: aggregation(providers),
    limitations: limitations.map((limitation) => sanitizeText(limitation, env))
  }
}
