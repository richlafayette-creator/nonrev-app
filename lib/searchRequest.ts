import { type NaturalSearchObject, type SearchTripType } from './searchPipeline'
import { type TripMission, type TripPriority } from './tripMission'
import { type TravelerProfileScaffold } from './travelerProfile'

export type BetaSearchPreferences = {
  tripType?: SearchTripType
  flexibleGateway?: boolean
  allowZed?: boolean
  allowRevenue?: boolean
  allowRail?: boolean
  allowFerry?: boolean
  priority?: TripPriority
  preferredDepartureAirports?: string[]
  preferredDestinations?: string[]
  destinationRegion?: string
  positioningAirports?: string[]
}

export type BetaSearchRequest = {
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  travelerCount: number
  tripMission: Partial<TripMission> | string
  travelerProfile: Partial<TravelerProfileScaffold>
  preferences: BetaSearchPreferences
}

export type SearchRequestBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 400; code: 'invalid_json'; message: string }

export async function readSearchRequestBody(request: Request): Promise<SearchRequestBodyResult> {
  try {
    return { ok: true, body: await request.json() }
  } catch {
    return {
      ok: false,
      status: 400,
      code: 'invalid_json',
      message: 'Request body must be valid JSON.'
    }
  }
}

function destinationRegionForAirport(destination: string) {
  const code = destination.toUpperCase()
  if (['HND', 'NRT', 'KIX', 'ITM', 'OKA'].includes(code)) return 'Japan'
  if (['FCO', 'FRA', 'MUC', 'ZRH', 'AMS', 'CDG', 'MAD', 'LHR', 'VIE', 'BRU', 'DUB'].includes(code)) return 'Europe'
  if (['ICN', 'TPE', 'SIN', 'HKG', 'BKK'].includes(code)) return 'Asia'
  if (['AUA', 'NAS', 'CUN', 'SJU'].includes(code)) return 'Caribbean'
  return undefined
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function toSearchPipelineRequest(request: BetaSearchRequest): NaturalSearchObject {
  const preferences = request.preferences || {}
  const destinationRegion = preferences.destinationRegion || destinationRegionForAirport(request.destination)
  const preferredDestinations = uniqueStrings([
    request.destination,
    ...(preferences.preferredDestinations || [])
  ])

  return {
    origin: request.origin,
    destination: request.destination,
    departureDate: request.departureDate,
    returnDate: request.returnDate,
    travelerCount: request.travelerCount,
    tripMission: request.tripMission,
    travelerProfile: request.travelerProfile,
    tripType: preferences.tripType,
    flexibleGateway: preferences.flexibleGateway,
    allowZed: preferences.allowZed,
    allowRevenue: preferences.allowRevenue,
    allowRail: preferences.allowRail,
    allowFerry: preferences.allowFerry,
    priority: preferences.priority,
    preferredDepartureAirports: preferences.preferredDepartureAirports,
    preferredDestinations,
    ...(destinationRegion ? { destinationRegion } : {})
  }
}
