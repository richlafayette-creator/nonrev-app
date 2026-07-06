import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { getRecoveryV2Readiness, recoveryV2FeatureFlag } from './recoveryV2Readiness.ts'

function assertNoConfirmedRecoveryClaims(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(lower, /(hotel|room|vehicle|ride)\s+(is\s+|are\s+)?(booked|guaranteed|confirmed)/)
  assert.doesNotMatch(lower, /(you\s+can\s+clear|will\s+clear|should\s+clear)\s+standby/)
}

describe('Recovery Engine v2 readiness guardrails', () => {
  it('is disabled by default and leaves current recovery scoring unchanged', () => {
    const readiness = getRecoveryV2Readiness({
      FLIGHTAWARE_API_KEY: 'configured-but-disabled',
      HOTEL_PROVIDER_API_KEY: 'configured-but-disabled',
      GROUND_TRANSPORT_PROVIDER_API_KEY: 'configured-but-disabled'
    })

    assert.equal(readiness.enabled, false)
    assert.equal(readiness.featureFlagEnvVar, recoveryV2FeatureFlag)
    assert.equal(readiness.currentRecoveryScoringUnchanged, true)
    assert.equal(readiness.liveBookingEnabled, false)
    assert.deepEqual(readiness.enabledSources, [])
    assert.equal(readiness.sources.every((source) => source.status === 'feature-disabled'), true)
    assertNoConfirmedRecoveryClaims([...readiness.diagnostics, ...readiness.limitations].join(' '))
  })

  it('reports configured and manual recovery sources only behind the v2 feature flag', () => {
    const readiness = getRecoveryV2Readiness({
      NONREV_RECOVERY_ENGINE_V2_ENABLED: 'true',
      FLIGHTAWARE_API_KEY: 'flightaware-key',
      HOTEL_PROVIDER_API_KEY: 'hotel-key'
    })
    const bySource = Object.fromEntries(readiness.sources.map((source) => [source.source, source]))

    assert.equal(readiness.enabled, true)
    assert.equal(bySource['Live schedule recovery'].status, 'configured')
    assert.equal(bySource['Hotel recovery'].status, 'configured')
    assert.equal(bySource['Ground transport recovery'].status, 'credential-missing')
    assert.equal(bySource['Alternate airport intelligence'].status, 'manual-source-ready')
    assert.equal(bySource['Weather/disruption recovery'].status, 'manual-source-ready')
    assert.deepEqual(readiness.enabledSources, ['Live schedule recovery', 'Hotel recovery', 'Alternate airport intelligence', 'Weather/disruption recovery'])
  })

  it('keeps recovery v2 advisory-only with no booking or standby-clearance claims', () => {
    const readiness = getRecoveryV2Readiness({ NONREV_RECOVERY_ENGINE_V2_ENABLED: '1' })
    const joined = [
      ...readiness.diagnostics,
      ...readiness.limitations,
      ...readiness.sources.flatMap((source) => [...source.canProvide, ...source.cannotProvide, source.nextAction])
    ].join(' ')

    assert.equal(readiness.advisoryOnly, true)
    assert.equal(readiness.liveBookingEnabled, false)
    assert.equal(readiness.currentRecoveryScoringUnchanged, true)
    assert.match(joined, /does not change current recovery scoring|does not enable booking|advisory/i)
    assert.match(joined, /standby clearance|guaranteed room availability|guaranteed vehicle availability|confirmed reaccommodation/i)
    assertNoConfirmedRecoveryClaims(joined)
  })
})
