import { resolveNaturalLanguageDate, type NaturalLanguageDateOptions } from './naturalLanguageDate'

export type TripPriority =
  | 'highest_probability'
  | 'lowest_cost'
  | 'fastest'
  | 'balanced'

export interface TripMission {
  originAirports: string[]
  departureDate?: string
  returnDate?: string
  travelers: number
  destinationRegion?: string
  preferredDestinations: string[]
  flexibleGateway: boolean
  preferredDepartureAirports: string[]
  allowZed: boolean
  allowRevenue: boolean
  allowRail: boolean
  allowFerry: boolean
  priority: TripPriority
}

const supportedRegions = ['Europe', 'Japan', 'Asia', 'Caribbean']
const airportCodeBlocklist = new Set(['ZED'])
const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
}

const destinationAliases: Array<{ terms: string[]; destination: string; region?: string }> = [
  { terms: ['montenegro'], destination: 'Montenegro', region: 'Europe' },
  { terms: ['tokyo'], destination: 'Tokyo', region: 'Japan' },
  { terms: ['osaka'], destination: 'Osaka', region: 'Japan' },
  { terms: ['okinawa'], destination: 'Okinawa', region: 'Japan' },
  { terms: ['paris'], destination: 'Paris', region: 'Europe' },
  { terms: ['london'], destination: 'London', region: 'Europe' },
  { terms: ['rome'], destination: 'Rome', region: 'Europe' },
  { terms: ['amsterdam'], destination: 'Amsterdam', region: 'Europe' },
  { terms: ['aruba'], destination: 'Aruba', region: 'Caribbean' },
  { terms: ['bahamas'], destination: 'Bahamas', region: 'Caribbean' },
  { terms: ['cancun'], destination: 'Cancun', region: 'Caribbean' }
]

export function createDefaultTripMission(): TripMission {
  return {
    originAirports: [],
    travelers: 1,
    preferredDestinations: [],
    flexibleGateway: false,
    preferredDepartureAirports: [],
    allowZed: false,
    allowRevenue: false,
    allowRail: false,
    allowFerry: false,
    priority: 'balanced'
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function normalizeAirportCode(value: unknown) {
  const code = stringValue(value).toUpperCase().replace(/[^A-Z]/g, '')
  return /^[A-Z]{3}$/.test(code) && !airportCodeBlocklist.has(code) ? code : ''
}

function normalizeAirportCodes(value: unknown) {
  if (!Array.isArray(value)) return []
  return unique(value.map(normalizeAirportCode).filter(Boolean))
}

function normalizeDestinations(value: unknown) {
  if (!Array.isArray(value)) return []
  return unique(value.map(stringValue).filter(Boolean))
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeDate(value: unknown) {
  const text = stringValue(value)
  if (!text) return undefined
  const parsed = Date.parse(`${text}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return undefined
  return new Date(parsed).toISOString().slice(0, 10)
}

function normalizeTravelers(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(99, Math.round(parsed))) : fallback
}

function normalizePriority(value: unknown): TripPriority {
  return ['highest_probability', 'lowest_cost', 'fastest', 'balanced'].includes(String(value))
    ? value as TripPriority
    : 'balanced'
}

export function normalizeTripMission(value: Partial<TripMission> = {}): TripMission {
  const mission = objectValue(value)
  const fallback = createDefaultTripMission()
  const destinationRegion = supportedRegions.includes(stringValue(mission.destinationRegion))
    ? stringValue(mission.destinationRegion)
    : undefined
  return {
    originAirports: normalizeAirportCodes(mission.originAirports),
    departureDate: normalizeDate(mission.departureDate),
    returnDate: normalizeDate(mission.returnDate),
    travelers: normalizeTravelers(mission.travelers, fallback.travelers),
    destinationRegion,
    preferredDestinations: normalizeDestinations(mission.preferredDestinations),
    flexibleGateway: normalizeBoolean(mission.flexibleGateway, fallback.flexibleGateway),
    preferredDepartureAirports: normalizeAirportCodes(mission.preferredDepartureAirports),
    allowZed: normalizeBoolean(mission.allowZed, fallback.allowZed),
    allowRevenue: normalizeBoolean(mission.allowRevenue, fallback.allowRevenue),
    allowRail: normalizeBoolean(mission.allowRail, fallback.allowRail),
    allowFerry: normalizeBoolean(mission.allowFerry, fallback.allowFerry),
    priority: normalizePriority(mission.priority)
  }
}

function titleRegion(value: string) {
  return supportedRegions.find((region) => region.toLowerCase() === value.toLowerCase())
}

function destinationRegionFromPrompt(prompt: string) {
  return supportedRegions.find((region) => new RegExp(`\\b${region}\\b`, 'i').test(prompt))
}

function travelersFromPrompt(prompt: string) {
  const family = prompt.match(/\b(?:family|party|group)\s+of\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i)
  const explicit = prompt.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:travelers?|passengers?|people|pax)\b/i)
  const value = family?.[1] || explicit?.[1]
  if (!value) return undefined
  return numberWords[value.toLowerCase()] || Number(value)
}

function airportCodesFromPrompt(prompt: string) {
  return unique((prompt.toUpperCase().match(/\b[A-Z]{3}\b/g) || [])
    .map(normalizeAirportCode)
    .filter(Boolean))
}

function departureAirportsFromPrompt(prompt: string) {
  const matches = [...prompt.matchAll(/\b(?:from|leaving|departing|out\s+of)\s+([A-Za-z]{3}(?:\s*(?:,|\/|or|and)\s*[A-Za-z]{3})*)/gi)]
  const airports = matches
    .flatMap((match) => match[1].match(/\b[A-Za-z]{3}\b/g) || [])
    .map(normalizeAirportCode)
    .filter(Boolean)
  return unique(airports.length ? airports : airportCodesFromPrompt(prompt))
}

function datesFromPrompt(prompt: string, options: NaturalLanguageDateOptions = {}) {
  const returnMatch = prompt.match(/\b(?:return|returning|back)\s+(?:on\s+)?(.+)$/i)
  const returnDate = returnMatch ? resolveNaturalLanguageDate(returnMatch[1], options).isoDate : undefined
  const departureDate = resolveNaturalLanguageDate(prompt, options).isoDate
  return {
    departureDate,
    returnDate: returnDate && returnDate !== departureDate ? returnDate : undefined
  }
}

function preferredDestinationsFromPrompt(prompt: string) {
  const lower = prompt.toLowerCase()
  return destinationAliases
    .filter((alias) => alias.terms.some((term) => new RegExp(`\\b${term}\\b`, 'i').test(lower)))
    .map((alias) => alias.destination)
}

function destinationRegionFromDestinations(destinations: string[]) {
  return destinationAliases.find((alias) => destinations.includes(alias.destination))?.region
}

function priorityFromPrompt(prompt: string): TripPriority {
  if (/\b(?:fastest|quickest|shortest)\b/i.test(prompt)) return 'fastest'
  if (/\b(?:cheapest|lowest cost|low cost|least expensive|budget)\b/i.test(prompt)) return 'lowest_cost'
  if (/\b(?:highest probability|best chance|most likely|safest|lowest risk)\b/i.test(prompt)) return 'highest_probability'
  return 'balanced'
}

export function parseMissionFromPrompt(prompt: string, options: NaturalLanguageDateOptions = {}): TripMission {
  const text = typeof prompt === 'string' ? prompt.trim() : ''
  if (!text) return createDefaultTripMission()

  const airports = departureAirportsFromPrompt(text)
  const dates = datesFromPrompt(text, options)
  const preferredDestinations = preferredDestinationsFromPrompt(text)
  const destinationRegion = destinationRegionFromPrompt(text) || titleRegion(destinationRegionFromDestinations(preferredDestinations) || '')
  const revenueOnly = /\brevenue\s+only\b/i.test(text)

  return normalizeTripMission({
    originAirports: airports,
    preferredDepartureAirports: airports,
    travelers: travelersFromPrompt(text) || createDefaultTripMission().travelers,
    destinationRegion,
    preferredDestinations,
    flexibleGateway: /\b(?:anywhere|flexible|flexible gateway|any gateway|open to)\b/i.test(text),
    allowZed: revenueOnly ? false : /\bZED\b/i.test(text),
    allowRevenue: /\brevenue\b/i.test(text),
    allowRail: /\brail\b|\btrain\b/i.test(text),
    allowFerry: /\bferry\b/i.test(text),
    priority: priorityFromPrompt(text),
    ...dates
  })
}

export function tripMissionAssumptions(mission: TripMission) {
  const normalized = normalizeTripMission(mission)
  return [
    `Origin airports: ${normalized.originAirports.join(', ') || 'not set'}`,
    `Departure date: ${normalized.departureDate || 'flexible'}`,
    `Return date: ${normalized.returnDate || 'not set'}`,
    `Travelers: ${normalized.travelers}`,
    `Destination region: ${normalized.destinationRegion || 'not set'}`,
    `Preferred destinations: ${normalized.preferredDestinations.join(', ') || 'not set'}`,
    `Flexible gateway: ${normalized.flexibleGateway ? 'yes' : 'no'}`,
    `Preferred departure airports: ${normalized.preferredDepartureAirports.join(', ') || 'not set'}`,
    `Allowed modes: ${[
      normalized.allowZed ? 'ZED' : undefined,
      normalized.allowRevenue ? 'revenue' : undefined,
      normalized.allowRail ? 'rail' : undefined,
      normalized.allowFerry ? 'ferry' : undefined
    ].filter(Boolean).join(', ') || 'not set'}`,
    `Priority: ${normalized.priority}`
  ]
}

export function tripMissionIsComplete(mission: TripMission) {
  const normalized = normalizeTripMission(mission)
  return Boolean(
    normalized.originAirports.length &&
    normalized.travelers > 0 &&
    (normalized.destinationRegion || normalized.preferredDestinations.length)
  )
}
