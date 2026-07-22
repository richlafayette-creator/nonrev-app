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
const monthNumbers: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12
}

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

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return date.toISOString().slice(0, 10)
}

function dateFromMonthDay(monthText: string, dayText: string, now = new Date()) {
  const month = monthNumbers[monthText.toLowerCase()]
  const day = Number(dayText)
  if (!month || !Number.isFinite(day)) return undefined
  const currentYear = now.getUTCFullYear()
  const candidate = isoDate(currentYear, month, day)
  if (!candidate) return undefined
  const candidateTime = Date.parse(`${candidate}T00:00:00Z`)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return candidateTime < today ? isoDate(currentYear + 1, month, day) : candidate
}

function datesFromPrompt(prompt: string, now = new Date()) {
  const dateMatches = [...prompt.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})\b/gi)]
  const parsedDates = dateMatches.map((match) => dateFromMonthDay(match[1], match[2], now)).filter((date): date is string => Boolean(date))
  const returnMatch = prompt.match(/\b(?:return|returning|back)\s+(?:on\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})\b/i)
  return {
    departureDate: parsedDates[0],
    returnDate: returnMatch ? dateFromMonthDay(returnMatch[1], returnMatch[2], now) : parsedDates[1]
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

export function parseMissionFromPrompt(prompt: string): TripMission {
  const text = typeof prompt === 'string' ? prompt.trim() : ''
  if (!text) return createDefaultTripMission()

  const airports = departureAirportsFromPrompt(text)
  const dates = datesFromPrompt(text)
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
