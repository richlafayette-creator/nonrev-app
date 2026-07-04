export type ProviderDiagnosticCategory = 'freshness' | 'partial-coverage' | 'rate-limit' | 'fallback'
export type ProviderDiagnosticSeverity = 'info' | 'warning' | 'error'

export type StructuredProviderDiagnostic = {
  id: string
  provider: string
  category: ProviderDiagnosticCategory
  severity: ProviderDiagnosticSeverity
  summary: string
  detail: string
  evidenceCount?: number
}

type ProviderStatusLike = {
  provider: string
  label: string
  state: 'pending' | 'success' | 'skipped' | 'warning' | 'error'
  detail: string
}

type RouteCoverageSuggestionLike = {
  lookupStatus: 'not_checked' | 'provider_rows_found' | 'provider_no_rows' | 'provider_warning' | 'skipped_rate_limited'
  providerResultCount: number
  providerDetail?: string
  searchQuery?: string
}

export type BuildProviderDiagnosticsInput = {
  providerStatuses?: ProviderStatusLike[]
  dataFreshnessMode?: string
  dataFreshnessExplanation?: string[]
  rateLimits?: string[]
  emptyResults?: string[]
  providerFallbackOrder?: string[]
  routeCoverageSuggestions?: RouteCoverageSuggestionLike[]
}

function severityForProviderState(state: ProviderStatusLike['state']): ProviderDiagnosticSeverity {
  if (state === 'error') return 'error'
  if (state === 'warning' || state === 'skipped') return 'warning'
  return 'info'
}

function diagnosticId(category: ProviderDiagnosticCategory, provider: string, detail: string) {
  return `${category}-${provider}-${detail}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120)
}

function uniqueDiagnostics(diagnostics: StructuredProviderDiagnostic[]) {
  const seen = new Set<string>()
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.category}|${diagnostic.provider}|${diagnostic.summary}|${diagnostic.detail}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildProviderDiagnostics(input: BuildProviderDiagnosticsInput): StructuredProviderDiagnostic[] {
  const diagnostics: StructuredProviderDiagnostic[] = []
  const freshnessDetail = (input.dataFreshnessExplanation || []).join(' ')
  if (input.dataFreshnessMode || freshnessDetail) {
    const mode = input.dataFreshnessMode || 'unknown'
    const provider = mode.includes('cache') ? 'provider-cache' : mode.includes('supabase') ? 'supabase' : mode.includes('live') ? 'live-provider-api' : mode.includes('framework') || mode.includes('no-current') ? 'planning' : 'data-pipeline'
    diagnostics.push({
      id: diagnosticId('freshness', provider, mode),
      provider,
      category: 'freshness',
      severity: mode === 'live-current-api' ? 'info' : 'warning',
      summary: `Freshness mode: ${mode}`,
      detail: freshnessDetail || 'Freshness mode was reported without a detailed explanation.',
      evidenceCount: input.dataFreshnessExplanation?.length || 0
    })
  }

  for (const message of input.rateLimits || []) {
    const provider = /aviationstack/i.test(message) ? 'aviationstack' : /flightaware/i.test(message) ? 'flightaware' : /supabase/i.test(message) ? 'supabase' : 'provider'
    diagnostics.push({
      id: diagnosticId('rate-limit', provider, message),
      provider,
      category: 'rate-limit',
      severity: 'warning',
      summary: `${provider} rate limit or quota condition`,
      detail: message,
      evidenceCount: 1
    })
  }

  const emptyResults = input.emptyResults || []
  if (emptyResults.length) {
    diagnostics.push({
      id: diagnosticId('partial-coverage', 'provider-search', emptyResults.join('|')),
      provider: 'provider-search',
      category: 'partial-coverage',
      severity: 'warning',
      summary: `${emptyResults.length} provider segment${emptyResults.length === 1 ? '' : 's'} returned no usable rows`,
      detail: emptyResults.slice(0, 4).join(' · '),
      evidenceCount: emptyResults.length
    })
  }

  const partialSuggestions = (input.routeCoverageSuggestions || []).filter((suggestion) => suggestion.lookupStatus === 'provider_no_rows' || suggestion.lookupStatus === 'provider_warning' || suggestion.lookupStatus === 'skipped_rate_limited')
  if (partialSuggestions.length) {
    diagnostics.push({
      id: diagnosticId('partial-coverage', 'route-coverage', partialSuggestions.map((suggestion) => suggestion.searchQuery || suggestion.lookupStatus).join('|')),
      provider: 'route-coverage',
      category: 'partial-coverage',
      severity: 'warning',
      summary: `${partialSuggestions.length} fallback route coverage check${partialSuggestions.length === 1 ? '' : 's'} lacked complete provider rows`,
      detail: partialSuggestions.slice(0, 4).map((suggestion) => suggestion.providerDetail || `${suggestion.searchQuery || 'Alternate route'}: ${suggestion.lookupStatus}`).join(' · '),
      evidenceCount: partialSuggestions.length
    })
  }

  for (const status of input.providerStatuses || []) {
    if (status.state === 'success' && !/fallback|skipped|route framework|cache|stored/i.test(status.detail)) continue
    const isFallback = /fallback|skipped|route framework|cache|stored|no usable|unavailable/i.test(status.detail) || status.state === 'skipped'
    if (!isFallback) continue
    diagnostics.push({
      id: diagnosticId('fallback', status.provider, status.detail),
      provider: status.provider,
      category: 'fallback',
      severity: severityForProviderState(status.state),
      summary: `${status.label} ${status.state}`,
      detail: status.detail,
      evidenceCount: 1
    })
  }

  if (input.providerFallbackOrder?.length) {
    diagnostics.push({
      id: diagnosticId('fallback', 'provider-order', input.providerFallbackOrder.join('>')),
      provider: 'provider-order',
      category: 'fallback',
      severity: 'info',
      summary: 'Provider fallback order recorded',
      detail: input.providerFallbackOrder.join(' → '),
      evidenceCount: input.providerFallbackOrder.length
    })
  }

  return uniqueDiagnostics(diagnostics)
}
