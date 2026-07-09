import type { ItineraryResult } from './itinerarySearch'

export type CanonicalDataTrust = 'live' | 'cached' | 'stored' | 'demo' | 'inferred' | 'unavailable'

export type CanonicalItinerarySegment = {
  airline: string
  operatingCarrier: string
  flightNumber: string
  departureAirport: string
  arrivalAirport: string
  departureTime: string
  arrivalTime: string
  duration?: string
  dataSource: string
  dataFreshness: CanonicalDataTrust
}

export type CanonicalItinerary = {
  origin: string
  destination: string
  date?: string
  totalDuration: string
  totalDurationMinutes?: number
  numberOfStops: number
  connectionAirports: string[]
  layoverDurations: Array<{ airport: string; minutes: number; label: string }>
  orderedFlightSegments: CanonicalItinerarySegment[]
  dataSource: string
  dataFreshness: CanonicalDataTrust
  rowTrust: CanonicalDataTrust
  rowIsLive: boolean
  missingData: string[]
}

function trustFor(value?: string): CanonicalDataTrust {
  const text = String(value || '').toLowerCase()
  if (text.includes('live') || text.includes('flightaware') || text.includes('aviationstack')) return 'live'
  if (text.includes('cache')) return 'cached'
  if (text.includes('stored') || text.includes('supabase')) return 'stored'
  if (text.includes('demo') || text.includes('seed') || text.includes('test')) return 'demo'
  if (text.includes('framework') || text.includes('inferred')) return 'inferred'
  return 'unavailable'
}

function missing(value: string | undefined, label: string) {
  return !value || /^(pending|tbd|unavailable|not provided)$/i.test(value) ? label : undefined
}

export function canonicalizeItinerary(itinerary: ItineraryResult): CanonicalItinerary {
  const origin = itinerary.origin || itinerary.legs[0]?.origin || 'Unavailable'
  const destination = itinerary.destination || itinerary.legs.at(-1)?.destination || 'Unavailable'
  const rowTrust = itinerary.dataTrust || trustFor(`${itinerary.dataFreshnessLabel} ${itinerary.dataFreshnessRule} ${itinerary.sourceProvider} ${itinerary.source}`)
  const segments = itinerary.legs.map((leg) => ({
    airline: leg.carrier,
    operatingCarrier: leg.operatingCarrier || leg.carrier,
    flightNumber: leg.operatingFlightNumber || leg.flightNumber,
    departureAirport: leg.origin,
    arrivalAirport: leg.destination,
    departureTime: leg.departureTime,
    arrivalTime: leg.arrivalTime,
    duration: leg.duration,
    dataSource: leg.dataSource || leg.sourceProvider || leg.source,
    dataFreshness: leg.dataTrust || trustFor(`${leg.dataFreshness} ${leg.sourceProvider} ${leg.source}`)
  }))
  const missingData = [
    missing(origin, 'origin'),
    missing(destination, 'destination'),
    missing(itinerary.duration, 'total duration'),
    ...segments.flatMap((segment, index) => [
      missing(segment.airline, `segment ${index + 1} airline`),
      missing(segment.operatingCarrier, `segment ${index + 1} operating carrier`),
      missing(segment.flightNumber, `segment ${index + 1} flight number`),
      missing(segment.departureAirport, `segment ${index + 1} departure airport`),
      missing(segment.arrivalAirport, `segment ${index + 1} arrival airport`),
      missing(segment.departureTime, `segment ${index + 1} departure time`),
      missing(segment.arrivalTime, `segment ${index + 1} arrival time`)
    ])
  ].filter((item): item is string => Boolean(item))

  return {
    origin,
    destination,
    date: itinerary.date || itinerary.requestedDate || itinerary.matchedDate,
    totalDuration: itinerary.duration || 'Unavailable',
    totalDurationMinutes: itinerary.totalDurationMinutes,
    numberOfStops: itinerary.stopCount ?? Math.max(0, itinerary.legs.length - 1),
    connectionAirports: itinerary.connectionAirports || itinerary.legs.slice(0, -1).map((leg) => leg.destination),
    layoverDurations: itinerary.layoverDurations || [],
    orderedFlightSegments: segments,
    dataSource: itinerary.dataSource || itinerary.sourceProvider || itinerary.source,
    dataFreshness: rowTrust,
    rowTrust,
    rowIsLive: rowTrust === 'live' && itinerary.productionAvailability !== false && missingData.length === 0,
    missingData
  }
}

export function canonicalizeItineraries(itineraries: ItineraryResult[]) {
  return itineraries.map(canonicalizeItinerary)
}
