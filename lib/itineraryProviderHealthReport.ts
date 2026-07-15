import type { UnifiedScheduleSearchResult } from './scheduleProviderRegistry'

export type ProviderHealthMatrixRow = {
  provider: string
  enabled: 'yes' | 'no'
  credentialPresent: 'yes' | 'no' | 'not-required'
  requestAttempted: 'yes' | 'no'
  currentStatus: string
  quotaRateLimitStatus: string
  rowsReturned: number
  freshness: string
  productionReadiness: string
}

export const itineraryProviderExpectedEnvNames = [
  'FLIGHTAWARE_API_KEY',
  'AVIATIONSTACK_API_KEY',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NONREVY_STORE_PROVIDER_RESULTS'
] as const

export function missingItineraryProviderEnvNames(env: Record<string, string | undefined>) {
  const hasSupabaseUrl = Boolean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)
  return [
    !env.FLIGHTAWARE_API_KEY ? 'FLIGHTAWARE_API_KEY' : undefined,
    !env.AVIATIONSTACK_API_KEY ? 'AVIATIONSTACK_API_KEY' : undefined,
    !hasSupabaseUrl ? 'SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL' : undefined,
    !env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : undefined
  ].filter((name): name is string => Boolean(name))
}

function textIncludesRateLimit(value: string) {
  return /rate limit|rate-limited|429|quota|usage limit|monthly/i.test(value)
}

function freshnessFor(search: UnifiedScheduleSearchResult | undefined, provider: string) {
  const freshness = search?.marketCoverage.scheduleFreshness[provider]
  return freshness?.newestSourceCheckedAt || freshness?.oldestSourceCheckedAt || 'none'
}

function providerResult(search: UnifiedScheduleSearchResult | undefined, provider: string) {
  return search?.providerResults.find((result) => result.provider === provider)
}

function rowFor(input: {
  provider: string
  enabled: boolean
  credentialPresent: boolean | 'not-required'
  search?: UnifiedScheduleSearchResult
}) {
  const result = providerResult(input.search, input.provider)
  const diagnosticText = `${result?.warning || ''} ${result?.detail || ''} ${result?.diagnostics.providerFailures.join(' ') || ''}`
  const credentialPresent = input.credentialPresent === 'not-required' ? 'not-required' : input.credentialPresent ? 'yes' : 'no'
  const requestAttempted = result && (result.requestCount || 0) > 0 ? 'yes' : 'no'
  const currentStatus = result?.status || (input.enabled ? 'not-attempted' : 'disabled')
  const rowsReturned = result?.rows.length || 0
  const productionReadiness = input.enabled && credentialPresent !== 'no' && rowsReturned > 0 && currentStatus === 'success'
    ? 'ready for verified schedules'
    : input.enabled && credentialPresent === 'no'
      ? 'blocked by missing credential'
      : input.enabled
        ? 'not production-ready for this request'
        : 'disabled or placeholder'

  return {
    provider: input.provider,
    enabled: input.enabled ? 'yes' : 'no',
    credentialPresent,
    requestAttempted,
    currentStatus,
    quotaRateLimitStatus: textIncludesRateLimit(diagnosticText) ? 'rate-limited or quota-blocked' : 'not reported',
    rowsReturned,
    freshness: freshnessFor(input.search, input.provider),
    productionReadiness
  } satisfies ProviderHealthMatrixRow
}

export function buildItineraryProviderHealthMatrix(input: {
  search?: UnifiedScheduleSearchResult
  env?: Record<string, string | undefined>
} = {}) {
  const env = input.env || process.env
  const hasSupabaseUrl = Boolean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)
  const providerCacheEnabled = env.NONREVY_STORE_PROVIDER_RESULTS !== 'false'

  return [
    rowFor({
      provider: 'supabase-cache',
      enabled: providerCacheEnabled,
      credentialPresent: hasSupabaseUrl && Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      search: input.search
    }),
    rowFor({
      provider: 'flightaware',
      enabled: true,
      credentialPresent: Boolean(env.FLIGHTAWARE_API_KEY),
      search: input.search
    }),
    rowFor({
      provider: 'aviationstack',
      enabled: true,
      credentialPresent: Boolean(env.AVIATIONSTACK_API_KEY),
      search: input.search
    }),
    rowFor({
      provider: 'amadeus',
      enabled: false,
      credentialPresent: 'not-required',
      search: input.search
    }),
    rowFor({
      provider: 'cirium-oag',
      enabled: false,
      credentialPresent: 'not-required',
      search: input.search
    })
  ]
}

