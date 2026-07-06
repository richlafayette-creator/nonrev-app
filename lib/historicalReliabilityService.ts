import {
  historicalReliabilityProviderFrameworkFeatureFlag,
  type HistoricalReliabilityProvider,
  type HistoricalReliabilityProviderResult,
  type HistoricalReliabilityQuery
} from './historicalReliabilityProviderFramework'

export type HistoricalReliabilityDataFreshnessStatus = 'feature-disabled' | 'unavailable' | 'unknown' | 'fresh' | 'stale' | 'mixed'

export type HistoricalReliabilityProviderAggregationState =
  | 'feature-disabled'
  | 'available'
  | 'partial'
  | 'unavailable'
  | 'timeout'
  | 'error'
  | 'null-provider'

export type HistoricalReliabilityProviderAggregationStatus = {
  providerName: string
  status: HistoricalReliabilityProviderAggregationState
  configuredStatus: HistoricalReliabilityProvider['status'] | 'missing-provider'
  liveCallsEnabled: false
  advisoryOnly: true
  contributedMetrics: Array<keyof HistoricalReliabilityProviderResult>
  lastUpdated: string | null
  diagnostic: string
}

export type HistoricalReliabilityDataFreshness = {
  status: HistoricalReliabilityDataFreshnessStatus
  latestUpdated: string | null
  oldestUpdated: string | null
  maxAgeMinutes: number | null
  freshProviderCount: number
  staleProviderCount: number
  unknownProviderCount: number
}

export type HistoricalReliabilityAggregatedProviderStatus = {
  status: 'feature-disabled' | 'unavailable' | 'available' | 'partial'
  featureFlagEnvVar: typeof historicalReliabilityProviderFrameworkFeatureFlag
  attemptedProviderCount: number
  successfulProviderCount: number
  partialProviderCount: number
  unavailableProviderCount: number
  timeoutProviderCount: number
  errorProviderCount: number
  providers: HistoricalReliabilityProviderAggregationStatus[]
}

export type HistoricalReliabilityAggregationResult = {
  onTimePercentage: number | null
  cancellationPercentage: number | null
  averageDepartureDelay: number | null
  averageArrivalDelay: number | null
  confidenceScore: number
  dataFreshness: HistoricalReliabilityDataFreshness
  providerStatus: HistoricalReliabilityAggregatedProviderStatus
}

export type HistoricalReliabilityServiceOptions = {
  providers?: Array<HistoricalReliabilityProvider | null | undefined> | null
  env?: Record<string, string | undefined>
  timeoutMs?: number
  freshnessMaxAgeMinutes?: number
  now?: Date
}

type ReliabilityMetricName = 'onTimePercentage' | 'cancellationPercentage' | 'averageDepartureDelay' | 'averageArrivalDelay'

type ProviderOutcome = {
  status: HistoricalReliabilityProviderAggregationStatus
  result?: HistoricalReliabilityProviderResult
}

const reliabilityMetricNames: ReliabilityMetricName[] = [
  'onTimePercentage',
  'cancellationPercentage',
  'averageDepartureDelay',
  'averageArrivalDelay'
]

const defaultTimeoutMs = 1500
const defaultFreshnessMaxAgeMinutes = 90 * 24 * 60

export const neutralHistoricalReliabilityAggregation: HistoricalReliabilityAggregationResult = {
  onTimePercentage: null,
  cancellationPercentage: null,
  averageDepartureDelay: null,
  averageArrivalDelay: null,
  confidenceScore: 0,
  dataFreshness: {
    status: 'unavailable',
    latestUpdated: null,
    oldestUpdated: null,
    maxAgeMinutes: null,
    freshProviderCount: 0,
    staleProviderCount: 0,
    unknownProviderCount: 0
  },
  providerStatus: {
    status: 'unavailable',
    featureFlagEnvVar: historicalReliabilityProviderFrameworkFeatureFlag,
    attemptedProviderCount: 0,
    successfulProviderCount: 0,
    partialProviderCount: 0,
    unavailableProviderCount: 0,
    timeoutProviderCount: 0,
    errorProviderCount: 0,
    providers: []
  }
}

function cloneNeutralResult(status: HistoricalReliabilityAggregatedProviderStatus['status'] = 'unavailable'): HistoricalReliabilityAggregationResult {
  return {
    ...neutralHistoricalReliabilityAggregation,
    dataFreshness: {
      ...neutralHistoricalReliabilityAggregation.dataFreshness,
      status: status === 'feature-disabled' ? 'feature-disabled' : 'unavailable'
    },
    providerStatus: {
      ...neutralHistoricalReliabilityAggregation.providerStatus,
      status,
      providers: []
    }
  }
}

function featureEnabled(env: Record<string, string | undefined>) {
  const value = String(env[historicalReliabilityProviderFrameworkFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function boundedNumber(value: unknown, min = 0, max = 100) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(min, Math.min(max, value))
}

function roundMetric(value: number | null) {
  return typeof value === 'number' ? Number(value.toFixed(2)) : null
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function providerName(provider: HistoricalReliabilityProvider | null | undefined) {
  return provider?.providerName || 'MissingHistoricalReliabilityProvider'
}

function isProviderResult(value: unknown): value is HistoricalReliabilityProviderResult {
  return typeof value === 'object' && value !== null
}

function contributedMetrics(result?: HistoricalReliabilityProviderResult): ReliabilityMetricName[] {
  if (!result) return []
  return reliabilityMetricNames.filter((metric) => typeof result[metric] === 'number' && Number.isFinite(result[metric]))
}

function providerResultStatus(provider: HistoricalReliabilityProvider, result: HistoricalReliabilityProviderResult): HistoricalReliabilityProviderAggregationState {
  if (provider.providerName === 'NullHistoricalReliabilityProvider') return 'null-provider'
  const metrics = contributedMetrics(result)
  if (!metrics.length) return 'unavailable'
  if (metrics.length < reliabilityMetricNames.length) return 'partial'
  return 'available'
}

function providerUnavailableStatus(
  provider: HistoricalReliabilityProvider | null | undefined,
  status: HistoricalReliabilityProviderAggregationState,
  diagnostic: string
): HistoricalReliabilityProviderAggregationStatus {
  return {
    providerName: providerName(provider),
    status,
    configuredStatus: provider?.status || 'missing-provider',
    liveCallsEnabled: false,
    advisoryOnly: true,
    contributedMetrics: [],
    lastUpdated: null,
    diagnostic
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('historical-reliability-provider-timeout')), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function parseUpdated(value: string | null) {
  const time = Date.parse(String(value || ''))
  return Number.isFinite(time) ? time : null
}

function freshnessFromOutcomes(outcomes: ProviderOutcome[], now: Date, freshnessMaxAgeMinutes: number): HistoricalReliabilityDataFreshness {
  const successfulOutcomes = outcomes.filter((outcome) => outcome.result && (outcome.status.status === 'available' || outcome.status.status === 'partial'))
  const updatedTimes = successfulOutcomes
    .map((outcome) => parseUpdated(outcome.result?.lastUpdated || null))
    .filter((value): value is number => typeof value === 'number')

  if (!successfulOutcomes.length) {
    return { ...neutralHistoricalReliabilityAggregation.dataFreshness }
  }

  if (!updatedTimes.length) {
    return {
      status: 'unknown',
      latestUpdated: null,
      oldestUpdated: null,
      maxAgeMinutes: null,
      freshProviderCount: 0,
      staleProviderCount: 0,
      unknownProviderCount: successfulOutcomes.length
    }
  }

  const nowMs = now.getTime()
  const ages = updatedTimes.map((time) => Math.max(0, (nowMs - time) / 60000))
  const freshProviderCount = ages.filter((age) => age <= freshnessMaxAgeMinutes).length
  const staleProviderCount = ages.filter((age) => age > freshnessMaxAgeMinutes).length
  const unknownProviderCount = successfulOutcomes.length - updatedTimes.length
  const latestUpdated = new Date(Math.max(...updatedTimes)).toISOString()
  const oldestUpdated = new Date(Math.min(...updatedTimes)).toISOString()
  const maxAgeMinutes = Number(Math.max(...ages).toFixed(2))
  const status: HistoricalReliabilityDataFreshnessStatus = unknownProviderCount > 0 || (freshProviderCount > 0 && staleProviderCount > 0)
    ? 'mixed'
    : staleProviderCount > 0
      ? 'stale'
      : 'fresh'

  return {
    status,
    latestUpdated,
    oldestUpdated,
    maxAgeMinutes,
    freshProviderCount,
    staleProviderCount,
    unknownProviderCount
  }
}

function aggregateProviderStatus(outcomes: ProviderOutcome[]): HistoricalReliabilityAggregatedProviderStatus {
  const providers = outcomes.map((outcome) => outcome.status)
  const successfulProviderCount = providers.filter((provider) => provider.status === 'available' || provider.status === 'partial').length
  const partialProviderCount = providers.filter((provider) => provider.status === 'partial').length
  const unavailableProviderCount = providers.filter((provider) => provider.status === 'unavailable' || provider.status === 'null-provider').length
  const timeoutProviderCount = providers.filter((provider) => provider.status === 'timeout').length
  const errorProviderCount = providers.filter((provider) => provider.status === 'error').length
  const aggregateStatus: HistoricalReliabilityAggregatedProviderStatus['status'] = successfulProviderCount === 0
    ? 'unavailable'
    : successfulProviderCount < providers.length || partialProviderCount > 0
      ? 'partial'
      : 'available'

  return {
    status: aggregateStatus,
    featureFlagEnvVar: historicalReliabilityProviderFrameworkFeatureFlag,
    attemptedProviderCount: providers.filter((provider) => provider.configuredStatus === 'configured' && provider.status !== 'null-provider').length,
    successfulProviderCount,
    partialProviderCount,
    unavailableProviderCount,
    timeoutProviderCount,
    errorProviderCount,
    providers
  }
}

export class HistoricalReliabilityService {
  private readonly providers: Array<HistoricalReliabilityProvider | null | undefined>
  private readonly env: Record<string, string | undefined>
  private readonly timeoutMs: number
  private readonly freshnessMaxAgeMinutes: number
  private readonly now: Date

  constructor(options: HistoricalReliabilityServiceOptions = {}) {
    this.providers = options.providers || []
    this.env = options.env || process.env
    this.timeoutMs = Math.max(1, options.timeoutMs || defaultTimeoutMs)
    this.freshnessMaxAgeMinutes = Math.max(0, options.freshnessMaxAgeMinutes || defaultFreshnessMaxAgeMinutes)
    this.now = options.now || new Date()
  }

  async aggregate(query: HistoricalReliabilityQuery): Promise<HistoricalReliabilityAggregationResult> {
    if (!featureEnabled(this.env)) return cloneNeutralResult('feature-disabled')
    if (!this.providers.length) return cloneNeutralResult('unavailable')

    const outcomes = await Promise.all(this.providers.map((provider) => this.queryProvider(provider, query)))
    const providerStatus = aggregateProviderStatus(outcomes)
    const contributingResults = outcomes
      .filter((outcome) => outcome.result && (outcome.status.status === 'available' || outcome.status.status === 'partial'))
      .map((outcome) => outcome.result as HistoricalReliabilityProviderResult)

    if (!contributingResults.length) {
      return {
        ...cloneNeutralResult('unavailable'),
        providerStatus
      }
    }

    const metricAverage = (metric: ReliabilityMetricName) => roundMetric(average(contributingResults
      .map((result) => boundedNumber(result[metric]))
      .filter((value): value is number => typeof value === 'number')))
    const confidenceScore = Math.round(average(contributingResults
      .map((result) => boundedNumber(result.confidenceScore))
      .filter((value): value is number => typeof value === 'number')) || 0)

    return {
      onTimePercentage: metricAverage('onTimePercentage'),
      cancellationPercentage: metricAverage('cancellationPercentage'),
      averageDepartureDelay: metricAverage('averageDepartureDelay'),
      averageArrivalDelay: metricAverage('averageArrivalDelay'),
      confidenceScore,
      dataFreshness: freshnessFromOutcomes(outcomes, this.now, this.freshnessMaxAgeMinutes),
      providerStatus
    }
  }

  private async queryProvider(provider: HistoricalReliabilityProvider | null | undefined, query: HistoricalReliabilityQuery): Promise<ProviderOutcome> {
    if (!provider) {
      return { status: providerUnavailableStatus(provider, 'null-provider', 'No historical reliability provider was supplied.') }
    }

    if (provider.providerName === 'NullHistoricalReliabilityProvider') {
      return { status: providerUnavailableStatus(provider, 'null-provider', 'Null provider returned neutral historical reliability.') }
    }

    if (provider.status !== 'configured') {
      return { status: providerUnavailableStatus(provider, 'unavailable', `Provider is not configured for aggregation (${provider.status}).`) }
    }

    try {
      const result = await withTimeout(provider.getReliability(query), this.timeoutMs)
      if (!isProviderResult(result)) {
        return {
          status: providerUnavailableStatus(provider, 'unavailable', 'Provider returned no usable historical reliability payload.')
        }
      }

      const status = providerResultStatus(provider, result)
      const metrics = contributedMetrics(result)
      return {
        result: metrics.length ? result : undefined,
        status: {
          providerName: result.providerName || provider.providerName,
          status,
          configuredStatus: provider.status,
          liveCallsEnabled: false,
          advisoryOnly: true,
          contributedMetrics: metrics,
          lastUpdated: result.lastUpdated,
          diagnostic: status === 'available'
            ? 'Provider contributed all historical reliability metrics.'
            : status === 'partial'
              ? 'Provider contributed partial historical reliability metrics; missing values remain neutral.'
              : 'Provider returned no historical reliability metrics.'
        }
      }
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'historical-reliability-provider-timeout'
      return {
        status: providerUnavailableStatus(
          provider,
          isTimeout ? 'timeout' : 'error',
          isTimeout ? 'Provider timed out; neutral historical reliability used.' : 'Provider failed; neutral historical reliability used.'
        )
      }
    }
  }
}

export function createHistoricalReliabilityService(options: HistoricalReliabilityServiceOptions = {}) {
  return new HistoricalReliabilityService(options)
}
