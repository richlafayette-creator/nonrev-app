import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { enabledGroundTransportProviderNames, getGroundTransportProviderReadiness, groundTransportProviderFeatureFlag } from './groundTransportReadiness.ts'

function assertNoGuaranteedTransportClaims(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /(vehicle|ride|car|pickup|driver)\s+(is\s+|are\s+)?(available|booked|guaranteed|confirmed|assigned)/)
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
}

describe('ground transport provider readiness', () => {
  it('keeps ground transport providers disabled by default even when credentials exist', () => {
    const readiness = getGroundTransportProviderReadiness({
      RIDESHARE_PROVIDER_API_KEY: 'configured-but-disabled',
      RENTAL_CAR_PROVIDER_API_KEY: 'configured-but-disabled',
      TRANSIT_PROVIDER_API_KEY: 'configured-but-disabled'
    })

    assert.equal(readiness.every((source) => source.status === 'feature-disabled'), true)
    assert.equal(readiness.every((source) => source.featureFlagEnvVar === groundTransportProviderFeatureFlag), true)
    assert.equal(readiness.every((source) => source.advisoryOnly === true), true)
    assert.equal(readiness.every((source) => source.bookingEnabled === false), true)
    assert.deepEqual(enabledGroundTransportProviderNames({ RIDESHARE_PROVIDER_API_KEY: 'configured-but-disabled' }), [])
  })

  it('reports credential and manual readiness only behind the ground transport feature flag', () => {
    const env = {
      NONREV_GROUND_TRANSPORT_PROVIDER_ENABLED: 'true',
      RIDESHARE_PROVIDER_API_KEY: 'rideshare-key',
      TRANSIT_PROVIDER_API_KEY: 'transit-key'
    }
    const readiness = getGroundTransportProviderReadiness(env)
    const byProvider = Object.fromEntries(readiness.map((source) => [source.provider, source]))

    assert.equal(byProvider['Rideshare proxy'].status, 'credential-configured')
    assert.equal(byProvider['Rental car proxy'].status, 'credential-missing')
    assert.equal(byProvider['Public transit proxy'].status, 'credential-configured')
    assert.equal(byProvider['Manual pickup note'].status, 'manual-source-ready')
    assert.deepEqual(enabledGroundTransportProviderNames(env), ['Rideshare proxy', 'Public transit proxy', 'Manual pickup note'])
  })

  it('keeps ground transport read-only without booking or availability guarantees', () => {
    const readiness = getGroundTransportProviderReadiness({ NONREV_GROUND_TRANSPORT_PROVIDER_ENABLED: '1' })
    const joined = readiness.flatMap((source) => [...source.canProvide, ...source.cannotProvide, source.nextAction]).join(' ')

    assert.match(joined, /read-only|advisory planning context|cannot book rides/i)
    assert.match(joined, /guaranteed vehicle availability|booked rides|guaranteed pickup times|standby clearance/i)
    assert.equal(readiness.every((source) => source.bookingEnabled === false), true)
    assert.equal(readiness.every((source) => source.advisoryOnly === true), true)
    assertNoGuaranteedTransportClaims(joined)
  })
})
