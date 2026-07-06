import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildOriginCoverageDiagnostic, nearestSupportedOriginAirports, supportedProviderOriginAirports } from './originCoverage.ts'

describe('origin coverage diagnostics', () => {
  it('detects insufficient requested-origin provider coverage and recommends nearest supported origins', () => {
    const diagnostic = buildOriginCoverageDiagnostic({
      origin: 'MRY',
      destination: 'OGG',
      providerOriginRowCount: 0,
      frameworkRouteCount: 0
    })

    assert.equal(diagnostic.status, 'insufficient')
    assert.equal(diagnostic.origin, 'MRY')
    assert.match(diagnostic.message, /will not fail the request or invent MRY flights/i)
    assert.match(diagnostic.message, /Try nearby supported origins SFO, LAX/i)
    assert.ok(diagnostic.recommendations.length >= 2)
    assert.deepEqual(diagnostic.recommendations.slice(0, 2).map((item) => item.code), ['SFO', 'LAX'])
    assert.equal(diagnostic.recommendations[0].searchQuery, 'SFO → OGG')
    assert.ok(diagnostic.recommendations.every((item) => supportedProviderOriginAirports.has(item.code)))
    assert.ok(diagnostic.limitations.some((item) => /does not confirm standby availability/i.test(item)))
    assert.ok(diagnostic.limitations.some((item) => /No flights are fabricated/i.test(item)))
  })

  it('does not label a supported origin with missing rows as an origin-coverage failure', () => {
    const diagnostic = buildOriginCoverageDiagnostic({
      origin: 'SFO',
      destination: 'OGG',
      providerOriginRowCount: 0,
      frameworkRouteCount: 0
    })

    assert.equal(diagnostic.status, 'sufficient')
    assert.match(diagnostic.message, /SFO is in the supported origin set/i)
    assert.equal(diagnostic.recommendations.length, 0)
  })

  it('does not show alternate-origin guidance when provider rows already include the requested origin', () => {
    const diagnostic = buildOriginCoverageDiagnostic({
      origin: 'SBP',
      destination: 'NRT',
      providerOriginRowCount: 2,
      frameworkRouteCount: 3
    })

    assert.equal(diagnostic.status, 'sufficient')
    assert.match(diagnostic.message, /2 provider rows included requested origin SBP/i)
    assert.equal(diagnostic.recommendations.length, 0)
  })

  it('uses local scaffold distance and mapped hubs for nearby supported airport recommendations', () => {
    const recommendations = nearestSupportedOriginAirports('SBP', 'NRT', 3)

    assert.deepEqual(recommendations.map((item) => item.code), ['LAX', 'SFO', 'SEA'])
    assert.equal(recommendations[0].searchQuery, 'LAX → NRT')
    assert.ok(recommendations[0].distanceMiles && recommendations[0].distanceMiles > 0)
  })
})
