import { type SearchApiErrorResponse, type SearchApiSuccessResponse } from './searchResponse'
import { type BetaSearchRequest } from './searchRequest'
import { validateSearchRequest, type SearchValidationIssue } from './searchValidation'
import { resolveNaturalLanguageDate } from './naturalLanguageDate'
import { parseMissionFromPrompt, type TripMission } from './tripMission'
import { resolveRouteIntent, type RouteIntentResolution } from './airportIntentResolver'
import {
  normalizeTravelerProfile,
  travelerProfileStorageKey,
  type TravelerProfileScaffold
} from './travelerProfile'

export const betaSearchResultStorageKey = 'nonrevy.betaSearchResult.v1'

export type BetaSearchDestinationMode = 'airport' | 'region'

export type BetaSearchStoredResult = {
  version: 1
  prompt: string
  createdAt: string
  request: BetaSearchRequest
  result: SearchApiSuccessResponse
  destination: {
    mode: BetaSearchDestinationMode
    label: string
    placeholderAirport?: string
    preferredDestinations: string[]
    resolution?: RouteIntentResolution['destination']
  }
  positioningAirports: string[]
  originResolution?: RouteIntentResolution['origin']
}

export type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem?: (key: string) => void
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export type BuildBetaSearchRequestResult =
  | {
    ok: true
    request: BetaSearchRequest
    destination: BetaSearchStoredResult['destination']
    positioningAirports: string[]
    originResolution?: BetaSearchStoredResult['originResolution']
    mission: TripMission
  }
  | {
    ok: false
    state: 'idle' | 'parsing' | 'validating'
    message: string
    issues: SearchValidationIssue[]
  }

export type BuildBetaSearchRequestOptions = {
  now?: Date
  explicitDepartureDate?: string
  previousMission?: Partial<TripMission>
  existingDepartureDate?: string
}

export type RunBetaSearchResult =
  | { ok: true; state: 'success'; storedResult: BetaSearchStoredResult }
  | {
    ok: false
    state: 'idle' | 'parsing' | 'validating' | 'api-validation-error' | 'api-server-error' | 'malformed-response' | 'offline-network-error' | 'no-viable-plans'
    message: string
    issues?: SearchValidationIssue[]
    status?: number
  }

const airportCodeBlocklist = new Set(['ZED'])

const regionPlaceholders: Record<string, string> = {
  Europe: 'FRA',
  Japan: 'HND',
  Asia: 'ICN',
  Caribbean: 'AUA'
}

const explicitDestinationAliases: Array<{ terms: string[]; destination: string; region: string }> = [
  { terms: ['montenegro'], destination: 'Montenegro', region: 'Europe' },
  { terms: ['albania'], destination: 'Albania', region: 'Europe' },
  { terms: ['greece'], destination: 'Greece', region: 'Europe' },
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

function normalizeAirportCode(value: unknown) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(code) && !airportCodeBlocklist.has(code) ? code : ''
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function originFromPrompt(prompt: string, mission: TripMission) {
  const explicit = prompt.match(/\b(?:from|leaving|departing|out\s+of)\s+([A-Za-z]{3})\b/i)?.[1]
  return normalizeAirportCode(explicit) || mission.originAirports[0] || ''
}

function destinationAirportFromPrompt(prompt: string, origin: string, positioningAirports: string[]) {
  const explicit = prompt.match(/\b(?:to|into|destination)\s+([A-Za-z]{3})\b/i)?.[1]
  const code = normalizeAirportCode(explicit)
  if (code && code !== origin && !positioningAirports.includes(code)) return code
  return ''
}

function candidateCodes(resolution?: RouteIntentResolution['origin'] | RouteIntentResolution['destination']) {
  return uniqueStrings((resolution?.candidates || []).map((candidate) => normalizeAirportCode(candidate.code)).filter(Boolean))
}

function positioningAirportsFromPrompt(prompt: string, origin: string) {
  const matches = [...prompt.matchAll(/\b(?:through|via|position(?:ing)?\s+(?:through|via))\s+([A-Za-z]{3}(?:\s*(?:,|\/|or|and)\s*[A-Za-z]{3})*)/gi)]
  return uniqueStrings(matches
    .flatMap((match) => match[1].match(/\b[A-Za-z]{3}\b/g) || [])
    .map(normalizeAirportCode)
    .filter((airport) => airport && airport !== origin))
}

function preferredDestinationsFromPrompt(prompt: string, parsed: TripMission) {
  const lower = prompt.toLowerCase()
  return uniqueStrings([
    ...parsed.preferredDestinations,
    ...explicitDestinationAliases
      .filter((alias) => alias.terms.some((term) => new RegExp(`\\b${term}\\b`, 'i').test(lower)))
      .map((alias) => alias.destination)
  ])
}

function destinationRegionFromPrompt(prompt: string, parsed: TripMission, preferredDestinations: string[]) {
  if (parsed.destinationRegion) return parsed.destinationRegion
  const matched = explicitDestinationAliases.find((alias) => preferredDestinations.includes(alias.destination))
  if (matched) return matched.region
  const region = ['Europe', 'Japan', 'Asia', 'Caribbean'].find((item) => new RegExp(`\\b${item}\\b`, 'i').test(prompt))
  return region || ''
}

function normalizedTripType(mission: TripMission) {
  return mission.returnDate ? 'round_trip' : 'one_way'
}

function travelerCountFor(mission: TripMission, profile: TravelerProfileScaffold) {
  if (mission.travelers && mission.travelers > 1) return mission.travelers
  if (profile.travelingParty.length) return profile.travelingParty.length
  return 1
}

function validationMessage(issues: SearchValidationIssue[]) {
  return issues[0]?.message || 'Please add the missing trip details.'
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const parsed = Date.parse(`${text}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return ''
  const normalized = new Date(parsed).toISOString().slice(0, 10)
  return normalized === text ? text : ''
}

function departureDateIssue(prompt: string, options: BuildBetaSearchRequestOptions): SearchValidationIssue {
  const resolved = resolveNaturalLanguageDate(prompt, { now: options.now })
  if (resolved.warnings.some((warning) => warning.includes('month/day format'))) {
    return { field: 'departureDate', message: 'Use month/day format, for example 7/27/26.' }
  }
  if (resolved.warnings.some((warning) => warning.includes('not valid'))) {
    return { field: 'departureDate', message: 'That date is not valid. Try July 27, 2026.' }
  }
  return { field: 'departureDate', message: 'Add a departure date.' }
}

function invalidDepartureDateIssue(prompt: string, options: BuildBetaSearchRequestOptions) {
  const resolved = resolveNaturalLanguageDate(prompt, { now: options.now })
  return resolved.warnings.some((warning) => warning.includes('month/day format') || warning.includes('not valid'))
    ? departureDateIssue(prompt, options)
    : undefined
}

function departureDateFor(mission: TripMission, options: BuildBetaSearchRequestOptions) {
  return normalizeIsoDate(options.explicitDepartureDate) ||
    mission.departureDate ||
    normalizeIsoDate(options.previousMission?.departureDate) ||
    normalizeIsoDate(options.existingDepartureDate) ||
    (options.now || new Date()).toISOString().slice(0, 10)
}

export function readTravelerProfileFromStorage(storage?: StorageLike) {
  if (!storage) return normalizeTravelerProfile()
  try {
    const value = storage.getItem(travelerProfileStorageKey)
    return value ? normalizeTravelerProfile(JSON.parse(value)) : normalizeTravelerProfile()
  } catch {
    return normalizeTravelerProfile()
  }
}

export function buildBetaSearchRequest(
  prompt: string,
  profileInput: Partial<TravelerProfileScaffold> = normalizeTravelerProfile(),
  options: BuildBetaSearchRequestOptions = {}
): BuildBetaSearchRequestResult {
  const trimmed = typeof prompt === 'string' ? prompt.trim() : ''
  if (!trimmed) {
    return {
      ok: false,
      state: 'idle',
      message: 'Enter a trip request with an origin, destination, and date.',
      issues: [{ field: 'prompt', message: 'Trip request is required.' }]
    }
  }

  const parsedMission = parseMissionFromPrompt(trimmed, { now: options.now })
  const selectedDepartureDate = departureDateFor(parsedMission, options)
  const mission: TripMission = {
    ...parsedMission,
    ...(selectedDepartureDate ? { departureDate: selectedDepartureDate } : {})
  }
  const profile = normalizeTravelerProfile(profileInput)
  const routeResolution = resolveRouteIntent(trimmed)
  const resolvedOriginCandidates = candidateCodes(routeResolution?.origin)
  const resolvedDestinationCandidates = candidateCodes(routeResolution?.destination)
  const origin = resolvedOriginCandidates[0] || originFromPrompt(trimmed, mission)
  const positioningAirports = positioningAirportsFromPrompt(trimmed, origin)
  const destinationAirport = resolvedDestinationCandidates.find((candidate) => candidate !== origin && !positioningAirports.includes(candidate)) ||
    destinationAirportFromPrompt(trimmed, origin, positioningAirports)
  const preferredDestinations = preferredDestinationsFromPrompt(trimmed, mission)
  const destinationRegion = destinationRegionFromPrompt(trimmed, mission, preferredDestinations)
  const destinationMode: BetaSearchDestinationMode = destinationAirport && routeResolution?.destination?.type !== 'region' ? 'airport' : 'region'
  const placeholderAirport = destinationMode === 'region' && destinationRegion ? regionPlaceholders[destinationRegion] : undefined
  const destination = destinationAirport || placeholderAirport || ''
  const preferredDepartureAirports = uniqueStrings([origin, ...resolvedOriginCandidates])
  const preferredDestinationAirports = uniqueStrings([destination, ...resolvedDestinationCandidates])
  const travelerCount = travelerCountFor(mission, profile)
  const tripType = normalizedTripType(mission)

  const issues: SearchValidationIssue[] = []
  if (!origin) issues.push({ field: 'origin', message: 'Add a three-letter origin airport code.' })
  const dateIssue = invalidDepartureDateIssue(trimmed, options)
  if (dateIssue) issues.push(dateIssue)
  else if (!mission.departureDate) issues.push(departureDateIssue(trimmed, options))
  if (!destinationAirport && !destinationRegion) issues.push({ field: 'destination', message: 'Add a destination airport or supported destination region.' })
  if (tripType === 'round_trip' && !mission.returnDate) issues.push({ field: 'returnDate', message: 'Add a return date for round-trip searches.' })
  if (issues.length) return { ok: false, state: 'parsing', message: validationMessage(issues), issues }

  const request: BetaSearchRequest = {
    origin,
    destination,
    departureDate: mission.departureDate || '',
    ...(mission.returnDate ? { returnDate: mission.returnDate } : {}),
    travelerCount,
    tripMission: {
      ...mission,
      originAirports: preferredDepartureAirports,
      preferredDepartureAirports,
      preferredDestinations: uniqueStrings([...preferredDestinationAirports, ...preferredDestinations]),
      travelers: travelerCount,
      departureDate: mission.departureDate,
      ...(destinationRegion ? { destinationRegion } : {})
    },
    travelerProfile: profile,
    preferences: {
      tripType,
      flexibleGateway: mission.flexibleGateway,
      allowZed: mission.allowZed,
      allowRevenue: mission.allowRevenue,
      allowRail: mission.allowRail,
      allowFerry: mission.allowFerry,
      priority: mission.priority,
      preferredDepartureAirports,
      preferredDestinations: uniqueStrings([...preferredDestinationAirports, ...preferredDestinations]),
      positioningAirports,
      ...(destinationRegion ? { destinationRegion } : {})
    }
  }

  const validation = validateSearchRequest(request)
  if (!validation.ok) {
    return {
      ok: false,
      state: 'validating',
      message: validationMessage(validation.issues),
      issues: validation.issues
    }
  }

  return {
    ok: true,
    request: validation.request,
    destination: {
      mode: destinationMode,
      label: routeResolution?.destination?.originalText || destinationAirport || destinationRegion,
      ...(placeholderAirport ? { placeholderAirport } : {}),
      preferredDestinations,
      ...(routeResolution?.destination ? { resolution: routeResolution.destination } : {})
    },
    positioningAirports,
    ...(routeResolution?.origin ? { originResolution: routeResolution.origin } : {}),
    mission
  }
}

function isSearchApiSuccessResponse(value: unknown): value is SearchApiSuccessResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<SearchApiSuccessResponse>
  return typeof record.id === 'string' &&
    typeof record.summary === 'string' &&
    record.confidence !== undefined &&
    record.recommendations !== undefined &&
    Array.isArray(record.warnings) &&
    Array.isArray(record.itineraries) &&
    Array.isArray(record.unknownScheduleIndicators) &&
    record.providerReadiness !== undefined
}

function errorMessageFromApi(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const error = (body as Partial<SearchApiErrorResponse>).error
    const issues = (body as Partial<SearchApiErrorResponse>).issues
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message
    if (typeof error === 'string' && error.trim()) return error
  }
  return fallback
}

export function storeBetaSearchResult(result: BetaSearchStoredResult, storage?: StorageLike) {
  storage?.setItem(betaSearchResultStorageKey, JSON.stringify(result))
}

export function loadStoredBetaSearchResult(storage?: StorageLike): BetaSearchStoredResult | null {
  if (!storage) return null
  try {
    const value = storage.getItem(betaSearchResultStorageKey)
    if (!value) return null
    const parsed = JSON.parse(value)
    if (!parsed || parsed.version !== 1 || !isSearchApiSuccessResponse(parsed.result) || !parsed.request) return null
    return parsed as BetaSearchStoredResult
  } catch {
    return null
  }
}

export async function runBetaSearchFromPrompt(input: {
  prompt: string
  profile?: Partial<TravelerProfileScaffold>
  fetchImpl?: FetchLike
  storage?: StorageLike
  now?: Date
  explicitDepartureDate?: string
}): Promise<RunBetaSearchResult> {
  const profile = normalizeTravelerProfile(input.profile || readTravelerProfileFromStorage(input.storage))
  const built = buildBetaSearchRequest(input.prompt, profile, {
    now: input.now,
    explicitDepartureDate: input.explicitDepartureDate
  })
  if (!built.ok) return built

  const fetchImpl = input.fetchImpl || (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!fetchImpl) {
    return { ok: false, state: 'offline-network-error', message: 'Network search is unavailable in this environment.' }
  }

  let response: Awaited<ReturnType<FetchLike>>
  try {
    response = await fetchImpl('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(built.request)
    })
  } catch {
    return { ok: false, state: 'offline-network-error', message: 'Network search failed. Check your connection and try again.' }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, state: 'malformed-response', status: response.status, message: 'Search returned a malformed response.' }
  }

  if (!response.ok) {
    const state = response.status === 400 || response.status === 422
      ? 'api-validation-error'
      : 'api-server-error'
    return {
      ok: false,
      state,
      status: response.status,
      message: errorMessageFromApi(body, response.status >= 500 ? 'Search failed on the server.' : 'Search request was not accepted.'),
      issues: body && typeof body === 'object' && !Array.isArray(body) && Array.isArray((body as SearchApiErrorResponse).issues)
        ? (body as SearchApiErrorResponse).issues
        : undefined
    }
  }

  if (!isSearchApiSuccessResponse(body)) {
    return { ok: false, state: 'malformed-response', status: response.status, message: 'Search returned an unexpected response shape.' }
  }

  const storedResult: BetaSearchStoredResult = {
    version: 1,
    prompt: input.prompt.trim(),
    createdAt: (input.now || new Date()).toISOString(),
    request: built.request,
    result: body,
    destination: built.destination,
    positioningAirports: built.positioningAirports,
    ...(built.originResolution ? { originResolution: built.originResolution } : {})
  }
  storeBetaSearchResult(storedResult, input.storage)

  if (!body.recommendations.ranked.length && !body.itineraries.length) {
    return {
      ok: false,
      state: 'no-viable-plans',
      message: 'Search completed, but no complete scheduled itineraries were returned for the recognized airports.',
      status: response.status
    }
  }

  return { ok: true, state: 'success', storedResult }
}
