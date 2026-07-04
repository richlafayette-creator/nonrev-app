export type LiveAvailabilityInput = {
  id?: string | number
  source?: string
  sourceProvider?: string
  dataFreshnessLabel?: string
  dataFreshnessDetail?: string
  dataFreshnessRule?: string
  providerBadges?: string[]
  productionAvailability?: boolean
}

const nonLiveFreshnessRules = new Set([
  'cached-provider-current',
  'cached-provider-reduced',
  'cached-provider-yellow',
  'cached-provider-historical',
  'nearest-date-testing-match',
  'stored-historical-data',
  'demo-fallback',
  'route-framework'
])

export function liveAvailabilityHaystack(input: LiveAvailabilityInput) {
  return [
    input.id,
    input.source,
    input.sourceProvider,
    input.dataFreshnessLabel,
    input.dataFreshnessDetail,
    input.dataFreshnessRule,
    ...(input.providerBadges || [])
  ].filter(Boolean).join(' ').toLowerCase()
}

export function isCurrentLiveAvailability(input: LiveAvailabilityInput) {
  const rule = input.dataFreshnessRule || ''
  const haystack = liveAvailabilityHaystack(input)

  if (input.productionAvailability === false) return false
  if (nonLiveFreshnessRules.has(rule)) return false
  if (/cached|historical|nearest-date|test data|testing|demo|planning fallback|route-framework|route framework|no current live/.test(haystack)) return false
  if (/stored supabase|provider-cache|provider cache/.test(haystack)) return false

  return input.productionAvailability === true && (/flightaware|aviationstack|live provider api|exact-requested-date/.test(haystack) || rule === 'exact-requested-date')
}

export function freshnessBadgeLabelFor(input: LiveAvailabilityInput & { dataMode?: string }) {
  const value = `${input.dataFreshnessLabel || ''} ${input.dataMode || ''} ${input.dataFreshnessRule || ''}`.toLowerCase()

  if (input.dataFreshnessRule === 'route-framework' || value.includes('route-framework') || value.includes('route framework')) return 'Freshness: Route framework only'
  if (value.includes('no-current-live-data') || value.includes('no current live')) return 'Freshness: No current live availability'
  if (value.includes('nearest-date')) return 'Freshness: Nearest-date testing data'
  if (value.includes('cached-provider') || value.includes('cached provider') || value.includes('provider-cache')) return 'Freshness: Cached provider data'
  if (value.includes('stored-historical') || value.includes('historical')) return 'Freshness: Stored historical data'
  if (value.includes('stored') || value.includes('supabase')) return 'Freshness: Stored Supabase flight data'
  if (value.includes('mvp') || value.includes('test') || value.includes('fallback') || value.includes('demo')) return 'Freshness: Demo fallback data'
  if (isCurrentLiveAvailability(input) || value.includes('live provider api')) return 'Freshness: Live provider API data'
  if (value.includes('exact requested date') || value.includes('exact-requested-date')) return 'Freshness: Exact requested date'
  return 'Freshness: Not provided'
}
