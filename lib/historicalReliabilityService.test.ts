import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { historicalReliabilityProviderFrameworkFeatureFlag, NullHistoricalReliabilityProvider, type HistoricalReliabilityProvider, type HistoricalReliabilityProviderResult } from './historicalReliabilityProviderFramework.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createHistoricalReliabilityService, neutralHistoricalReliabilityAggregation } from './historicalReliabilityService.ts'

class TestHistoricalReliabilityProvider implements HistoricalReliabilityProvider {
  readonly featureFlagEnvVar = historicalReliabilityProviderFrameworkFeatureFlag
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const

  constructor(
    readonly providerName: string,
    readonly status: HistoricalReliabilityProvider['status'],
    private readonly handler: () => Promise<HistoricalReliabilityProviderResult>
  ) {}

  async getReliability(): Promise<HistoricalReliabilityProviderResult> {
    return this.handler()
  }
}

function providerResult(input: Partial<HistoricalReliabilityProviderResult> & { providerName: string }): HistoricalReliabilityProviderResult {
  return {
    onTimePercentage: null,
    cancellationPercentage: null,
    averageDepartureDelay: null,
    averageArrivalDelay: null,
    confidenceScore: 0,
    lastUpdated: null,
    ...input
  }
}

function configuredProvider(providerName: string, result: HistoricalReliabilityProviderResult) {
  return new TestHistoricalReliabilityProvider(providerName, 'configured', async () => result)
}

describe('HistoricalReliabilityService', () => {
  it('is fully feature-flagged and does not call providers while disabled', async () => {
    let called = false
    const provider = new TestHistoricalReliabilityProvider('DisabledProvider', 'configured', async () => {
      called = true
      return providerResult({ providerName: 'DisabledProvider', onTimePercentage: 99, confidenceScore: 99 })
    })

    const result = await createHistoricalReliabilityService({ providers: [provider], env: {} }).aggregate({ origin: 'SFO', destination: 'HNL' })

    assert.equal(called, false)
    assert.deepEqual(result, {
      ...neutralHistoricalReliabilityAggregation,
      dataFreshness: { ...neutralHistoricalReliabilityAggregation.dataFreshness, status: 'feature-disabled' },
      providerStatus: { ...neutralHistoricalReliabilityAggregation.providerStatus, status: 'feature-disabled' }
    })
  })

  it('aggregates complete configured provider responses without changing planner/scoring behavior', async () => {
    const result = await createHistoricalReliabilityService({
      env: { NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: 'true' },
      now: new Date('2026-07-06T04:15:00.000Z'),
      providers: [
        configuredProvider('ProviderA', providerResult({
          providerName: 'ProviderA',
          onTimePercentage: 80,
          cancellationPercentage: 4,
          averageDepartureDelay: 20,
          averageArrivalDelay: 14,
          confidenceScore: 70,
          lastUpdated: '2026-07-06T03:45:00.000Z'
        })),
        configuredProvider('ProviderB', providerResult({
          providerName: 'ProviderB',
          onTimePercentage: 90,
          cancellationPercentage: 2,
          averageDepartureDelay: 10,
          averageArrivalDelay: 6,
          confidenceScore: 90,
          lastUpdated: '2026-07-06T04:00:00.000Z'
        }))
      ]
    }).aggregate({ origin: 'SFO', destination: 'HNL', carrier: 'UA' })

    assert.equal(result.onTimePercentage, 85)
    assert.equal(result.cancellationPercentage, 3)
    assert.equal(result.averageDepartureDelay, 15)
    assert.equal(result.averageArrivalDelay, 10)
    assert.equal(result.confidenceScore, 80)
    assert.equal(result.dataFreshness.status, 'fresh')
    assert.equal(result.dataFreshness.latestUpdated, '2026-07-06T04:00:00.000Z')
    assert.equal(result.dataFreshness.freshProviderCount, 2)
    assert.equal(result.providerStatus.status, 'available')
    assert.equal(result.providerStatus.successfulProviderCount, 2)
    assert.equal(result.providerStatus.providers.every((provider) => provider.liveCallsEnabled === false), true)
    assert.equal(result.providerStatus.providers.every((provider) => provider.advisoryOnly === true), true)
  })

  it('keeps missing partial-provider metrics neutral instead of fabricating values', async () => {
    const result = await createHistoricalReliabilityService({
      env: { NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: '1' },
      now: new Date('2026-07-06T04:15:00.000Z'),
      providers: [
        configuredProvider('CompleteProvider', providerResult({
          providerName: 'CompleteProvider',
          onTimePercentage: 80,
          cancellationPercentage: 4,
          averageDepartureDelay: 20,
          averageArrivalDelay: 10,
          confidenceScore: 70,
          lastUpdated: '2026-07-06T03:15:00.000Z'
        })),
        configuredProvider('PartialProvider', providerResult({
          providerName: 'PartialProvider',
          onTimePercentage: 90,
          averageArrivalDelay: 30,
          confidenceScore: 50,
          lastUpdated: '2026-07-06T03:30:00.000Z'
        }))
      ]
    }).aggregate({ origin: 'SFO', destination: 'OGG' })

    assert.equal(result.onTimePercentage, 85)
    assert.equal(result.cancellationPercentage, 4)
    assert.equal(result.averageDepartureDelay, 20)
    assert.equal(result.averageArrivalDelay, 20)
    assert.equal(result.confidenceScore, 60)
    assert.equal(result.providerStatus.status, 'partial')
    assert.equal(result.providerStatus.partialProviderCount, 1)
    assert.deepEqual(result.providerStatus.providers.find((provider) => provider.providerName === 'PartialProvider')?.contributedMetrics, [
      'onTimePercentage',
      'averageArrivalDelay'
    ])
  })

  it('handles null, missing, and unavailable providers with neutral values', async () => {
    let called = false
    const unavailableProvider = new TestHistoricalReliabilityProvider('CredentialMissingProvider', 'credential-missing', async () => {
      called = true
      return providerResult({ providerName: 'CredentialMissingProvider', onTimePercentage: 75 })
    })

    const result = await createHistoricalReliabilityService({
      env: { NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: 'yes' },
      providers: [null, undefined, new NullHistoricalReliabilityProvider(), unavailableProvider]
    }).aggregate({ origin: 'SBP', destination: 'NRT' })

    assert.equal(called, false)
    assert.equal(result.onTimePercentage, null)
    assert.equal(result.cancellationPercentage, null)
    assert.equal(result.averageDepartureDelay, null)
    assert.equal(result.averageArrivalDelay, null)
    assert.equal(result.confidenceScore, 0)
    assert.equal(result.dataFreshness.status, 'unavailable')
    assert.equal(result.providerStatus.status, 'unavailable')
    assert.equal(result.providerStatus.unavailableProviderCount, 4)
    assert.deepEqual(result.providerStatus.providers.map((provider) => provider.status), [
      'null-provider',
      'null-provider',
      'null-provider',
      'unavailable'
    ])
  })

  it('handles timeouts and errors while preserving available provider data', async () => {
    const timeoutProvider = new TestHistoricalReliabilityProvider('TimeoutProvider', 'configured', async () => new Promise((resolve) => {
      setTimeout(() => resolve(providerResult({ providerName: 'TimeoutProvider', onTimePercentage: 100, confidenceScore: 100 })), 25)
    }))
    const errorProvider = new TestHistoricalReliabilityProvider('ErrorProvider', 'configured', async () => {
      throw new Error('provider secret should not be surfaced')
    })

    const result = await createHistoricalReliabilityService({
      env: { NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: 'on' },
      timeoutMs: 1,
      providers: [
        configuredProvider('AvailableProvider', providerResult({
          providerName: 'AvailableProvider',
          onTimePercentage: 70,
          cancellationPercentage: 8,
          averageDepartureDelay: 22,
          averageArrivalDelay: 18,
          confidenceScore: 55,
          lastUpdated: '2026-07-06T04:00:00.000Z'
        })),
        timeoutProvider,
        errorProvider
      ]
    }).aggregate({ origin: 'LAX', destination: 'OGG' })

    assert.equal(result.onTimePercentage, 70)
    assert.equal(result.cancellationPercentage, 8)
    assert.equal(result.averageDepartureDelay, 22)
    assert.equal(result.averageArrivalDelay, 18)
    assert.equal(result.confidenceScore, 55)
    assert.equal(result.providerStatus.status, 'partial')
    assert.equal(result.providerStatus.timeoutProviderCount, 1)
    assert.equal(result.providerStatus.errorProviderCount, 1)
    assert.deepEqual(result.providerStatus.providers.map((provider) => provider.status), ['available', 'timeout', 'error'])
    assert.doesNotMatch(result.providerStatus.providers.map((provider) => provider.diagnostic).join(' '), /secret/)
  })

  it('reports stale and unknown freshness without altering neutral metric semantics', async () => {
    const result = await createHistoricalReliabilityService({
      env: { NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: 'true' },
      now: new Date('2026-07-06T04:15:00.000Z'),
      freshnessMaxAgeMinutes: 60,
      providers: [
        configuredProvider('StaleProvider', providerResult({
          providerName: 'StaleProvider',
          onTimePercentage: 76,
          confidenceScore: 40,
          lastUpdated: '2026-07-06T02:00:00.000Z'
        })),
        configuredProvider('UnknownFreshnessProvider', providerResult({
          providerName: 'UnknownFreshnessProvider',
          cancellationPercentage: 5,
          confidenceScore: 30,
          lastUpdated: null
        }))
      ]
    }).aggregate({ origin: 'EWR', destination: 'SFO' })

    assert.equal(result.onTimePercentage, 76)
    assert.equal(result.cancellationPercentage, 5)
    assert.equal(result.averageDepartureDelay, null)
    assert.equal(result.averageArrivalDelay, null)
    assert.equal(result.dataFreshness.status, 'mixed')
    assert.equal(result.dataFreshness.staleProviderCount, 1)
    assert.equal(result.dataFreshness.unknownProviderCount, 1)
  })
})
