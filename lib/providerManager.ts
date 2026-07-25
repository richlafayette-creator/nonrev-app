import {
  type SearchExecutionItinerary,
  type SearchExecutionProvider,
  type SearchExecutionProviderCapabilities,
  type SearchExecutionProviderReadiness,
  type SearchExecutionProviderResult,
  type SearchExecutionProviderRun,
  type SearchExecutionRequest
} from './searchExecutionEngine'

export type ProviderFailureCategory =
  | 'rate_limit'
  | 'quota_exhausted'
  | 'invalid_key'
  | 'network_failure'
  | 'provider_unavailable'
  | 'timeout'
  | 'unsupported_request'
  | 'malformed_response'
  | 'provider_warning'

export type ProviderMetadata = {
  id: string
  name: string
  enabled: boolean
  placeholder?: boolean
  confidenceWeight: number
  capabilities: SearchExecutionProviderCapabilities
}

export type ProviderHealth = {
  providerId: string
  providerName: string
  status: SearchExecutionProviderReadiness['status'] | SearchExecutionProviderRun['status']
  enabled: boolean
  checkedAt: string
  responseLatencyMs: number
  confidenceWeight: number
  recordsReceived: number
  recordsNormalized: number
  warnings: string[]
  failureCategory?: ProviderFailureCategory
}

export type StandardProviderSearchResult = SearchExecutionProviderResult

export type StandardFlightProvider = {
  searchFlights: (request: SearchExecutionRequest) => Promise<StandardProviderSearchResult>
  searchSchedules: (request: SearchExecutionRequest) => Promise<StandardProviderSearchResult>
  healthCheck: () => Promise<ProviderHealth>
  providerMetadata: () => ProviderMetadata
}

export type ProviderManagerRunResult = {
  itineraries: SearchExecutionItinerary[]
  run: SearchExecutionProviderRun
  health: ProviderHealth
}

export type ProviderManagerOptions = {
  providers?: StandardFlightProvider[]
  timeoutMs?: number
  now?: () => Date
}

const defaultTimeoutMs = 7000

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function classifyProviderFailure(text = ''): ProviderFailureCategory | undefined {
  const lower = text.toLowerCase()
  if (/quota exhausted|quota exceeded|monthly|usage limit/.test(lower)) return 'quota_exhausted'
  if (/rate limit|rate-limited|\b429\b/.test(lower)) return 'rate_limit'
  if (/invalid key|credentials rejected|credential|authentication|authorization|api key|\b401\b|\b403\b/.test(lower)) return 'invalid_key'
  if (/network|fetch failed|enotfound|econnreset|econnrefused/.test(lower)) return 'network_failure'
  if (/timed out|timeout|abort/.test(lower)) return 'timeout'
  if (/unsupported|endpoint|available for this key/.test(lower)) return 'unsupported_request'
  if (/unexpected|malformed|payload/.test(lower)) return 'malformed_response'
  if (/\b500\b|\b502\b|\b503\b|\b504\b|service unavailable|provider unavailable/.test(lower)) return 'provider_unavailable'
  return lower ? 'provider_warning' : undefined
}

function statusFromFailure(category?: ProviderFailureCategory): SearchExecutionProviderRun['status'] {
  if (category === 'rate_limit') return 'rate_limited'
  if (category === 'quota_exhausted') return 'quota_exhausted'
  if (category === 'invalid_key') return 'invalid_key'
  if (category === 'network_failure') return 'network_failure'
  if (category === 'provider_unavailable') return 'provider_unavailable'
  if (category === 'timeout') return 'timeout'
  if (category === 'unsupported_request') return 'unsupported_request'
  return category ? 'degraded' : 'failed'
}

function readinessFor(metadata: ProviderMetadata, readiness: SearchExecutionProviderReadiness): SearchExecutionProviderReadiness {
  if (!metadata.enabled && metadata.placeholder) return { enabled: false, status: 'disabled', message: `${metadata.name} is disabled.` }
  return readiness
}

function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Provider timed out after ${ms}ms`)), ms)
  })
}

function providerEnabled(readiness: SearchExecutionProviderReadiness) {
  return readiness.enabled && readiness.status === 'ready'
}

function readinessStatusFromHealth(status: ProviderHealth['status']): SearchExecutionProviderReadiness['status'] {
  if (status === 'success') return 'ready'
  if (status === 'failed' || status === 'timeout') return 'unavailable'
  if (status === 'skipped') return 'disabled'
  return status
}

function healthFromRun(input: {
  metadata: ProviderMetadata
  readiness: SearchExecutionProviderReadiness
  run: SearchExecutionProviderRun
  startedAt: number
  now: Date
}): ProviderHealth {
  const diagnostics = input.run.diagnostics
  const warningText = input.run.warnings.join(' ')
  const failureCategory = (diagnostics?.errorCategory as ProviderFailureCategory | undefined) || classifyProviderFailure(warningText)
  return {
    providerId: input.metadata.id,
    providerName: input.metadata.name,
    status: input.run.status === 'success'
      ? 'ready'
      : input.run.status === 'skipped'
        ? input.readiness.status
        : input.run.status,
    enabled: input.readiness.enabled,
    checkedAt: input.now.toISOString(),
    responseLatencyMs: diagnostics?.responseLatencyMs ?? Math.max(0, Date.now() - input.startedAt),
    confidenceWeight: input.metadata.confidenceWeight,
    recordsReceived: diagnostics?.recordsReceived || 0,
    recordsNormalized: diagnostics?.recordsNormalized || 0,
    warnings: input.run.warnings,
    ...(failureCategory ? { failureCategory } : {})
  }
}

export function createLegacyExecutionProviderAdapter(provider: SearchExecutionProvider, confidenceWeight = 50): StandardFlightProvider {
  return {
    searchFlights: (request) => provider.search(request),
    searchSchedules: (request) => provider.search(request),
    async healthCheck() {
      return {
        providerId: provider.id,
        providerName: provider.name,
        status: provider.readiness.status,
        enabled: provider.readiness.enabled,
        checkedAt: new Date().toISOString(),
        responseLatencyMs: 0,
        confidenceWeight,
        recordsReceived: 0,
        recordsNormalized: 0,
        warnings: provider.readiness.message ? [provider.readiness.message] : []
      }
    },
    providerMetadata() {
      return {
        id: provider.id,
        name: provider.name,
        enabled: provider.readiness.enabled,
        confidenceWeight,
        capabilities: provider.capabilities
      }
    }
  }
}

export class ProviderManager {
  private readonly providers: StandardFlightProvider[]
  private readonly timeoutMs: number
  private readonly now: () => Date

  constructor(options: ProviderManagerOptions = {}) {
    this.providers = [...(options.providers || [])]
    this.timeoutMs = options.timeoutMs || defaultTimeoutMs
    this.now = options.now || (() => new Date())
  }

  register(provider: StandardFlightProvider) {
    this.providers.push(provider)
  }

  registeredProviders() {
    return [...this.providers]
  }

  providerMetadata() {
    return this.providers.map((provider) => provider.providerMetadata())
  }

  async healthChecks() {
    return Promise.all(this.providers.map((provider) => provider.healthCheck()))
  }

  async runProvider(provider: StandardFlightProvider, request: SearchExecutionRequest): Promise<ProviderManagerRunResult> {
    const metadata = provider.providerMetadata()
    const startedAt = Date.now()
    const baseHealth = await provider.healthCheck()
    const readiness = readinessFor(metadata, {
      enabled: baseHealth.enabled,
      status: readinessStatusFromHealth(baseHealth.status),
      message: baseHealth.warnings[0]
    })

    if (!providerEnabled(readiness)) {
      const run: SearchExecutionProviderRun = {
        providerId: metadata.id,
        providerName: metadata.name,
        status: 'skipped',
        readiness,
        capabilities: metadata.capabilities,
        itineraryCount: 0,
        warnings: uniqueStrings(baseHealth.warnings.length ? baseHealth.warnings : [readiness.message || `${metadata.name} is not ready.`])
      }
      return {
        itineraries: [],
        run,
        health: healthFromRun({ metadata, readiness, run, startedAt, now: this.now() })
      }
    }

    try {
      const result = await Promise.race([provider.searchSchedules(request), timeout<StandardProviderSearchResult>(this.timeoutMs)])
      const warnings = uniqueStrings(result.warnings || [])
      const failureCategory = (result.diagnostics?.errorCategory as ProviderFailureCategory | undefined) || classifyProviderFailure(warnings.join(' '))
      const status = result.status || (result.itineraries.length ? 'success' : warnings.length ? statusFromFailure(failureCategory) : 'skipped')
      const run: SearchExecutionProviderRun = {
        providerId: metadata.id,
        providerName: metadata.name,
        status,
        readiness,
        capabilities: metadata.capabilities,
        itineraryCount: result.itineraries.length,
        warnings,
        diagnostics: {
          ...(result.diagnostics || {}),
          responseLatencyMs: result.diagnostics?.responseLatencyMs ?? Math.max(0, Date.now() - startedAt),
          recordsReceived: result.diagnostics?.recordsReceived ?? result.itineraries.length,
          recordsNormalized: result.diagnostics?.recordsNormalized ?? result.itineraries.length,
          errorCategory: result.diagnostics?.errorCategory || failureCategory
        }
      }
      return {
        itineraries: result.itineraries,
        run,
        health: healthFromRun({ metadata, readiness, run, startedAt, now: this.now() })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `${metadata.name} provider failed.`
      const failureCategory = classifyProviderFailure(message) || 'provider_warning'
      const status = failureCategory === 'provider_warning' ? 'failed' : statusFromFailure(failureCategory)
      const run: SearchExecutionProviderRun = {
        providerId: metadata.id,
        providerName: metadata.name,
        status,
        readiness,
        capabilities: metadata.capabilities,
        itineraryCount: 0,
        warnings: [message],
        diagnostics: {
          responseLatencyMs: Math.max(0, Date.now() - startedAt),
          recordsReceived: 0,
          recordsNormalized: 0,
          recordsMatched: 0,
          recordsUnmatched: 0,
          errorCategory: failureCategory,
          retryUsed: false,
          fetchedAt: this.now().toISOString(),
          cached: false,
          requestCount: 0
        }
      }
      return {
        itineraries: [],
        run,
        health: healthFromRun({ metadata, readiness, run, startedAt, now: this.now() })
      }
    }
  }

  async execute(request: SearchExecutionRequest) {
    return Promise.all(this.providers.map((provider) => this.runProvider(provider, request)))
  }
}
