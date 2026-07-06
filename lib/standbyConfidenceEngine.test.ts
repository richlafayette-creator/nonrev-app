import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { calculateStandbyConfidence, standbyConfidenceEngineFeatureFlag } from './standbyConfidenceEngine.ts'

function assertNoConfirmedStandbyClaims(text: string) {
  assert.doesNotMatch(text.toLowerCase(), /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(text.toLowerCase(), /(you\s+can\s+clear|will\s+clear|should\s+clear)\s+standby/)
  assert.doesNotMatch(text.toLowerCase(), /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
}

describe('standby confidence engine guardrails', () => {
  it('is disabled by default and never confirms clearance', () => {
    const result = calculateStandbyConfidence({
      route: 'SFO → HNL',
      routeConfidenceScore: 82,
      loadDataStatus: 'verified',
      seatsAvailable: 20,
      standbyCount: 2
    }, {})

    assert.equal(result.status, 'disabled')
    assert.equal(result.score, null)
    assert.equal(result.displayValue, 'Disabled')
    assert.equal(result.featureFlagEnvVar, standbyConfidenceEngineFeatureFlag)
    assert.equal(result.advisoryOnly, true)
    assert.equal(result.confirmedClearance, false)
    assert.equal(result.standbyAvailabilityConfirmed, false)
    assertNoConfirmedStandbyClaims([...result.reasons, ...result.limitations].join(' '))
  })

  it('requires trusted structured load data before showing an advisory score', () => {
    const result = calculateStandbyConfidence({
      route: 'SFO → HNL',
      routeConfidenceScore: 82,
      loadDataStatus: 'stale',
      seatsAvailable: 20,
      standbyCount: 2,
      recoveryStrength: 'Strong'
    }, { NONREV_STANDBY_CONFIDENCE_ENGINE_ENABLED: 'true' })

    assert.equal(result.status, 'needs-load')
    assert.equal(result.score, null)
    assert.equal(result.displayValue, 'Needs Load')
    assert.equal(result.confirmedClearance, false)
    assert.equal(result.standbyAvailabilityConfirmed, false)
    assert.match(result.reasons.join(' '), /requires trusted structured seat and standby counts/i)
    assertNoConfirmedStandbyClaims([...result.reasons, ...result.limitations].join(' '))
  })

  it('returns capped advisory planning confidence without confirmed standby availability', () => {
    const result = calculateStandbyConfidence({
      route: 'SFO → HNL',
      routeConfidenceScore: 94,
      loadDataStatus: 'verified',
      seatsAvailable: 28,
      standbyCount: 2,
      communityReportCount: 6,
      recoveryStrength: 'Strong',
      historicalReliabilityScore: 95
    }, { NONREV_STANDBY_CONFIDENCE_ENGINE_ENABLED: '1' })

    assert.equal(result.status, 'advisory')
    assert.equal(result.label, 'Advisory planning confidence')
    assert.equal(result.score, 88)
    assert.equal(result.displayValue, '88/100 advisory')
    assert.equal(result.confirmedClearance, false)
    assert.equal(result.standbyAvailabilityConfirmed, false)
    assert.equal(result.appliesToBookingDecision, false)
    assert.match(result.limitations.join(' '), /never confirms standby clearance/i)
    assertNoConfirmedStandbyClaims([...result.reasons, ...result.limitations, result.displayValue].join(' '))
  })
})
