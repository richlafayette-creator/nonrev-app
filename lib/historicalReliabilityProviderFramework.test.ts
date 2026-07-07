import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createHistoricalReliabilityProvider, createHistoricalReliabilityProviderRegistry, getHistoricalReliabilityWithCache, HistoricalReliabilityProviderAdapter, historicalReliabilityProviderAdapterFeatureFlag, historicalReliabilityProviderConfiguration, historicalReliabilityProviderFrameworkFeatureFlag, InMemoryHistoricalReliabilityCacheStore, NullHistoricalReliabilityProvider, type HistoricalReliabilityProvider, type HistoricalReliabilityProviderResult } from './historicalReliabilityProviderFramework.ts'

class TestHistoricalReliabilityProvider implements HistoricalReliabilityProvider {
  readonly providerName = 'TestHistoricalReliabilityProvider'
  readonly featureFlagEnvVar = historicalReliabilityProviderFrameworkFeatureFlag
  readonly status = 'configured' as const
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const

  private readonly handler: () => Promise<HistoricalReliabilityProviderResult>

  constructor(handler: () => Promise<HistoricalReliabilityProviderResult> = async () => ({
    onTimePercentage: 81,
    cancellationPercentage: 2,
    averageDepartureDelay: 14,
    averageArrivalDelay: 11,
    confidenceScore: 67,
    lastUpdated: '2026-07-06T03:43:00.000Z',
    providerName: 'TestHistoricalReliabilityProvider'
  })) {
    this.handler = handler
  }

  async getReliability(): Promise<HistoricalReliabilityProviderResult> {
    return this.handler()
  }
}

function assertNoStandbyClaims(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(lower, /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
}

const enabledEnv = {
  NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: 'true',
  NONREV_HISTORICAL_RELIABILITY_PROVIDER_ADAPTER_ENABLED: 'true'
}

const query = { origin: 'SFO', destination: 'HNL', carrier: 'UA', flightNumber: 'UA100', departureDate: '2026-07-20' }

describe('historical reliability provider framework', () => {
  it('returns null reliability metrics by default without live calls', async () => {
    const provider = createHistoricalReliabilityProvider({ env: {} })
    const result = await provider.getReliability({ origin: 'SFO', destination: 'HNL', carrier: 'UA' })

    assert.equal(provider.providerName, 'NullHistoricalReliabilityProvider')
    assert.equal(provider.featureFlagEnvVar, historicalReliabilityProviderFrameworkFeatureFlag)
    assert.equal(provider.liveCallsEnabled, false)
    assert.equal(provider.advisoryOnly, true)
    assert.deepEqual(result, {
      onTimePercentage: null,
      cancellationPercentage: null,
      averageDepartureDelay: null,
      averageArrivalDelay: null,
      confidenceScore: 0,
      lastUpdated: null,
      providerName: 'NullHistoricalReliabilityProvider'
    })
  })

  it('supports registry and factory lookup only behind the feature flag', async () => {
    const registry = createHistoricalReliabilityProviderRegistry()
    registry.register(new TestHistoricalReliabilityProvider())

    assert.deepEqual(registry.listProviderNames(), ['TestHistoricalReliabilityProvider'])
    assert.equal(createHistoricalReliabilityProvider({ providerName: 'TestHistoricalReliabilityProvider', registry, env: {} }).providerName, 'NullHistoricalReliabilityProvider')

    const provider = createHistoricalReliabilityProvider({
      providerName: 'TestHistoricalReliabilityProvider',
      registry,
      env: { NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: 'true' }
    })
    const result = await provider.getReliability({ origin: 'SFO', destination: 'HNL' })

    assert.equal(provider.providerName, 'TestHistoricalReliabilityProvider')
    assert.equal(result.onTimePercentage, 81)
    assert.equal(result.cancellationPercentage, 2)
    assert.equal(result.averageDepartureDelay, 14)
    assert.equal(result.averageArrivalDelay, 11)
    assert.equal(result.confidenceScore, 67)
  })

  it('exposes future provider configuration plus one adapter without implementing live providers', () => {
    const disabled = historicalReliabilityProviderConfiguration({ FLIGHTAWARE_API_KEY: 'configured-but-disabled' })
    const enabled = historicalReliabilityProviderConfiguration({ NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: '1' })
    const adapterEnabled = historicalReliabilityProviderConfiguration(enabledEnv)
    const notes = [...disabled, ...enabled, ...adapterEnabled].flatMap((provider) => provider.notes).join(' ')

    assert.equal(disabled.every((provider) => provider.liveCallsEnabled === false), true)
    assert.equal(disabled.every((provider) => provider.advisoryOnly === true), true)
    assert.deepEqual(enabled.map((provider) => provider.providerName), [
      'BTSHistoricalReliabilityProvider',
      'FlightAwareHistoricalReliabilityProvider',
      'InternalHistoricalReliabilityProvider',
      'HistoricalReliabilityProviderAdapter'
    ])
    assert.equal(enabled.find((provider) => provider.providerName === 'HistoricalReliabilityProviderAdapter')?.status, 'feature-disabled')
    assert.equal(adapterEnabled.find((provider) => provider.providerName === 'HistoricalReliabilityProviderAdapter')?.status, 'configured')
    assertNoStandbyClaims(notes)
  })

  it('falls back to the null provider for unknown provider names even when enabled', () => {
    const provider = createHistoricalReliabilityProvider({
      providerName: 'UnknownFutureProvider',
      env: { NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: 'true' }
    })

    assert.ok(provider instanceof NullHistoricalReliabilityProvider)
    assert.equal(provider.status, 'feature-disabled')
  })

  it('keeps adapter fetch disabled by feature flag and does not call providers', async () => {
    const store = new InMemoryHistoricalReliabilityCacheStore()
    let called = false
    const result = await getHistoricalReliabilityWithCache({
      query,
      store,
      env: { [historicalReliabilityProviderAdapterFeatureFlag]: 'true' },
      provider: new TestHistoricalReliabilityProvider(async () => {
        called = true
        throw new Error('should not call')
      })
    })

    assert.equal(called, false)
    assert.equal(result.status, 'disabled')
    assert.equal(result.providerCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownNeutral, true)
  })

  it('fetches provider success and writes cache with freshness metadata', async () => {
    const store = new InMemoryHistoricalReliabilityCacheStore()
    const result = await getHistoricalReliabilityWithCache({
      query,
      store,
      env: enabledEnv,
      now: new Date('2026-07-07T04:20:00.000Z'),
      providerName: 'HistoricalReliabilityProviderAdapter'
    })

    assert.equal(result.status, 'fetched')
    assert.equal(result.providerName, 'HistoricalReliabilityProviderAdapter')
    assert.equal(result.providerCallsAttempted, true)
    assert.equal(result.cacheUpdated, true)
    assert.equal(typeof result.result?.onTimePercentage, 'number')
    assert.equal(result.result?.providerName, 'HistoricalReliabilityProviderAdapter')
    assert.equal(result.dataFreshness?.fetchedAt, '2026-07-07T04:20:00.000Z')
    assert.equal(store.get(result.key)?.result.providerName, 'HistoricalReliabilityProviderAdapter')
    assert.ok(result.diagnostics.some((item) => item.code === 'provider_success'))
  })

  it('times out safely without caching or exposing raw provider errors', async () => {
    const store = new InMemoryHistoricalReliabilityCacheStore()
    const result = await getHistoricalReliabilityWithCache({
      query,
      store,
      env: enabledEnv,
      timeoutMs: 1,
      provider: new TestHistoricalReliabilityProvider(async () => new Promise((resolve) => {
        setTimeout(() => resolve({
          onTimePercentage: 99,
          cancellationPercentage: 1,
          averageDepartureDelay: 2,
          averageArrivalDelay: 2,
          confidenceScore: 99,
          lastUpdated: '2026-07-07T04:20:00.000Z',
          providerName: 'TimeoutProvider'
        }), 25)
      }))
    })

    assert.equal(result.status, 'timeout')
    assert.equal(result.providerCallsAttempted, true)
    assert.equal(result.cacheUpdated, false)
    assert.equal(result.result, null)
    assert.equal(result.unknownNeutral, true)
    assert.equal(store.get(result.key), undefined)
    assert.ok(result.diagnostics.some((item) => item.code === 'provider_timeout'))
    assert.doesNotMatch(result.diagnostics.map((item) => item.message).join(' '), /TimeoutProvider|99/)
  })

  it('handles provider unavailable as unknown neutral without cache mutation', async () => {
    const store = new InMemoryHistoricalReliabilityCacheStore()
    const result = await getHistoricalReliabilityWithCache({
      query,
      store,
      env: { ...enabledEnv, NONREV_HISTORICAL_RELIABILITY_PROVIDER_SCENARIO: 'unavailable' },
      providerName: 'HistoricalReliabilityProviderAdapter'
    })

    assert.equal(result.status, 'provider-unavailable')
    assert.equal(result.providerCallsAttempted, true)
    assert.equal(result.cacheUpdated, false)
    assert.equal(result.result?.onTimePercentage, null)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownNeutral, true)
    assert.equal(store.get(result.key), undefined)
    assert.ok(result.diagnostics.some((item) => item.code === 'provider_unknown'))
  })

  it('uses a fresh cache hit without querying the provider', async () => {
    const store = new InMemoryHistoricalReliabilityCacheStore()
    const first = await getHistoricalReliabilityWithCache({
      query,
      store,
      env: enabledEnv,
      now: new Date('2026-07-07T04:20:00.000Z'),
      providerName: 'HistoricalReliabilityProviderAdapter'
    })
    assert.equal(first.status, 'fetched')

    let called = false
    const second = await getHistoricalReliabilityWithCache({
      query,
      store,
      env: enabledEnv,
      now: new Date('2026-07-07T04:30:00.000Z'),
      provider: new TestHistoricalReliabilityProvider(async () => {
        called = true
        throw new Error('cache should skip')
      })
    })

    assert.equal(called, false)
    assert.equal(second.status, 'cache-hit')
    assert.equal(second.providerCallsAttempted, false)
    assert.equal(second.cache.status, 'fresh')
    assert.equal(second.result?.providerName, 'HistoricalReliabilityProviderAdapter')
  })

  it('treats cache miss as provider fetch and keeps null provider fallback neutral', async () => {
    const store = new InMemoryHistoricalReliabilityCacheStore()
    const miss = await getHistoricalReliabilityWithCache({
      query,
      store,
      env: enabledEnv,
      now: new Date('2026-07-07T04:20:00.000Z'),
      providerName: 'HistoricalReliabilityProviderAdapter'
    })

    assert.equal(miss.cache.status, 'missing')
    assert.equal(miss.status, 'fetched')
    assert.equal(miss.cacheUpdated, true)

    const fallback = await getHistoricalReliabilityWithCache({
      query: { ...query, flightNumber: 'UA101' },
      store,
      env: { NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: 'true' },
      providerName: 'HistoricalReliabilityProviderAdapter'
    })

    assert.equal(fallback.status, 'provider-unavailable')
    assert.equal(fallback.providerName, 'NullHistoricalReliabilityProvider')
    assert.equal(fallback.providerCallsAttempted, false)
    assert.equal(fallback.cacheUpdated, false)
    assert.equal(fallback.result, null)
    assert.equal(fallback.unknownNeutral, true)
  })
})
