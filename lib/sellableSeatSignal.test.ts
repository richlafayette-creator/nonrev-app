import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { commercialAvailabilityProviderFeatureFlag, enabledSellableSeatProviderNames, getSellableSeatProviderReadiness, sellableSeatSignalCaution, sellableSeatSignalLimitations } from './sellableSeatSignal.ts'

describe('sellable seat commercial availability abstraction', () => {
  it('keeps commercial availability providers disabled by default even when credentials exist', () => {
    const readiness = getSellableSeatProviderReadiness({
      DUFFEL_API_KEY: 'configured-but-disabled',
      AMADEUS_API_KEY: 'configured-but-disabled',
      SABRE_API_KEY: 'configured-but-disabled'
    })

    assert.equal(readiness.every((source) => source.status === 'feature-disabled'), true)
    assert.equal(readiness.every((source) => source.featureFlagEnvVar === commercialAvailabilityProviderFeatureFlag), true)
    assert.equal(readiness.every((source) => source.canQueryLiveAvailability === false), true)
    assert.equal(readiness.every((source) => source.proxyOnly === true), true)
    assert.deepEqual(enabledSellableSeatProviderNames({ DUFFEL_API_KEY: 'configured-but-disabled' }), [])
  })

  it('reports credential and manual readiness only behind the commercial availability feature flag', () => {
    const env = {
      NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true',
      DUFFEL_API_KEY: 'duffel-key',
      SABRE_API_KEY: 'sabre-key'
    }
    const readiness = getSellableSeatProviderReadiness(env)
    const byProvider = Object.fromEntries(readiness.map((source) => [source.provider, source]))

    assert.equal(byProvider['duffel-placeholder'].status, 'credential-configured')
    assert.equal(byProvider['amadeus-gds-placeholder'].status, 'credential-missing')
    assert.equal(byProvider['sabre-placeholder'].status, 'credential-configured')
    assert.equal(byProvider['manual-community-placeholder'].status, 'manual-source-ready')
    assert.deepEqual(enabledSellableSeatProviderNames(env), ['duffel-placeholder', 'sabre-placeholder', 'manual-community-placeholder'])
  })

  it('keeps wording proxy-only and avoids confirmed standby or seat claims', () => {
    const readiness = getSellableSeatProviderReadiness({ NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: '1' })
    const joined = [
      ...sellableSeatSignalLimitations,
      ...readiness.flatMap((source) => [...source.canProvide, ...source.cannotProvide, source.nextAction]),
      sellableSeatSignalCaution({ sellableStatus: 'available' } as never)
    ].join(' ').toLowerCase()

    assert.match(joined, /proxy signal only|proxy-only|commercial availability context/)
    assert.match(joined, /does not confirm|confirmed non-rev|confirmed standby availability|not confirmed non-rev availability/)
    assert.doesNotMatch(joined, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
    assert.doesNotMatch(joined, /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
    assert.equal(readiness.every((source) => source.canQueryLiveAvailability === false), true)
  })
})
