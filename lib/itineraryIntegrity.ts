import type { ItineraryLeg, ItineraryResult, ParsedItineraryRequest } from './itinerarySearch'
import { positioningHubsForOrigin } from './routeCoverageFallback'

function airportCode(value?: string) {
  const normalized = value?.trim().toUpperCase()
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : undefined
}

export function airportCodesFromRoute(route?: string) {
  return (route || '')
    .split('→')
    .map((part) => airportCode(part.match(/[A-Za-z]{3}/)?.[0]))
    .filter((code): code is string => Boolean(code))
}

function itineraryPath(itinerary: ItineraryResult) {
  const legPath = itinerary.legs?.length
    ? [itinerary.legs[0].origin, ...itinerary.legs.map((leg) => leg.destination)].map(airportCode).filter((code): code is string => Boolean(code))
    : []
  return legPath.length ? legPath : airportCodesFromRoute(itinerary.route)
}

function positioningLeg(origin: string, hub: string): ItineraryLeg {
  return {
    id: `route-integrity-positioning-${origin}-${hub}`,
    route: `${origin} → ${hub}`,
    origin,
    destination: hub,
    carrier: 'Positioning leg',
    flightNumber: 'Flight numbers unavailable',
    marketingFlightNumbers: [],
    departureTime: 'Live time unavailable',
    arrivalTime: 'Live time unavailable',
    duration: 'Live time unavailable',
    aircraft: 'Unknown until live schedule returns',
    status: 'positioning leg — live time unavailable',
    score: 45,
    risk: 'Medium',
    source: 'route-framework',
    sourceProvider: 'route-framework'
  }
}

function rebuildRouteFromLegs(legs: ItineraryLeg[]) {
  if (!legs.length) return ''
  return [legs[0].origin, ...legs.map((leg) => leg.destination)].join(' → ')
}

function withIntegrityMetadata(itinerary: ItineraryResult, legs: ItineraryLeg[], addedPositioningLeg: boolean): ItineraryResult {
  const route = rebuildRouteFromLegs(legs)
  return {
    ...itinerary,
    id: addedPositioningLeg ? `origin-integrity-${itinerary.id}` : itinerary.id,
    route,
    legs,
    departureTime: legs[0]?.departureTime || itinerary.departureTime,
    arrivalTime: legs[legs.length - 1]?.arrivalTime || itinerary.arrivalTime,
    duration: legs.map((leg) => leg.duration).filter(Boolean).join(' + ') || itinerary.duration,
    carrier: addedPositioningLeg ? ['Positioning leg', itinerary.carrier].filter(Boolean).join(' + ') : itinerary.carrier,
    flightNumber: addedPositioningLeg ? ['Flight numbers unavailable', itinerary.flightNumber].filter(Boolean).join(' / ') : itinerary.flightNumber,
    operatingFlightNumber: addedPositioningLeg ? itinerary.operatingFlightNumber : itinerary.operatingFlightNumber,
    source: addedPositioningLeg ? 'route-framework' : itinerary.source,
    sourceProvider: addedPositioningLeg ? 'route-framework' : itinerary.sourceProvider,
    providerBadges: addedPositioningLeg
      ? [...new Set([...(itinerary.providerBadges || []), 'Positioning leg required', 'Live availability unavailable'])]
      : itinerary.providerBadges,
    dataFreshnessLabel: addedPositioningLeg ? 'Route framework with positioning leg' : itinerary.dataFreshnessLabel,
    dataFreshnessRule: addedPositioningLeg ? 'route-framework' : itinerary.dataFreshnessRule,
    dataFreshnessWarning: addedPositioningLeg
      ? 'Positioning leg added only as route framework guidance. No flight number, time, load, or live availability is implied for the positioning leg.'
      : itinerary.dataFreshnessWarning,
    productionAvailability: addedPositioningLeg ? false : itinerary.productionAvailability,
    status: addedPositioningLeg ? 'Positioning leg required. Downstream provider segment is not a complete origin-to-destination itinerary by itself.' : itinerary.status
  }
}

export function enforceItineraryEndpointIntegrity(itinerary: ItineraryResult, request: ParsedItineraryRequest): ItineraryResult | null {
  const requestedOrigin = airportCode(request.origin)
  const requestedDestination = airportCode(request.destination)
  if (!requestedOrigin || !requestedDestination) return itinerary

  const path = itineraryPath(itinerary)
  if (path.length < 2) return null
  if (path[path.length - 1] !== requestedDestination) return null

  if (path[0] === requestedOrigin) {
    const routePath = airportCodesFromRoute(itinerary.route)
    const routeNeedsRebuild = routePath[0] !== requestedOrigin || routePath[routePath.length - 1] !== requestedDestination
    return routeNeedsRebuild && itinerary.legs?.length
      ? withIntegrityMetadata(itinerary, itinerary.legs, false)
      : itinerary
  }

  const firstDisplayedAirport = path[0]
  const validPositioningHubs = positioningHubsForOrigin(requestedOrigin)
  if (!validPositioningHubs.includes(firstDisplayedAirport)) return null

  const existingLegs = itinerary.legs?.length ? itinerary.legs : []
  if (!existingLegs.length) return null
  const repairedLegs = [positioningLeg(requestedOrigin, firstDisplayedAirport), ...existingLegs]
  return withIntegrityMetadata(itinerary, repairedLegs, true)
}

export function enforceItineraryListEndpointIntegrity(itineraries: ItineraryResult[], request: ParsedItineraryRequest) {
  const repaired = itineraries
    .map((itinerary) => enforceItineraryEndpointIntegrity(itinerary, request))
    .filter((itinerary): itinerary is ItineraryResult => Boolean(itinerary))
  return [...new Map(repaired.map((itinerary) => [itinerary.route, itinerary])).values()]
}
