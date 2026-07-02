export type EndToEndLocationKind = 'address' | 'home-airport' | 'hotel' | 'city-center' | 'airport' | 'unknown'

export type EndToEndLocation = {
  label: string
  kind: EndToEndLocationKind
  airportCode?: string
  address?: string
  city?: string
  confidence: 'placeholder'
}

export type AirportOption = {
  airportCode: string
  role: 'primary' | 'alternate'
  label: string
  placeholderScore: number
  notes: string[]
}

export type GroundTransportMode = 'rideshare' | 'driving' | 'rental-car' | 'train' | 'bus'

export type GroundTransportOption = {
  mode: GroundTransportMode
  label: string
  status: 'placeholder'
  estimatedMinutes: number | null
  estimatedCost: number | null
  riskLevel: 'Low' | 'Medium' | 'High' | 'Unknown'
  notes: string[]
}

export type HotelPlaceholder = {
  label: string
  status: 'placeholder'
  estimatedNightlyCost: number | null
  notes: string[]
}

export type EndToEndRiskSummary = {
  level: 'Low' | 'Medium' | 'High' | 'Unknown'
  summary: string
  factors: string[]
}

export type EndToEndBackupPlanSummary = {
  summary: string
  options: string[]
}

export type EndToEndTripPlan = {
  origin: EndToEndLocation
  destination: EndToEndLocation
  departureAirportOptions: AirportOption[]
  alternateDepartureAirports: AirportOption[]
  arrivalAirportOptions: AirportOption[]
  alternateArrivalAirports: AirportOption[]
  groundTransportOptions: GroundTransportOption[]
  ridesharePlaceholder: GroundTransportOption
  drivingPlaceholder: GroundTransportOption
  rentalCarPlaceholder: GroundTransportOption
  trainPlaceholder: GroundTransportOption
  busPlaceholder: GroundTransportOption
  hotelPlaceholder: HotelPlaceholder
  departureGroundPlan: string
  arrivalGroundPlan: string
  hotelPlan: string
  estimatedDoorToDoorTime: string
  estimatedDoorToDoorCost: string
  estimatedDoorToDoorRisk: EndToEndRiskSummary
  backupPlan: EndToEndBackupPlanSummary
}

type EndToEndRequestLike = {
  origin?: string
  destination?: string
}

type EndToEndLegLike = {
  origin?: string
  destination?: string
}

type EndToEndItineraryLike = {
  route: string
  legs?: EndToEndLegLike[]
}

const placeholderGroundMinutes: Record<GroundTransportMode, number> = {
  rideshare: 45,
  driving: 50,
  'rental-car': 75,
  train: 70,
  bus: 85
}

const placeholderGroundCosts: Record<GroundTransportMode, number> = {
  rideshare: 55,
  driving: 20,
  'rental-car': 95,
  train: 18,
  bus: 12
}

const knownAlternateAirports: Record<string, string[]> = {
  BOS: ['PVD', 'MHT'],
  LAX: ['BUR', 'SNA', 'ONT', 'LGB'],
  OGG: ['HNL', 'KOA'],
  SBP: ['SBA', 'LAX', 'SFO'],
  NRT: ['HND'],
  HND: ['NRT']
}

export function buildEndToEndTripPlan(itinerary: EndToEndItineraryLike, request: EndToEndRequestLike = {}): EndToEndTripPlan {
  const path = airportPath(itinerary)
  const departureAirport = path[0] || normalizeAirportCode(request.origin) || 'TBD'
  const arrivalAirport = path[path.length - 1] || normalizeAirportCode(request.destination) || 'TBD'
  const origin = locationFor(request.origin, departureAirport, 'origin')
  const destination = locationFor(request.destination, arrivalAirport, 'destination')
  const ridesharePlaceholder = groundOption('rideshare', 'Rideshare placeholder', 'Estimate pickup timing and fare after live rideshare integration is added.')
  const drivingPlaceholder = groundOption('driving', 'Driving placeholder', 'Estimate drive time, parking, and tolls after map integration is added.')
  const rentalCarPlaceholder = groundOption('rental-car', 'Rental car placeholder', 'Estimate rental availability and counter hours after rental-car integration is added.')
  const trainPlaceholder = groundOption('train', 'Train placeholder', 'Estimate rail access after train schedule integration is added.')
  const busPlaceholder = groundOption('bus', 'Bus placeholder', 'Estimate bus access after bus schedule integration is added.')
  const alternateDepartureAirports = airportOptionsFor(departureAirport, 'alternate')
  const alternateArrivalAirports = airportOptionsFor(arrivalAirport, 'alternate')
  const risk = riskSummary(path.length, alternateDepartureAirports.length + alternateArrivalAirports.length)

  return {
    origin,
    destination,
    departureAirportOptions: [airportOption(departureAirport, 'primary')],
    alternateDepartureAirports,
    arrivalAirportOptions: [airportOption(arrivalAirport, 'primary')],
    alternateArrivalAirports,
    groundTransportOptions: [ridesharePlaceholder, drivingPlaceholder, rentalCarPlaceholder, trainPlaceholder, busPlaceholder],
    ridesharePlaceholder,
    drivingPlaceholder,
    rentalCarPlaceholder,
    trainPlaceholder,
    busPlaceholder,
    hotelPlaceholder: {
      label: 'Hotel placeholder',
      status: 'placeholder',
      estimatedNightlyCost: null,
      notes: ['Hotel and final-destination planning will use live lodging/location inputs in a later phase.']
    },
    departureGroundPlan: `Placeholder: plan access from ${origin.label} to ${departureAirport} by rideshare, driving, transit, or drop-off.`,
    arrivalGroundPlan: `Placeholder: plan transport from ${arrivalAirport} to ${destination.label} by rideshare, rental car, train, bus, or pickup.`,
    hotelPlan: `Placeholder: confirm hotel or final destination near ${destination.label}; no lodging API has been called.`,
    estimatedDoorToDoorTime: `Placeholder estimate: flight itinerary plus about ${placeholderGroundMinutes.rideshare + placeholderGroundMinutes.rideshare} minutes of ground buffers.`,
    estimatedDoorToDoorCost: 'Placeholder estimate only; live rideshare, rental car, hotel, train, and bus costs are not connected yet.',
    estimatedDoorToDoorRisk: risk,
    backupPlan: {
      summary: `Placeholder: if stranded, check later flights, nearby airports${alternateArrivalAirports.length ? ` (${alternateArrivalAirports.map((airport) => airport.airportCode).join(', ')})` : ''}, hotel availability, and next-morning recovery options.`,
      options: [
        'Keep a same-day airport exit plan before departure.',
        'Identify nearby alternate airports before committing to a connection.',
        'Hold a hotel/final-destination backup if the last leg is uncertain.'
      ]
    }
  }
}

function airportPath(itinerary: EndToEndItineraryLike) {
  const legPath = itinerary.legs?.length
    ? [itinerary.legs[0]?.origin, ...itinerary.legs.map((leg) => leg.destination)]
    : itinerary.route.split('→')
  return legPath.map((code) => normalizeAirportCode(code)).filter((code): code is string => Boolean(code))
}

function normalizeAirportCode(value?: string) {
  const match = String(value || '').toUpperCase().match(/\b[A-Z]{3}\b/)
  return match?.[0]
}

function locationFor(input: string | undefined, fallbackAirport: string, role: 'origin' | 'destination'): EndToEndLocation {
  const airportCode = normalizeAirportCode(input)
  if (airportCode) {
    return { label: airportCode, kind: role === 'origin' ? 'home-airport' : 'airport', airportCode, confidence: 'placeholder' }
  }
  const label = input?.trim() || (role === 'origin' ? `Home or local address near ${fallbackAirport}` : `Hotel, address, or city center near ${fallbackAirport}`)
  return { label, kind: input ? (role === 'origin' ? 'address' : 'hotel') : 'unknown', airportCode: fallbackAirport, confidence: 'placeholder' }
}

function airportOptionsFor(airportCode: string, role: AirportOption['role']) {
  return (knownAlternateAirports[airportCode] || []).map((alternate) => airportOption(alternate, role))
}

function airportOption(airportCode: string, role: AirportOption['role']): AirportOption {
  return {
    airportCode,
    role,
    label: role === 'primary' ? `${airportCode} primary airport option` : `${airportCode} alternate airport option`,
    placeholderScore: role === 'primary' ? 80 : 60,
    notes: ['Placeholder airport option; no live ground, fare, hotel, or schedule API has been called.']
  }
}

function groundOption(mode: GroundTransportMode, label: string, note: string): GroundTransportOption {
  return {
    mode,
    label,
    status: 'placeholder',
    estimatedMinutes: placeholderGroundMinutes[mode],
    estimatedCost: placeholderGroundCosts[mode],
    riskLevel: 'Unknown',
    notes: [note]
  }
}

function riskSummary(pathLength: number, alternateCount: number): EndToEndRiskSummary {
  const level = pathLength > 3 ? 'High' : pathLength > 2 ? 'Medium' : 'Unknown'
  return {
    level,
    summary: 'Placeholder risk only; live ground transport, lodging, and disruption feeds are not connected yet.',
    factors: [
      `${Math.max(0, pathLength - 1)} flight leg${Math.max(0, pathLength - 1) === 1 ? '' : 's'} in the itinerary.`,
      `${alternateCount} placeholder alternate airport option${alternateCount === 1 ? '' : 's'} identified.`,
      'Ground transport and hotel risk are placeholders until external APIs are connected.'
    ]
  }
}
