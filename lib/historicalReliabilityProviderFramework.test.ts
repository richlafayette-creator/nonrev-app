import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createHistoricalReliabilityProvider, createHistoricalReliabilityProviderRegistry, historicalReliabilityProviderConfiguration, historicalReliabilityProviderFrameworkFeatureFlag, NullHistoricalReliabilityProvider, type HistoricalReliabilityProvider, type HistoricalReliabilityProviderResult } from './historicalReliabilityProviderFramework.ts'

class TestHistoricalReliabilityProvider implements HistoricalReliabilityProvider {
  readonly providerName = 'TestHistoricalReliabilityProvider'
  readonly featureFlagEnvVar = historicalReliabilityProviderFrameworkFeatureFlag
  readonly status = 'configured' as const
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const

  async getReliability(): Promise<HistoricalReliabilityProviderResult> {
    return {
      onTimePercentage: 81,
      cancellationPercentage: 2,
      averageDepartureDelay: 14,
      averageArrivalDelay: 11,
      confidenceScore: 67,
      lastUpdated: '2026-07-06T03:43:00.000Z',
      providerName: this.providerName
    }
  }
}

function assertNoStandbyClaims(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(lower, /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
}

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

  it('exposes future provider configuration without implementing live providers', () => {
    const disabled = historicalReliabilityProviderConfiguration({ FLIGHTAWARE_API_KEY: 'config…bled' })
    const enabled = historicalReliabilityProviderConfiguration({ NONREV_HISTORICAL_RELIABILITY_ENGINE_ENABLED: '1' })
    const notes = [...disabled, ...enabled].flatMap((provider) => provider.notes).join(' ')

    assert.equal(disabled.every((provider) => provider.status === 'feature-disabled'), true)
    assert.equal(disabled.every((provider) => provider.liveCallsEnabled === false), true)
    assert.equal(disabled.every((provider) => provider.advisoryOnly === true), true)
    assert.deepEqual(enabled.map((provider) => provider.providerName), [
      'BTSHistoricalReliabilityProvider',
      'FlightAwareHistoricalReliabilityProvider',
      'InternalHistoricalReliabilityProvider'
    ])
    assert.equal(enabled.every((provider) => provider.status === 'not-implemented'), true)
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
})
