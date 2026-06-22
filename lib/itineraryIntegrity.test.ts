import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { enforceItineraryEndpointIntegrity, enforceItineraryListEndpointIntegrity } from './itineraryIntegrity.ts'
import type { ItineraryResult, ParsedItineraryRequest } from './itinerarySearch.ts'

function request(destination: string): ParsedItineraryRequest {
  return {
    origin: 'SBP',
    destination,
    carrier: 'all',
    maxLegs: 2,
    parserConfidence: 99,
    parserExplanation: 'test request',
    parserFallbackApplied: false
  }
}

function providerItinerary(origin: string, destination: string): ItineraryResult {
  const route = `${origin} → ${destination}`
  return {
    id: `provider-${origin}-${destination}`,
    route,
    legs: [{
      id: `leg-${origin}-${destination}`,
      route,
      origin,
      destination,
      carrier: 'Provider Airline',
      flightNumber: 'PA123',
      operatingFlightNumber: 'PA123',
      marketingFlightNumbers: [],
      departureTime: '2026-06-28T08:00:00Z',
      arrivalTime: '2026-06-28T16:00:00Z',
      duration: '8h 0m',
      aircraft: 'Unknown',
      status: 'Provider row',
      score: 70,
      risk: 'Medium',
      source: 'provider-cache',
      sourceProvider: 'provider-cache'
    }],
    carrier: 'Provider Airline',
    flightNumber: 'PA123',
    operatingFlightNumber: 'PA123',
    marketingFlightNumbers: [],
    departureTime: '2026-06-28T08:00:00Z',
    arrivalTime: '2026-06-28T16:00:00Z',
    duration: '8h 0m',
    aircraft: 'Unknown',
    status: 'Provider row',
    score: 70,
    risk: 'Medium',
    source: 'provider-cache',
    sourceProvider: 'provider-cache',
    dataFreshnessRule: 'cached-provider-current',
    productionAvailability: false
  }
}

function assertRouteIntegrity(itinerary: ItineraryResult, destination: string) {
  assert.equal(itinerary.route.startsWith('SBP →'), true, `${itinerary.route} must start with SBP`)
  assert.equal(itinerary.route.endsWith(`→ ${destination}`), true, `${itinerary.route} must end with ${destination}`)
  assert.equal(itinerary.legs[0].origin, 'SBP')
  assert.equal(itinerary.legs[itinerary.legs.length - 1].destination, destination)
}

describe('itinerary endpoint integrity', () => {
  it('repairs a downstream provider row only when a valid SBP positioning framework exists', () => {
    const repaired = enforceItineraryEndpointIntegrity(providerItinerary('LAX', 'BOS'), request('BOS'))
    assert.ok(repaired)
    assert.equal(repaired.route, 'SBP → LAX → BOS')
    assert.equal(repaired.legs[0].status, 'positioning leg — live time unavailable')
    assert.equal(repaired.legs[0].flightNumber, 'Flight numbers unavailable')
    assert.equal(repaired.productionAvailability, false)
  })

  it('discards standalone hub routes when no valid SBP positioning framework exists', () => {
    assert.equal(enforceItineraryEndpointIntegrity(providerItinerary('ATL', 'BOS'), request('BOS')), null)
  })

  it('discards routes ending at destination-market alternates instead of the requested destination', () => {
    assert.equal(enforceItineraryEndpointIntegrity(providerItinerary('LAX', 'HND'), request('NRT')), null)
  })

  it('keeps every displayed SBP route anchored to requested endpoints for launch-blocker routes', () => {
    const destinations = ['BOS', 'PDX', 'HNL', 'NRT', 'FCO']
    destinations.forEach((destination) => {
      const repaired = enforceItineraryListEndpointIntegrity([
        providerItinerary('LAX', destination),
        providerItinerary('SFO', destination),
        providerItinerary('SEA', destination),
        providerItinerary('ATL', destination),
        providerItinerary('SBP', destination)
      ], request(destination))
      assert.ok(repaired.length > 0)
      repaired.forEach((itinerary) => assertRouteIntegrity(itinerary, destination))
      assert.equal(repaired.some((itinerary) => ['LAX', 'SFO', 'SEA'].some((hub) => itinerary.route === `${hub} → ${destination}`)), false)
    })
  })
})
