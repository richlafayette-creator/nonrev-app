import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { enabledHistoricalReliabilityProviderNames, getHistoricalReliabilityProviderReadiness, historicalReliabilityProviderFeatureFlag } from './historicalReliabilityProvider.ts'

describe('historical reliability provider readiness', () => {
  it('keeps every provider disabled and advisory-only until the feature flag is enabled', () => {
    const readiness = getHistoricalReliabilityProviderReadiness({
      FLIGHTAWARE_API_KEY: 'configured-but-disabled',
      CIRIUM_API_KEY: 'configured-but-disabled',
      AVIATIONSTACK_API_KEY: 'configured-but-disabled'
    })

    assert.equal(readiness.length >= 5, true)
    assert.equal(enabledHistoricalReliabilityProviderNames({ FLIGHTAWARE_API_KEY: 'configured-but-disabled' }).length, 0)
    assert.equal(readiness.every((source) => source.status === 'feature-disabled'), true)
    assert.equal(readiness.every((source) => source.featureFlagEnvVar === historicalReliabilityProviderFeatureFlag), true)
    assert.equal(readiness.every((source) => source.liveCallsEnabled === false), true)
    assert.equal(readiness.every((source) => source.advisoryOnly === true), true)
  })

  it('reports credential and public/internal readiness only when explicitly enabled', () => {
    const readiness = getHistoricalReliabilityProviderReadiness({
      NONREV_HISTORICAL_RELIABILITY_PROVIDER_ENABLED: 'true',
      FLIGHTAWARE_API_KEY: 'flightaware-key',
      AVIATIONSTACK_API_KEY: 'aviationstack-key'
    })
    const byProvider = Object.fromEntries(readiness.map((source) => [source.provider, source]))

    assert.equal(byProvider['FAA BTS'].status, 'public-source-ready')
    assert.equal(byProvider['FlightAware historical'].status, 'credential-configured')
    assert.equal(byProvider.Cirium.status, 'credential-missing')
    assert.equal(byProvider.AviationStack.status, 'credential-configured')
    assert.equal(byProvider['Internal analytics'].status, 'internal-source-ready')
    assert.deepEqual(enabledHistoricalReliabilityProviderNames({
      NONREV_HISTORICAL_RELIABILITY_PROVIDER_ENABLED: 'true',
      FLIGHTAWARE_API_KEY: 'flightaware-key',
      AVIATIONSTACK_API_KEY: 'aviationstack-key'
    }), ['FAA BTS', 'FlightAware historical', 'AviationStack', 'Internal analytics'])
  })

  it('documents provider limits without promising standby or seat availability', () => {
    const readiness = getHistoricalReliabilityProviderReadiness({ NONREV_HISTORICAL_RELIABILITY_PROVIDER_ENABLED: '1' })
    const joined = readiness.flatMap((source) => [...source.canProvide, ...source.cannotProvide, source.nextAction]).join(' ').toLowerCase()

    assert.match(joined, /advisory|historical|context/)
    assert.match(joined, /confirmed standby availability|seat inventory|load factors|guaranteed/)
    assert.doesNotMatch(joined, /scrape airline|airline website|standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
    assert.equal(readiness.every((source) => source.liveCallsEnabled === false), true)
  })
})
