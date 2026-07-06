import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { ensureRouteFrameworkLabels, routeFrameworkProviderBadges, routeFrameworkWarning, type RouteFrameworkLabeledItem } from './routeFrameworkLabels.ts'

function assertNoPositiveStandbyClaim(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(lower, /(you\s+can\s+clear|will\s+clear|should\s+clear)\s+standby/)
  assert.doesNotMatch(lower, /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
}

describe('route framework certainty labels', () => {
  it('keeps route-framework badges deterministic and de-duplicated', () => {
    assert.deepEqual(routeFrameworkProviderBadges(['Route framework only', 'Custom']), [
      'Route framework only',
      'Live availability unavailable',
      'Custom'
    ])
  })

  it('uses guardrail wording that withholds live availability and standby clearance claims', () => {
    assert.match(routeFrameworkWarning, /planning guidance, not live availability/i)
    assert.match(routeFrameworkWarning, /flight numbers, times, loads, and standby clearance remain unavailable/i)
    assertNoPositiveStandbyClaim(routeFrameworkWarning)
  })

  it('applies route-framework labels consistently to itinerary and leg display fields', () => {
    const item: RouteFrameworkLabeledItem = {
      source: 'route-framework',
      sourceProvider: 'route-framework',
      productionAvailability: true,
      isLive: true,
      providerBadges: ['Custom'],
      legs: [
        { source: 'route-framework', sourceProvider: 'route-framework', status: '', flightNumber: '', departureTime: '', arrivalTime: '' }
      ]
    }
    const labeled = ensureRouteFrameworkLabels(item)

    assert.equal(labeled.productionAvailability, false)
    assert.equal(labeled.isLive, false)
    assert.equal(labeled.dataFreshnessWarning, routeFrameworkWarning)
    assert.deepEqual(labeled.providerBadges, ['Route framework only', 'Live availability unavailable', 'Custom'])
    assert.equal(labeled.legs?.[0]?.flightNumber, 'Flight numbers unavailable')
    assert.equal(labeled.legs?.[0]?.departureTime, 'Pending live schedule')
    assertNoPositiveStandbyClaim([labeled.status, labeled.dataFreshnessWarning, labeled.legs?.[0]?.status].join(' '))
  })
})
