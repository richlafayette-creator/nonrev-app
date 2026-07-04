import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { ensureRouteFrameworkLabels, isRouteFrameworkLabeled, liveAvailabilityUnavailableBadge, routeFrameworkDataFreshnessLabel, routeFrameworkOnlyBadge, routeFrameworkProviderBadges, routeFrameworkSourceLabel, routeFrameworkWarning } from './routeFrameworkLabels.ts'

describe('route framework labels', () => {
  it('enforces API-boundary labels that cannot be mistaken for live availability', () => {
    const labeled = ensureRouteFrameworkLabels({
      route: 'SBP → LAX → NRT',
      source: 'route-framework',
      sourceProvider: 'route-framework',
      dataFreshnessRule: 'route-framework',
      dataFreshnessLabel: 'Live availability unavailable',
      providerBadges: ['Historical route signal'],
      productionAvailability: true,
      status: 'Ranked option',
      legs: [
        { source: 'route-framework', sourceProvider: 'route-framework', status: 'Waiting', flightNumber: '', departureTime: '', arrivalTime: '' }
      ]
    } as Parameters<typeof ensureRouteFrameworkLabels>[0])

    assert.equal(labeled.dataFreshnessLabel, routeFrameworkDataFreshnessLabel)
    assert.equal(labeled.dataFreshnessRule, 'route-framework')
    assert.equal(labeled.dataFreshnessWarning, routeFrameworkWarning)
    assert.equal(labeled.productionAvailability, false)
    assert.equal(labeled.source, 'route-framework')
    assert.equal(labeled.sourceProvider, 'route-framework')
    assert.ok(labeled.providerBadges?.includes(routeFrameworkOnlyBadge))
    assert.ok(labeled.providerBadges?.includes(liveAvailabilityUnavailableBadge))
    assert.match(labeled.status || '', /planning guidance|not live availability/i)
    assert.equal(labeled.legs?.[0].flightNumber, 'Flight numbers unavailable')
    assert.equal(labeled.legs?.[0].departureTime, 'Pending live schedule')
    assert.equal(labeled.legs?.[0].arrivalTime, 'Pending live schedule')
  })

  it('enforces UI-boundary labels on framework comparisons', () => {
    const labeled = ensureRouteFrameworkLabels({
      route: 'SBP → SFO → NRT',
      dataFreshnessRule: 'route-framework',
      isLive: true,
      providerBadges: []
    } as Parameters<typeof ensureRouteFrameworkLabels>[0])

    assert.equal(labeled.isLive, false)
    assert.equal(labeled.dataFreshnessLabel, routeFrameworkDataFreshnessLabel)
    assert.deepEqual(labeled.providerBadges, routeFrameworkProviderBadges())
    assert.equal(routeFrameworkSourceLabel.includes('live availability unavailable'), true)
  })

  it('does not rewrite non-framework scheduled itineraries', () => {
    const scheduled = {
      source: 'flightaware',
      sourceProvider: 'flightaware',
      dataFreshnessRule: 'exact-requested-date',
      productionAvailability: true,
      isLive: true,
      providerBadges: ['Live provider API data']
    }

    assert.equal(isRouteFrameworkLabeled(scheduled), false)
    assert.deepEqual(ensureRouteFrameworkLabels(scheduled), scheduled)
  })
})
