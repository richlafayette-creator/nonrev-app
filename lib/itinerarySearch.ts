export type ParsedItineraryRequest = {
  prompt?: string
  origin?: string
  destination?: string
  date?: string
  carrier?: string
  maxLegs: number
  parserConfidence: number
  parserExplanation: string
  parserFallbackApplied: boolean
}

export type ItineraryLeg = {
  id?: string | number
  route: string
  origin: string
  destination: string
  carrier: string
  flightNumber: string
  operatingFlightNumber?: string
  marketingFlightNumbers?: string[]
  departureTime: string
  arrivalTime: string
  duration?: string
  aircraft: string
  status: string
  gate?: string
  terminal?: string
  delayMinutes?: number
  cancelled?: boolean
  diverted?: boolean
  disruptionSource?: string
  score: number
  risk: string
  source: string
  sourceProvider?: string
  sourceCheckedAt?: string
  duplicateCount?: number
}

export type ItineraryResult = {
  id: string
  route: string
  legs: ItineraryLeg[]
  carrier: string
  flightNumber: string
  operatingFlightNumber?: string
  marketingFlightNumbers?: string[]
  departureTime: string
  arrivalTime: string
  duration?: string
  aircraft: string
  status: string
  gate?: string
  terminal?: string
  score: number
  risk: string
  source: string
  sourceProvider?: string
  sourceCheckedAt?: string
  providerBadges?: string[]
  dataFreshnessLabel?: string
  dataFreshnessDetail?: string
  dataFreshnessRule?: 'exact-requested-date' | 'cached-provider-current' | 'cached-provider-reduced' | 'cached-provider-yellow' | 'cached-provider-historical' | 'nearest-date-testing-match' | 'stored-historical-data' | 'demo-fallback' | 'route-framework'
  dataFreshnessWarning?: string
  requestedDate?: string
  matchedDate?: string
  productionAvailability?: boolean
  duplicateCount?: number
  recoveryStrength?: number
  recoveryExplanation?: string
  recoveryFactors?: Record<string, number | string>
  suggestedRecoveryPaths?: Array<{
    id: string
    label: string
    route?: string
    kind: string
    confidence: 'Conservative'
    note: string
  }>
  historicalSuccessScore?: number
  historicalConfidence?: number
  historicalSampleSize?: number
  communityLoadTrustScore?: number
  compositeRouteScore?: number
  historicalFactors?: Record<string, number | string>
  topRouteRank?: number
  topRouteLabel?: string
  topRouteScore?: number
  topRouteWhy?: string[]
  topRouteRankingFactors?: Record<string, number | string>
  whyThisRoute?: string
}

export type FlightRouteNormalization = {
  origin?: string
  destination?: string
  date?: string
  carrierText: string
  flightNumber: string
  originRaw?: string
  destinationRaw?: string
  dateRaw?: string
}

export type FlightRouteMatchDiagnostics = {
  id: string
  flightNumber: string
  normalized: FlightRouteNormalization
  originMatches: boolean
  destinationMatches: boolean
  dateMatches: boolean
  carrierMatches: boolean
  matched: boolean
  rejectionReasons: string[]
}

export type RouteNormalizationDiagnostics = {
  normalizedRouteCount: number
  normalizedRoutes: Array<{
    route: string
    count: number
    sampleFlightNumbers: string[]
  }>
  missingOriginCount: number
  missingDestinationCount: number
  missingDateCount: number
  carrierSamples: string[]
  dateSamples: string[]
}

export type ClosestMatchingRoute = {
  route: string
  count: number
  reason: string
  sampleFlightNumbers: string[]
}

export type DateCoverageDiagnostics = {
  requestedSearchDate?: string
  effectiveMatchDate?: string
  oldestFlightDate?: string
  newestFlightDate?: string
  availableDates: string[]
  closestAvailableDates: string[]
  requestedDateIsNewerThanAvailableData: boolean
  nearestDateApplied: boolean
  nearestDateToleranceDays?: number
  dateMode: 'strict' | 'nearest-date-testing'
  warning?: string
}

export type RouteMatchingSummary = {
  requested: {
    origin?: string
    destination?: string
    date?: string
    carrier?: string
  }
  originMatches: number
  destinationMatches: number
  dateMatches: number
  carrierMatches: number
  exactRouteMatches: number
  finalMatchedRows: number
  totalCandidates: number
  matchExplanation: string
  dateCoverage: DateCoverageDiagnostics
  routeNormalization: RouteNormalizationDiagnostics
  closestMatchingRoutes: ClosestMatchingRoute[]
  rejectedCandidates: FlightRouteMatchDiagnostics[]
}

const carrierAliases: Record<string, string[]> = {
  united: ['united', 'ua', 'ual'],
  delta: ['delta', 'dl', 'dal'],
  'alaska-group': ['alaska', 'hawaiian', 'as', 'ha', 'alaska group']
}

const carrierLabels: Record<string, string> = {
  united: 'United',
  delta: 'Delta',
  'alaska-group': 'Alaska Group',
  all: 'All Supported Carriers'
}

const airportAliases: Record<string, string> = {
  honolulu: 'HNL',
  oahu: 'HNL',
  hawaii: 'HNL',
  maui: 'OGG',
  kahului: 'OGG',
  tokyo: 'HND',
  narita: 'NRT',
  haneda: 'HND',
  japan: 'HND',
  lax: 'LAX',
  losangeles: 'LAX',
  sea: 'SEA',
  seattle: 'SEA',
  sfo: 'SFO',
  sanfrancisco: 'SFO',
  hnl: 'HNL',
  ogg: 'OGG',
  hnd: 'HND',
  nrt: 'NRT',
  sbp: 'SBP',
  sanluisobispo: 'SBP',
  obispo: 'SBP',
  slo: 'SBP',
  sanluis: 'SBP',
  newyork: 'JFK',
  nyc: 'JFK',
  jfk: 'JFK',
  ewr: 'EWR',
  newark: 'EWR',
  boston: 'BOS',
  bos: 'BOS',
  chicago: 'ORD',
  ord: 'ORD',
  denver: 'DEN',
  den: 'DEN',
  atlanta: 'ATL',
  atl: 'ATL',
  dallas: 'DFW',
  dfw: 'DFW',
  phoenix: 'PHX',
  phx: 'PHX',
  lasvegas: 'LAS',
  vegas: 'LAS',
  las: 'LAS',
  sandiego: 'SAN',
  san: 'SAN',
  santabarbara: 'SBA',
  sba: 'SBA',
  minneapolis: 'MSP',
  saintpaul: 'MSP',
  stpaul: 'MSP',
  msp: 'MSP',
  fargo: 'FAR',
  far: 'FAR',
  portland: 'PDX',
  pdx: 'PDX',
  redmond: 'RDM',
  bend: 'RDM',
  rdm: 'RDM',
  philadelphia: 'PHL',
  philly: 'PHL',
  phl: 'PHL',
  london: 'LHR',
  heathrow: 'LHR',
  gatwick: 'LGW',
  lhr: 'LHR',
  lgw: 'LGW',
  amsterdam: 'AMS',
  ams: 'AMS',
  frankfurt: 'FRA',
  fra: 'FRA',
  charlotte: 'CLT',
  clt: 'CLT',
  asheville: 'AVL',
  avl: 'AVL',
  kona: 'KOA',
  koa: 'KOA',
  washingtondc: 'DCA',
  dc: 'DCA',
  dca: 'DCA',
  charlottesville: 'CHO',
  cho: 'CHO',
  anchorage: 'ANC',
  anc: 'ANC',
  orlando: 'MCO',
  mco: 'MCO',
  rome: 'FCO',
  fiumicino: 'FCO',
  ciampino: 'CIA',
  fco: 'FCO',
  cia: 'CIA',
  paris: 'CDG',
  charlesdegaulle: 'CDG',
  orly: 'ORY',
  cdg: 'CDG',
  ory: 'ORY',
  lga: 'LGA',
  laguardia: 'LGA',
  bur: 'BUR',
  burbank: 'BUR',
  sna: 'SNA',
  orangecounty: 'SNA',
  santaana: 'SNA',
  sjc: 'SJC',
  sanjose: 'SJC',
  oak: 'OAK',
  oakland: 'OAK',
  bayarea: 'SFO',
  mry: 'MRY',
  monterey: 'MRY',
  smx: 'SMX',
  santamaria: 'SMX'
}

const fillerRouteWords = new Set(['get', 'me', 'the', 'to', 'for', 'from', 'out', 'of', 'leaving', 'departing', 'via', 'and', 'non', 'rev', 'nonrev', 'path', 'cheapest', 'open', 'flights', 'flight', 'best', 'route', 'way', 'home'])

function airportCode(value?: string | null) {
  const match = value?.toUpperCase().match(/\b[A-Z]{3}\b/)
  return match?.[0]
}

function normalizePlaceToken(value?: string | null) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase()
  const compact = value.toLowerCase().replace(/[^a-z]/g, '')
  return airportAliases[compact]
}

function airportFromPhrase(value?: string | null) {
  if (!value) return undefined
  const direct = normalizePlaceToken(value)
  if (direct) return direct
  const words = value.toLowerCase().match(/[a-z]+/g) || []
  for (let size = words.length; size >= 2; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const code = airportAliases[words.slice(index, index + size).join('')]
      if (code) return code
    }
  }
  for (const word of words) {
    const code = airportAliases[word]
    if (code) return code
  }
  return undefined
}

function isHomeIntent(value?: string | null) {
  return Boolean(value?.toLowerCase().match(/\b(?:home|get\s+me\s+home|way\s+home)\b/))
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

const monthNames: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
}

function isoFromMonthDay(monthText: string, dayText: string, yearText: string | undefined, now: Date) {
  const month = monthNames[monthText.toLowerCase()]
  const day = Number(dayText)
  if (month === undefined || !Number.isFinite(day) || day < 1 || day > 31) return undefined
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const requestedYear = yearText ? Number(yearText) : today.getUTCFullYear()
  let parsed = new Date(Date.UTC(requestedYear, month, day))
  if (!yearText && parsed.getTime() < today.getTime()) parsed = new Date(Date.UTC(requestedYear + 1, month, day))
  return parsed.toISOString().slice(0, 10)
}

function dateFromRelative(value: string, now = new Date()) {
  const normalized = value.toLowerCase()
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (normalized.includes('today') || normalized.includes('tonight')) return date.toISOString().slice(0, 10)
  if (normalized.includes('tomorrow')) return addDays(date, 1).toISOString().slice(0, 10)
  if (normalized.includes('next week')) return addDays(date, 7).toISOString().slice(0, 10)
  if (normalized.includes('this weekend') || normalized.includes('weekend')) {
    const daysUntilSaturday = (6 - date.getUTCDay() + 7) % 7
    return addDays(date, daysUntilSaturday || 7).toISOString().slice(0, 10)
  }
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const nextWeekday = normalized.match(/\b(?:next|this|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (nextWeekday) {
    const target = weekdays.indexOf(nextWeekday[1])
    const diff = (target - date.getUTCDay() + 7) % 7 || (nextWeekday[0].startsWith('this') || nextWeekday[0].startsWith('on') ? 0 : 7)
    return addDays(date, diff).toISOString().slice(0, 10)
  }
  const bareWeekday = normalized.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (bareWeekday) {
    const target = weekdays.indexOf(bareWeekday[1])
    const diff = (target - date.getUTCDay() + 7) % 7 || 7
    return addDays(date, diff).toISOString().slice(0, 10)
  }
  const isoDate = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (isoDate) return isoDate[1]
  const monthDay = normalized.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/)
  if (monthDay) return isoFromMonthDay(monthDay[1], monthDay[2], monthDay[3], now)
  const numericDate = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/)
  if (numericDate) {
    const month = Number(numericDate[1])
    const day = Number(numericDate[2])
    if (Number.isFinite(month) && month >= 1 && month <= 12) {
      const year = numericDate[3] ? (numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3]) : undefined
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const requestedYear = year ? Number(year) : today.getUTCFullYear()
      let parsed = new Date(Date.UTC(requestedYear, month - 1, day))
      if (!year && parsed.getTime() < today.getTime()) parsed = new Date(Date.UTC(requestedYear + 1, month - 1, day))
      return parsed.toISOString().slice(0, 10)
    }
  }
  return undefined
}

function carrierFromText(value: string) {
  const normalized = value.toLowerCase()
  const matched = Object.entries(carrierAliases).find(([, aliases]) => aliases.some((alias) => {
    const escapedAlias = alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    return new RegExp(`(^|\\b)${escapedAlias}(\\b|$)`).test(normalized)
  }))
  return matched?.[0]
}

function routePhraseStopPattern() {
  return '(?:today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|next\\s+\\w+|this\\s+weekend|weekend|on\\s+\\w+|with\\s+\\w+|united|delta|alaska|hawaiian|ua|dl|as|ha|polaris|first|business|economy)'
}

function safeRoutePlaceToken(value?: string | null) {
  if (!value) return undefined
  const trimmed = value.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
  if (!trimmed) return undefined
  const compact = trimmed.toLowerCase().replace(/[^a-z]/g, '')
  const alias = airportAliases[compact]
  if (alias) return alias
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : undefined
}

function airportFromRouteSegment(value: string, preferredEdge: 'start' | 'end') {
  const words = value.match(/[A-Za-z]+/g) || []
  if (!words.length) return undefined

  const phraseCandidates: string[] = []
  if (preferredEdge === 'start') {
    for (let end = words.length; end >= 1; end -= 1) phraseCandidates.push(words.slice(0, end).join(' '))
    for (let index = 1; index < words.length; index += 1) phraseCandidates.push(words[index])
  } else {
    for (let start = 0; start < words.length; start += 1) phraseCandidates.push(words.slice(start).join(' '))
    for (let index = words.length - 2; index >= 0; index -= 1) phraseCandidates.push(words[index])
  }

  for (const candidate of phraseCandidates) {
    const code = safeRoutePlaceToken(candidate)
    if (code) return code
  }

  return undefined
}

function routeFromText(value: string) {
  const normalized = value.trim()
  const stop = routePhraseStopPattern()
  const viaRoute = normalized.match(/\b([A-Za-z]{3})\s+(?:to|for)\s+([A-Za-z]{3})\b.*\bvia\s+([A-Za-z]{3})\b/i)
  if (viaRoute) {
    const origin = airportFromPhrase(viaRoute[1])
    const destination = airportFromPhrase(viaRoute[2])
    if (origin || destination) return { origin, destination, routePhraseFound: true }
  }

  const toFromRoute = normalized.match(new RegExp(`\\b(?:to|for)\\s+([A-Za-z]{3}|[A-Za-z][A-Za-z\\s]+?)\\s+from\\s+([A-Za-z]{3}|[A-Za-z][A-Za-z\\s]+?)(?:\\s+${stop}\\b|$)`, 'i'))
  if (toFromRoute) {
    const destination = airportFromRouteSegment(toFromRoute[1], 'start')
    const origin = airportFromRouteSegment(toFromRoute[2], 'start')
    if (origin || destination) return { origin, destination, routePhraseFound: true }
  }

  const fromToRoute = normalized.match(new RegExp(`\\b(?:from|leaving|departing|out\\s+of)\\s+([A-Za-z]{3}|[A-Za-z][A-Za-z\\s]+?)\\s*(?:-|→|to|for)\\s+([A-Za-z]{3}|[A-Za-z][A-Za-z\\s]+?)(?:\\s+${stop}\\b|$)`, 'i'))
  if (fromToRoute) {
    const origin = airportFromRouteSegment(fromToRoute[1], 'start')
    const destination = airportFromRouteSegment(fromToRoute[2], 'start')
    if (origin || destination) return { origin, destination, routePhraseFound: true }
  }

  const delimitedRouteParts = normalized.split(/\s*(?:-|→|\bto\b|\bfor\b)\s*/i).filter((part) => part.trim())
  if (delimitedRouteParts.length >= 2) {
    const origin = airportFromRouteSegment(delimitedRouteParts[0], 'end')
    const destination = airportFromRouteSegment(delimitedRouteParts[delimitedRouteParts.length - 1], 'start')
    if (origin || destination) return { origin, destination, routePhraseFound: true }
  }

  const originOnly = normalized.match(/\b(?:from|leaving|departing|out\s+of)\s+([A-Za-z]{3}|[A-Za-z][A-Za-z\s]+?)(?:\s+(?:today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|next\s+\w+|this\s+weekend|weekend|on\s+\w+|with\s+\w+|united|delta|alaska|hawaiian|ua|dl|as|ha|open|flights|flight)\b|$)/i)
  if (originOnly) {
    const origin = airportFromPhrase(originOnly[1])
    if (origin) return { origin, routePhraseFound: true }
  }

  const destinationOnly = normalized.match(/\b(?:to|for)\s+([A-Za-z]{3}|[A-Za-z][A-Za-z\s]+?)(?:\s+(?:today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|next\s+\w+|this\s+weekend|weekend|on\s+\w+|with\s+\w+|united|delta|alaska|hawaiian|ua|dl|as|ha|polaris|first|business|economy)\b|$)/i)
  if (destinationOnly) {
    const destination = airportFromPhrase(destinationOnly[1])
    if (destination) return { destination, routePhraseFound: true }
  }

  const words = normalized.toLowerCase().match(/[a-z]{3,}/g) || []
  const inferredDestination = words
    .filter((word) => !fillerRouteWords.has(word))
    .map((word) => airportAliases[word])
    .find(Boolean)
  return { destination: inferredDestination, routePhraseFound: false }
}

function parserMetadata({
  origin,
  destination,
  date,
  carrier,
  routePhraseFound,
  explicitOrigin,
  explicitDestination
}: {
  origin?: string
  destination?: string
  date?: string
  carrier?: string
  routePhraseFound: boolean
  explicitOrigin?: string
  explicitDestination?: string
}) {
  const explanations: string[] = []
  let confidence = 10

  if (origin) {
    confidence += explicitOrigin ? 35 : 28
    explanations.push(`${explicitOrigin ? 'Used explicit' : 'Parsed'} origin ${origin}.`)
  } else {
    explanations.push('No origin was found in the text; the planner will use a profile/home airport if supplied, otherwise it will stay in fallback guidance.')
  }

  if (destination) {
    confidence += explicitDestination ? 35 : 28
    explanations.push(`${explicitDestination ? 'Used explicit' : routePhraseFound ? 'Parsed' : 'Inferred'} destination ${destination}.`)
  } else {
    explanations.push('No destination was found, so the planner will not run an unrestricted live search.')
  }

  if (date) {
    confidence += 10
    explanations.push(`Parsed travel date ${date}.`)
  } else {
    explanations.push('No travel date was parsed; live providers may search a flexible window.')
  }

  if (carrier) {
    confidence += 5
    explanations.push(`Parsed carrier preference ${carrierLabel(carrier)}.`)
  }

  if (routePhraseFound) confidence += 5
  const parserFallbackApplied = !origin || !destination
  if (!parserFallbackApplied && routePhraseFound) confidence = Math.max(confidence, 90)
  if (parserFallbackApplied) confidence = Math.min(confidence, destination ? 68 : 35)

  return {
    parserConfidence: Math.max(0, Math.min(99, Math.round(confidence))),
    parserExplanation: explanations.join(' '),
    parserFallbackApplied
  }
}

export function parseItineraryPrompt(prompt: string, now = new Date()): Partial<ParsedItineraryRequest> {
  const normalized = prompt.trim()
  const route = routeFromText(normalized)
  const date = dateFromRelative(normalized, now)
  const carrier = carrierFromText(normalized)
  const metadata = parserMetadata({
    origin: route.origin,
    destination: route.destination,
    date,
    carrier,
    routePhraseFound: route.routePhraseFound
  })

  return {
    prompt: normalized,
    origin: route.origin,
    destination: route.destination,
    date,
    carrier,
    ...metadata
  }
}

export function normalizeItineraryRequest(searchParams: URLSearchParams, now = new Date()): ParsedItineraryRequest {
  const prompt = searchParams.get('q') || searchParams.get('query') || searchParams.get('prompt') || searchParams.get('aiTrip') || undefined
  const parsed = prompt ? parseItineraryPrompt(prompt, now) : {}
  const maxLegs = Number(searchParams.get('maxLegs') || '3')
  const explicitOrigin = airportCode(searchParams.get('origin'))
  const explicitDestination = airportCode(searchParams.get('destination'))
  const explicitCarrier = searchParams.get('carrier')
  const promptHasHomeIntent = isHomeIntent(prompt)
  const homeAirportDestination = promptHasHomeIntent && parsed.origin && !parsed.destination ? explicitDestination || explicitOrigin : undefined
  const origin = parsed.origin || explicitOrigin
  const destination = parsed.destination || explicitDestination || homeAirportDestination
  const date = searchParams.get('date') || parsed.date
  const carrier = explicitCarrier && explicitCarrier !== 'all' ? explicitCarrier : parsed.carrier || explicitCarrier || 'all'
  const usedExplicitOrigin = parsed.origin ? undefined : explicitOrigin
  const usedExplicitDestination = parsed.destination ? undefined : explicitDestination
  const metadata = parserMetadata({
    origin,
    destination,
    date,
    carrier: carrier === 'all' ? undefined : carrier,
    routePhraseFound: Boolean(prompt && (parsed.origin || parsed.destination)),
    explicitOrigin: usedExplicitOrigin,
    explicitDestination: usedExplicitDestination
  })

  return {
    prompt,
    origin,
    destination,
    date,
    carrier,
    maxLegs: Number.isFinite(maxLegs) ? Math.max(1, Math.min(3, Math.round(maxLegs))) : 2,
    ...metadata
  }
}

function nestedValueFrom(record: Record<string, unknown>, key: string) {
  if (!key.includes('.')) return record[key]
  return key.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) return (current as Record<string, unknown>)[part]
    return undefined
  }, record)
}

function valueFrom(flight: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = nestedValueFrom(flight, key)
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return ''
}

const originFieldKeys = ['origin', 'origin_airport', 'origin_airport_code', 'origin_iata', 'departure_airport', 'departure_airport_code', 'departure_iata', 'departure_iata_code', 'dep_iata', 'dep_airport', 'departure.iata', 'departure.icao']
const destinationFieldKeys = ['destination', 'destination_airport', 'destination_airport_code', 'destination_iata', 'arrival_airport', 'arrival_airport_code', 'arrival_iata', 'arrival_iata_code', 'arr_iata', 'arr_airport', 'arrival.iata', 'arrival.icao']
const dateFieldKeys = ['date', 'flight_date', 'departure_date', 'scheduled_date']
const departureTimeFieldKeys = ['departure_time', 'scheduled_departure', 'scheduled_out', 'actual_out', 'created_at', 'departure.scheduled', 'departure.estimated', 'departure.actual']
const notProvidedLabel = 'Not provided'

function numberFrom(flight: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = Number(flight[key])
    if (Number.isFinite(value)) return value
  }
  return fallback
}

function minutesBetween(later?: string, earlier?: string) {
  const laterTime = later ? Date.parse(later) : NaN
  const earlierTime = earlier ? Date.parse(earlier) : NaN
  if (!Number.isFinite(laterTime) || !Number.isFinite(earlierTime) || laterTime <= earlierTime) return 0
  return Math.round((laterTime - earlierTime) / 60000)
}

function durationLabel(minutes: number) {
  if (!minutes) return notProvidedLabel
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return hours ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`
}

function fieldValue(value: string) {
  return value && value.trim() ? value : notProvidedLabel
}

function carrierFromFlight(flight: Record<string, unknown>) {
  const explicitCarrier = valueFrom(flight, ['carrier', 'airline', 'operator', 'carrier_name'])
  if (explicitCarrier) return explicitCarrier
  const flightNumber = valueFrom(flight, ['flight_number', 'ident', 'fa_flight_id'])
  if (/^UA/i.test(flightNumber)) return 'United'
  if (/^DL/i.test(flightNumber)) return 'Delta'
  if (/^AS/i.test(flightNumber)) return 'Alaska Airlines'
  if (/^HA/i.test(flightNumber)) return 'Hawaiian Airlines'
  return 'Unknown Carrier'
}

function riskFromScore(score: number, status: string) {
  const loweredStatus = status.toLowerCase()
  if (loweredStatus.includes('cancel')) return 'High'
  if (loweredStatus.includes('delay')) return 'Medium-High'
  if (score >= 80) return 'Low'
  if (score >= 70) return 'Medium-Low'
  if (score >= 55) return 'Medium'
  return 'High'
}

function flightMatchesCarrier(flight: Record<string, unknown>, carrier?: string) {
  if (!carrier || carrier === 'all') return true
  const carrierText = carrierFromFlight(flight)
  const flightNumber = valueFrom(flight, ['flight_number', 'ident'])
  const text = `${carrierText} ${flightNumber}`.toLowerCase()
  const hasFlightNumberEvidence = Boolean(flightNumber.trim()) && flightNumber.toLowerCase() !== notProvidedLabel.toLowerCase()
  const hasCarrierEvidence = hasFlightNumberEvidence || !['unknown carrier', 'not provided'].includes(carrierText.toLowerCase())
  if (!hasCarrierEvidence && valueFrom(flight, ['source_provider']) === 'flightaware') return true
  return carrierAliases[carrier]?.some((alias) => text.includes(alias)) ?? text.includes(carrier.toLowerCase())
}

function flightMatchesDate(flight: Record<string, unknown>, date?: string) {
  if (!date) return true
  const text = [
    valueFrom(flight, dateFieldKeys),
    valueFrom(flight, departureTimeFieldKeys)
  ].join(' ')
  return text.includes(date)
}

export function normalizeFlightRouteForDiagnostics(flight: Record<string, unknown>): FlightRouteNormalization {
  const originRaw = valueFrom(flight, originFieldKeys)
  const destinationRaw = valueFrom(flight, destinationFieldKeys)
  const dateRaw = [valueFrom(flight, dateFieldKeys), valueFrom(flight, departureTimeFieldKeys)].filter(Boolean).join(' ')
  return {
    origin: airportCode(originRaw),
    destination: airportCode(destinationRaw),
    date: dateRaw.match(/20\d{2}-\d{2}-\d{2}/)?.[0],
    carrierText: `${carrierFromFlight(flight)} ${valueFrom(flight, ['flight_number', 'ident', 'fa_flight_id'])}`.trim(),
    flightNumber: valueFrom(flight, ['flight_number', 'ident', 'fa_flight_id']) || 'Flight TBD',
    originRaw: originRaw || undefined,
    destinationRaw: destinationRaw || undefined,
    dateRaw: dateRaw || undefined
  }
}

export function routeMatchDiagnosticsForFlight(flight: Record<string, unknown>, request: ParsedItineraryRequest): FlightRouteMatchDiagnostics {
  const normalized = normalizeFlightRouteForDiagnostics(flight)
  const originMatches = request.origin ? normalized.origin === request.origin : true
  const destinationMatches = request.destination ? normalized.destination === request.destination : true
  const dateMatches = flightMatchesDate(flight, request.date)
  const carrierMatches = flightMatchesCarrier(flight, request.carrier)
  const rejectionReasons = [
    !originMatches ? `origin ${normalized.origin || 'unavailable'} did not match ${request.origin}` : undefined,
    !destinationMatches ? `destination ${normalized.destination || 'unavailable'} did not match ${request.destination}` : undefined,
    !dateMatches ? `date ${normalized.date || 'unavailable'} did not match ${request.date}` : undefined,
    !carrierMatches ? `carrier ${normalized.carrierText || 'unavailable'} did not match ${request.carrier}` : undefined
  ].filter((reason): reason is string => Boolean(reason))

  return {
    id: valueFrom(flight, ['id']) || normalized.flightNumber || 'unknown-flight',
    flightNumber: normalized.flightNumber,
    normalized,
    originMatches,
    destinationMatches,
    dateMatches,
    carrierMatches,
    matched: originMatches && destinationMatches && dateMatches && carrierMatches,
    rejectionReasons
  }
}

function topCounts<T>(values: T[], keyForValue: (value: T) => string, limit = 5) {
  const buckets = new Map<string, { count: number; values: T[] }>()
  values.forEach((value) => {
    const key = keyForValue(value)
    const bucket = buckets.get(key) || { count: 0, values: [] }
    bucket.count += 1
    bucket.values.push(value)
    buckets.set(key, bucket)
  })
  return [...buckets.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, limit)
}

function dayNumber(date?: string) {
  if (!date) return NaN
  const time = Date.parse(`${date}T00:00:00.000Z`)
  return Number.isFinite(time) ? Math.floor(time / 86400000) : NaN
}

function daysBetweenDates(a?: string, b?: string) {
  const left = dayNumber(a)
  const right = dayNumber(b)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Infinity
  return Math.abs(left - right)
}

function uniqueNormalizedFlightDates(diagnostics: FlightRouteMatchDiagnostics[]) {
  return [...new Set(diagnostics.map((diagnostic) => diagnostic.normalized.date).filter(Boolean) as string[])].sort()
}

export function closestAvailableFlightDates(availableDates: string[], requestedDate?: string, limit = 3) {
  if (!requestedDate) return availableDates.slice(-limit).reverse()
  return [...availableDates]
    .sort((a, b) => daysBetweenDates(a, requestedDate) - daysBetweenDates(b, requestedDate) || b.localeCompare(a))
    .slice(0, limit)
}

function dateCoverageDiagnostics(
  diagnostics: FlightRouteMatchDiagnostics[],
  requestedDate?: string,
  options: { effectiveMatchDate?: string; nearestDateApplied?: boolean; nearestDateToleranceDays?: number } = {}
): DateCoverageDiagnostics {
  const availableDates = uniqueNormalizedFlightDates(diagnostics)
  const oldestFlightDate = availableDates[0]
  const newestFlightDate = availableDates[availableDates.length - 1]
  const requestedDateIsNewerThanAvailableData = Boolean(requestedDate && newestFlightDate && dayNumber(requestedDate) > dayNumber(newestFlightDate))
  const closestAvailableDates = closestAvailableFlightDates(availableDates, requestedDate, 5)
  const warning = requestedDateIsNewerThanAvailableData
    ? `Requested search date ${requestedDate} is newer than the newest available flight date ${newestFlightDate}. Closest available dates: ${closestAvailableDates.join(', ') || 'none'}.`
    : undefined

  return {
    requestedSearchDate: requestedDate,
    effectiveMatchDate: options.effectiveMatchDate || requestedDate,
    oldestFlightDate,
    newestFlightDate,
    availableDates,
    closestAvailableDates,
    requestedDateIsNewerThanAvailableData,
    nearestDateApplied: Boolean(options.nearestDateApplied),
    nearestDateToleranceDays: options.nearestDateToleranceDays,
    dateMode: options.nearestDateApplied ? 'nearest-date-testing' : 'strict',
    warning
  }
}

function routeNormalizationDiagnostics(diagnostics: FlightRouteMatchDiagnostics[]): RouteNormalizationDiagnostics {
  const normalizedWithRoutes = diagnostics.filter((diagnostic) => diagnostic.normalized.origin || diagnostic.normalized.destination)
  const routeBuckets = topCounts(normalizedWithRoutes, (diagnostic) => `${diagnostic.normalized.origin || '??'} → ${diagnostic.normalized.destination || '??'}`, 8)
  const carrierSamples = [...new Set(diagnostics.map((diagnostic) => diagnostic.normalized.carrierText).filter(Boolean))].slice(0, 8)
  const dateSamples = [...new Set(diagnostics.map((diagnostic) => diagnostic.normalized.date).filter(Boolean) as string[])].slice(0, 8)

  return {
    normalizedRouteCount: routeBuckets.length,
    normalizedRoutes: routeBuckets.map(([route, bucket]) => ({
      route,
      count: bucket.count,
      sampleFlightNumbers: bucket.values.map((diagnostic) => diagnostic.flightNumber).filter(Boolean).slice(0, 4)
    })),
    missingOriginCount: diagnostics.filter((diagnostic) => !diagnostic.normalized.origin).length,
    missingDestinationCount: diagnostics.filter((diagnostic) => !diagnostic.normalized.destination).length,
    missingDateCount: diagnostics.filter((diagnostic) => !diagnostic.normalized.date).length,
    carrierSamples,
    dateSamples
  }
}

function closestMatchingRoutes(diagnostics: FlightRouteMatchDiagnostics[], request: ParsedItineraryRequest): ClosestMatchingRoute[] {
  const routeBuckets = topCounts(
    diagnostics.filter((diagnostic) => diagnostic.normalized.origin && diagnostic.normalized.destination),
    (diagnostic) => `${diagnostic.normalized.origin} → ${diagnostic.normalized.destination}`,
    diagnostics.length
  )

  return routeBuckets
    .map(([route, bucket]) => {
      const [origin, destination] = route.split(' → ')
      const sameOrigin = Boolean(request.origin && origin === request.origin)
      const sameDestination = Boolean(request.destination && destination === request.destination)
      const sameDateCount = bucket.values.filter((diagnostic) => diagnostic.dateMatches).length
      const sameCarrierCount = bucket.values.filter((diagnostic) => diagnostic.carrierMatches).length
      const score = (sameOrigin ? 4 : 0) + (sameDestination ? 4 : 0) + (sameDateCount > 0 ? 1 : 0) + (sameCarrierCount > 0 ? 1 : 0) + Math.min(bucket.count / 100, 1)
      const exactMatches = bucket.values.filter((diagnostic) => diagnostic.matched).length
      const reason = sameOrigin && sameDestination && exactMatches > 0
        ? 'exact normalized route present in fetched rows'
        : sameOrigin && sameDestination
          ? 'same normalized route, but date or carrier filtering rejected it'
        : sameOrigin
          ? 'same origin; useful as a first-leg or nearby direct candidate'
          : sameDestination
            ? 'same destination; useful as a second-leg or nearby inbound candidate'
            : 'nearby candidate from fetched rows; no exact endpoint match'
      return {
        route,
        count: bucket.count,
        reason,
        sampleFlightNumbers: bucket.values.map((diagnostic) => diagnostic.flightNumber).filter(Boolean).slice(0, 4),
        score
      }
    })
    .sort((a, b) => b.score - a.score || b.count - a.count || a.route.localeCompare(b.route))
    .slice(0, 5)
    .map(({ score: _score, ...route }) => route)
}

function routeMatchExplanation(summary: Pick<RouteMatchingSummary, 'requested' | 'totalCandidates' | 'originMatches' | 'destinationMatches' | 'dateMatches' | 'carrierMatches' | 'exactRouteMatches' | 'finalMatchedRows' | 'dateCoverage'>) {
  if (summary.finalMatchedRows > 0 && summary.dateCoverage.nearestDateApplied) return `${summary.finalMatchedRows} fetched row${summary.finalMatchedRows === 1 ? '' : 's'} matched using Personal Testing Mode nearest-date matching: requested ${summary.dateCoverage.requestedSearchDate || 'any date'}, matched ${summary.dateCoverage.effectiveMatchDate || 'nearest available date'}. Results are not strict same-date matches.`
  if (summary.finalMatchedRows > 0) return `${summary.finalMatchedRows} fetched row${summary.finalMatchedRows === 1 ? '' : 's'} matched the normalized route, carrier, and date filters.`
  if (summary.totalCandidates === 0) return 'No Supabase rows were available to match against this request.'

  if (summary.requested.origin && summary.requested.destination && summary.exactRouteMatches === 0) {
    return `Supabase returned ${summary.totalCandidates} candidate row${summary.totalCandidates === 1 ? '' : 's'}, but no row normalized to exact route ${summary.requested.origin} → ${summary.requested.destination}. See closest matching routes for alternatives in the fetched dataset.`
  }

  const blockers = [
    summary.requested.origin && summary.originMatches === 0 ? `no rows normalized to origin ${summary.requested.origin}` : undefined,
    summary.requested.destination && summary.destinationMatches === 0 ? `no rows normalized to destination ${summary.requested.destination}` : undefined,
    summary.requested.date && summary.dateMatches === 0 ? `no rows matched date ${summary.requested.date}` : undefined,
    summary.requested.carrier && summary.requested.carrier !== 'all' && summary.carrierMatches === 0 ? `no rows matched carrier ${summary.requested.carrier}` : undefined
  ].filter(Boolean)

  if (summary.exactRouteMatches > 0 && blockers.length) {
    return `Supabase returned ${summary.totalCandidates} candidate row${summary.totalCandidates === 1 ? '' : 's'} and ${summary.exactRouteMatches} exact normalized route row${summary.exactRouteMatches === 1 ? '' : 's'}, but ${blockers.join('; ')}.`
  }

  if (blockers.length) return `Supabase returned ${summary.totalCandidates} candidate row${summary.totalCandidates === 1 ? '' : 's'}, but ${blockers.join('; ')}.`
  return `Supabase returned ${summary.totalCandidates} candidate row${summary.totalCandidates === 1 ? '' : 's'}, but no single row matched all normalized route/carrier/date filters together. This usually means fetched rows share only one endpoint, are connection candidates, or the exact route is absent from the current dataset.`
}

export function summarizeRouteMatching(
  flights: Record<string, unknown>[],
  request: ParsedItineraryRequest,
  options: { requestedDate?: string; effectiveMatchDate?: string; nearestDateApplied?: boolean; nearestDateToleranceDays?: number } = {}
): RouteMatchingSummary {
  const diagnostics = flights.map((flight) => routeMatchDiagnosticsForFlight(flight, request))
  const requestedDate = options.requestedDate || request.date
  const summary = {
    requested: {
      origin: request.origin,
      destination: request.destination,
      date: requestedDate,
      carrier: request.carrier || 'all'
    },
    originMatches: diagnostics.filter((diagnostic) => diagnostic.originMatches).length,
    destinationMatches: diagnostics.filter((diagnostic) => diagnostic.destinationMatches).length,
    dateMatches: diagnostics.filter((diagnostic) => diagnostic.dateMatches).length,
    carrierMatches: diagnostics.filter((diagnostic) => diagnostic.carrierMatches).length,
    exactRouteMatches: diagnostics.filter((diagnostic) => {
      const originMatches = request.origin ? diagnostic.normalized.origin === request.origin : true
      const destinationMatches = request.destination ? diagnostic.normalized.destination === request.destination : true
      return originMatches && destinationMatches
    }).length,
    finalMatchedRows: diagnostics.filter((diagnostic) => diagnostic.matched).length,
    totalCandidates: flights.length,
    dateCoverage: dateCoverageDiagnostics(diagnostics, requestedDate, options),
    routeNormalization: routeNormalizationDiagnostics(diagnostics),
    closestMatchingRoutes: closestMatchingRoutes(diagnostics, request),
    rejectedCandidates: diagnostics.filter((diagnostic) => !diagnostic.matched).slice(0, 5)
  }
  return {
    ...summary,
    matchExplanation: routeMatchExplanation(summary)
  }
}

export function flightMatchesRequest(flight: Record<string, unknown>, request: ParsedItineraryRequest) {
  return routeMatchDiagnosticsForFlight(flight, request).matched
}


function stringArrayFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[,/]/).map((item) => item.trim()).filter(Boolean)
  return []
}

function canonicalFlightNumber(value?: string) {
  return String(value || '').replace(/\s+/g, '').toUpperCase()
}

function normalizedScheduleInstant(value?: string) {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value || '')
}

function itineraryDedupeKey(legs: ItineraryLeg[]) {
  return legs.map((leg) => {
    const flightNumber = canonicalFlightNumber(leg.operatingFlightNumber || leg.flightNumber)
    const routeKey = [flightNumber, leg.origin, leg.destination].join('|')
    if (flightNumber) return routeKey
    return [
      routeKey,
      normalizedScheduleInstant(leg.departureTime),
      normalizedScheduleInstant(leg.arrivalTime)
    ].join('|')
  }).join('||')
}

function minutesUntilConnection(firstLeg: ItineraryLeg, secondLeg: ItineraryLeg) {
  const firstArrival = Date.parse(firstLeg.arrivalTime)
  const secondDeparture = Date.parse(secondLeg.departureTime)
  if (!Number.isFinite(firstArrival) || !Number.isFinite(secondDeparture)) return null
  return Math.round((secondDeparture - firstArrival) / 60000)
}

function isFeasibleConnection(firstLeg: ItineraryLeg, secondLeg: ItineraryLeg) {
  const connectionMinutes = minutesUntilConnection(firstLeg, secondLeg)
  if (connectionMinutes === null) return false
  return connectionMinutes >= 35 && connectionMinutes <= 8 * 60
}

function dedupeItineraries(itineraries: ItineraryResult[]) {
  const merged = new Map<string, ItineraryResult>()
  itineraries.forEach((itinerary, index) => {
    const key = itineraryDedupeKey(itinerary.legs) || `itinerary-${index}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, itinerary)
      return
    }
    const marketingFlightNumbers = [...new Set([
      ...(existing.marketingFlightNumbers || []),
      ...(itinerary.marketingFlightNumbers || []),
      itinerary.flightNumber
    ].map(canonicalFlightNumber).filter((number) => number && number !== canonicalFlightNumber(existing.operatingFlightNumber || existing.flightNumber)))]
    merged.set(key, {
      ...existing,
      marketingFlightNumbers,
      duplicateCount: (existing.duplicateCount || 0) + 1 + (itinerary.duplicateCount || 0)
    })
  })
  return [...merged.values()]
}

export function normalizeFlightLeg(flight: Record<string, unknown>, enrichment?: Record<string, unknown>): ItineraryLeg {
  const origin = airportCode(valueFrom(flight, originFieldKeys) || valueFrom(enrichment || {}, ['origin', 'origin_airport', 'origin.code_iata'])) || 'TBD'
  const destination = airportCode(valueFrom(flight, destinationFieldKeys) || valueFrom(enrichment || {}, ['destination', 'destination_airport', 'destination.code_iata'])) || 'TBD'
  const departureTime = valueFrom(flight, ['departure_time', 'scheduled_departure', 'scheduled_out', 'actual_out', 'departure', 'departure.scheduled']) || valueFrom(enrichment || {}, ['scheduled_out', 'actual_out', 'scheduled_off', 'filed_departure_time']) || 'Pending'
  const arrivalTime = valueFrom(flight, ['arrival_time', 'scheduled_arrival', 'scheduled_in', 'actual_in', 'arrival']) || valueFrom(enrichment || {}, ['scheduled_in', 'actual_in', 'scheduled_on', 'estimated_in']) || 'Pending'
  const status = fieldValue(valueFrom(enrichment || {}, ['status']) || valueFrom(flight, ['status', 'flight_status']))
  const score = numberFrom(flight, ['score', 'load_score', 'availability_score'], status.toLowerCase().includes('cancel') ? 35 : 68)
  const departureGate = valueFrom(flight, ['departure_gate', 'gate']) || valueFrom(enrichment || {}, ['gate_origin', 'departure_gate'])
  const arrivalGate = valueFrom(flight, ['arrival_gate']) || valueFrom(enrichment || {}, ['gate_destination', 'arrival_gate'])
  const departureTerminal = valueFrom(flight, ['departure_terminal', 'terminal']) || valueFrom(enrichment || {}, ['terminal_origin', 'departure_terminal'])
  const arrivalTerminal = valueFrom(flight, ['arrival_terminal']) || valueFrom(enrichment || {}, ['terminal_destination', 'arrival_terminal'])
  const rawSourceProvider = valueFrom(flight, ['source_provider']) || 'supabase'
  const sourceProvider = `${rawSourceProvider} ${status}`.toLowerCase().includes('test data')
    ? 'mvp-route-seed-test-data'
    : rawSourceProvider
  const sourceCheckedAt = valueFrom(flight, ['source_checked_at']) || valueFrom(enrichment || {}, ['source_checked_at']) || undefined
  const delayMinutes = Math.max(
    numberFrom(enrichment || {}, ['departure_delay', 'arrival_delay', 'delay_minutes'], 0),
    numberFrom(flight, ['departure_delay', 'arrival_delay', 'delay_minutes'], 0),
    minutesBetween(
      valueFrom(enrichment || {}, ['estimated_out', 'estimated_off', 'estimated_in', 'estimated_on']),
      valueFrom(enrichment || {}, ['scheduled_out', 'scheduled_off', 'scheduled_in', 'scheduled_on'])
    ),
    minutesBetween(
      valueFrom(flight, ['estimated_departure', 'estimated_arrival']),
      valueFrom(flight, ['scheduled_departure', 'scheduled_arrival'])
    )
  )
  const loweredStatus = status.toLowerCase()

  return {
    id: valueFrom(flight, ['id']) || undefined,
    route: `${origin} → ${destination}`,
    origin,
    destination,
    carrier: fieldValue(carrierFromFlight(flight)),
    flightNumber: fieldValue(valueFrom(flight, ['operating_flight_number', 'flight_number', 'ident', 'fa_flight_id'])),
    operatingFlightNumber: fieldValue(valueFrom(flight, ['operating_flight_number', 'flight_number', 'ident', 'fa_flight_id'])),
    marketingFlightNumbers: stringArrayFrom(valueFrom(flight, ['marketing_flight_numbers'])),
    departureTime,
    arrivalTime,
    duration: fieldValue(valueFrom(flight, ['duration']) || durationLabel(minutesBetween(arrivalTime, departureTime))),
    aircraft: fieldValue(valueFrom(enrichment || {}, ['aircraft_type']) || valueFrom(flight, ['aircraft', 'aircraft_type', 'equipment'])),
    status,
    gate: [departureGate, arrivalGate].filter(Boolean).join(' → ') || undefined,
    terminal: [departureTerminal, arrivalTerminal].filter(Boolean).join(' → ') || undefined,
    delayMinutes,
    cancelled: loweredStatus.includes('cancel'),
    diverted: loweredStatus.includes('divert'),
    disruptionSource: enrichment ? 'FlightAware enrichment' : sourceProvider,
    score,
    risk: riskFromScore(score, status),
    source: enrichment ? `${sourceProvider}+flightaware` : sourceProvider,
    sourceProvider,
    sourceCheckedAt,
    duplicateCount: numberFrom(flight, ['duplicate_count'], 0)
  }
}

function enrichmentKey(flight: Record<string, unknown>) {
  return String(flight.flight_number || flight.ident || flight.fa_flight_id || flight.id || '').replace(/\s+/g, '')
}

export function buildAllItinerariesFromFlights(flights: Record<string, unknown>[], request: ParsedItineraryRequest, enrichments: Record<string, Record<string, unknown>> = {}) {
  const candidateLegs = flights
    .filter((flight) => flightMatchesCarrier(flight, request.carrier) && flightMatchesDate(flight, request.date))
    .map((flight) => normalizeFlightLeg(flight, enrichments[enrichmentKey(flight)]))

  const directItineraries = candidateLegs
    .filter((leg) => leg.origin === request.origin && leg.destination === request.destination)
    .map((leg) => itineraryFromLegs([leg]))

  if (!request.origin || !request.destination) {
    return completedItinerariesByArrival(directItineraries, Number.MAX_SAFE_INTEGER)
  }

  const firstLegs = candidateLegs.filter((leg) => leg.origin === request.origin && leg.destination !== request.destination)
  const finalLegs = candidateLegs.filter((leg) => leg.destination === request.destination && leg.origin !== request.origin)

  const oneStopItineraries = request.maxLegs < 2 ? [] : firstLegs
    .flatMap((firstLeg) => finalLegs
      .filter((secondLeg) =>
        secondLeg.origin === firstLeg.destination &&
        isFeasibleConnection(firstLeg, secondLeg)
      )
      .map((secondLeg) => itineraryFromLegs([firstLeg, secondLeg]))
    )

  const twoStopItineraries = request.maxLegs < 3 ? [] : firstLegs
    .flatMap((firstLeg) => candidateLegs
      .filter((middleLeg) =>
        middleLeg.origin === firstLeg.destination &&
        middleLeg.destination !== request.destination &&
        middleLeg.destination !== request.origin &&
        middleLeg.destination !== firstLeg.origin &&
        isFeasibleConnection(firstLeg, middleLeg)
      )
      .flatMap((middleLeg) => finalLegs
        .filter((finalLeg) =>
          finalLeg.origin === middleLeg.destination &&
          isFeasibleConnection(middleLeg, finalLeg)
        )
        .map((finalLeg) => itineraryFromLegs([firstLeg, middleLeg, finalLeg]))
      )
    )

  return completedItinerariesByArrival([...directItineraries, ...oneStopItineraries, ...twoStopItineraries], Number.MAX_SAFE_INTEGER)
}

export function buildItinerariesFromFlights(flights: Record<string, unknown>[], request: ParsedItineraryRequest, enrichments: Record<string, Record<string, unknown>> = {}) {
  return buildAllItinerariesFromFlights(flights, request, enrichments).slice(0, 5)
}

function completedItinerariesByArrival(itineraries: ItineraryResult[], limit = 5) {
  const deduped = dedupeItineraries(itineraries)
  return deduped
    .sort((a, b) => compareItinerariesByDecisionEngine(a, b, deduped))
    .slice(0, limit)
}

function compareItinerariesByDecisionEngine(a: ItineraryResult, b: ItineraryResult, itineraries: ItineraryResult[]) {
  const left = decisionMetricsForResult(a, itineraries)
  const right = decisionMetricsForResult(b, itineraries)
  return decisionArrivalTime(a) - decisionArrivalTime(b) ||
    left.stops - right.stops ||
    right.recoveryStrength - left.recoveryStrength ||
    left.misconnectRisk - right.misconnectRisk ||
    left.totalTravelMinutes - right.totalTravelMinutes ||
    decisionDepartureTime(a) - decisionDepartureTime(b) ||
    a.route.localeCompare(b.route) ||
    b.score - a.score
}

function decisionMetricsForResult(itinerary: ItineraryResult, itineraries: ItineraryResult[]) {
  const buffers = decisionConnectionBuffersMinutes(itinerary)
  const minimumConnectionBuffer = buffers.length ? Math.min(...buffers) : null
  const airlineChanges = decisionAirlineChanges(itinerary)
  const airportChanges = decisionAirportChanges(itinerary)
  const backupAfterFirst = decisionBackupOpportunitiesAfterConnection(itinerary, itineraries, 0)
  const backupAfterSecond = decisionBackupOpportunitiesAfterConnection(itinerary, itineraries, 1)
  const backupCount = backupAfterFirst + backupAfterSecond
  const bufferStrength = minimumConnectionBuffer === null ? 14 : minimumConnectionBuffer >= 90 ? 24 : minimumConnectionBuffer >= 60 ? 14 : -14
  const recoveryStrength = Math.round(Math.max(0, Math.min(100, itinerary.score * 0.35 + backupCount * 14 + bufferStrength - Math.max(0, itinerary.legs.length - 1) * 4 - airlineChanges * 3 - airportChanges * 12)))
  const bufferRisk = minimumConnectionBuffer === null ? 0 : minimumConnectionBuffer < 45 ? 36 : minimumConnectionBuffer < 60 ? 24 : minimumConnectionBuffer < 90 ? 10 : 0
  const misconnectRisk = Math.round(Math.max(0, Math.min(100, Math.max(0, itinerary.legs.length - 1) * 14 + bufferRisk + airlineChanges * 6 + airportChanges * 18)))

  return {
    arrivalRank: decisionArrivalRank(itinerary, itineraries),
    totalTravelMinutes: decisionTotalTravelMinutes(itinerary),
    stops: Math.max(0, itinerary.legs.length - 1),
    connectionBuffers: buffers,
    minimumConnectionBuffer,
    overnightRequired: decisionOvernightRequired(itinerary),
    airlineChanges,
    airportChanges,
    backupOpportunitiesAfterFirstConnection: backupAfterFirst,
    backupOpportunitiesAfterSecondConnection: backupAfterSecond,
    recoveryStrength,
    misconnectRisk
  }
}

function decisionDepartureTime(itinerary: ItineraryResult) {
  return Date.parse(itinerary.departureTime) || Number.MAX_SAFE_INTEGER
}

function decisionArrivalTime(itinerary: ItineraryResult) {
  return Date.parse(itinerary.arrivalTime) || Number.MAX_SAFE_INTEGER
}

function decisionArrivalRank(itinerary: ItineraryResult, itineraries: ItineraryResult[]) {
  const arrivals = [...new Set(itineraries.map(decisionArrivalTime).filter(Number.isFinite))].sort((a, b) => a - b)
  const index = arrivals.findIndex((arrival) => arrival === decisionArrivalTime(itinerary))
  return index >= 0 ? index + 1 : itineraries.length
}

function decisionTotalTravelMinutes(itinerary: ItineraryResult) {
  const departure = decisionDepartureTime(itinerary)
  const arrival = decisionArrivalTime(itinerary)
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure) return Number.MAX_SAFE_INTEGER
  return Math.round((arrival - departure) / 60000)
}

function decisionConnectionBuffersMinutes(itinerary: ItineraryResult) {
  return itinerary.legs.slice(0, -1).map((leg, index) => {
    const arrival = Date.parse(leg.arrivalTime)
    const nextDeparture = Date.parse(itinerary.legs[index + 1]?.departureTime || '')
    if (!Number.isFinite(arrival) || !Number.isFinite(nextDeparture) || nextDeparture <= arrival) return null
    return Math.round((nextDeparture - arrival) / 60000)
  }).filter((value): value is number => value !== null)
}

function decisionCarrierCode(leg: ItineraryLeg) {
  const normalizedFlight = (leg.operatingFlightNumber || leg.flightNumber || '').replace(/\s+/g, '').toUpperCase()
  const flightCode = normalizedFlight.match(/^([A-Z]{1,2}|[A-Z]\d|\d[A-Z])\d{1,4}$/)?.[1]
  const carrierCode = leg.carrier.trim().split(/\s+/).find((word) => /^[A-Z0-9]{2,3}$/.test(word))
  return carrierCode || flightCode || leg.carrier.trim().toUpperCase()
}

function decisionAirlineChanges(itinerary: ItineraryResult) {
  if (itinerary.legs.length < 2) return 0
  return itinerary.legs.slice(0, -1).filter((leg, index) => decisionCarrierCode(leg) !== decisionCarrierCode(itinerary.legs[index + 1])).length
}

function decisionAirportChanges(itinerary: ItineraryResult) {
  if (itinerary.legs.length < 2) return 0
  return itinerary.legs.slice(0, -1).filter((leg, index) => leg.destination !== itinerary.legs[index + 1]?.origin).length
}

function decisionBackupOpportunitiesAfterConnection(itinerary: ItineraryResult, itineraries: ItineraryResult[], connectionIndex: number) {
  const connectionAirport = itinerary.legs[connectionIndex]?.destination
  const missedLeg = itinerary.legs[connectionIndex + 1]
  const missedDeparture = Date.parse(missedLeg?.departureTime || '')
  if (!connectionAirport || !Number.isFinite(missedDeparture)) return 0
  const alternatives = new Set<string>()
  itineraries.forEach((candidate) => {
    candidate.legs.forEach((leg) => {
      const departure = Date.parse(leg.departureTime)
      if (leg.origin !== connectionAirport || !Number.isFinite(departure) || departure <= missedDeparture) return
      alternatives.add(`${leg.origin}-${leg.destination}-${leg.operatingFlightNumber || leg.flightNumber}-${leg.departureTime}`)
    })
  })
  return alternatives.size
}

function decisionOvernightRequired(itinerary: ItineraryResult) {
  const departure = decisionDepartureTime(itinerary)
  const arrival = decisionArrivalTime(itinerary)
  if (!Number.isFinite(departure) || !Number.isFinite(arrival)) return false
  const departureDate = new Date(departure)
  const arrivalDate = new Date(arrival)
  const departureDay = Date.UTC(departureDate.getUTCFullYear(), departureDate.getUTCMonth(), departureDate.getUTCDate())
  const arrivalDay = Date.UTC(arrivalDate.getUTCFullYear(), arrivalDate.getUTCMonth(), arrivalDate.getUTCDate())
  return arrivalDay > departureDay
}

function itineraryFromLegs(legs: ItineraryLeg[]): ItineraryResult {
  const score = Math.round(average(legs.map((leg) => leg.score)) - (legs.length - 1) * 5)
  const route = legs.length === 1
    ? legs[0].route
    : [legs[0].origin, ...legs.map((leg) => leg.destination)].join(' → ')
  return {
    id: legs.map((leg) => leg.id || leg.flightNumber).join('-'),
    route,
    legs,
    carrier: [...new Set(legs.map((leg) => leg.carrier))].join(' + '),
    flightNumber: legs.map((leg) => leg.operatingFlightNumber || leg.flightNumber).join(' / '),
    operatingFlightNumber: legs.map((leg) => leg.operatingFlightNumber || leg.flightNumber).join(' / '),
    marketingFlightNumbers: [...new Set(legs.flatMap((leg) => leg.marketingFlightNumbers || []))],
    departureTime: legs[0].departureTime,
    arrivalTime: legs[legs.length - 1].arrivalTime,
    duration: legs.map((leg) => leg.duration).filter(Boolean).join(' + ') || notProvidedLabel,
    aircraft: [...new Set(legs.map((leg) => leg.aircraft))].join(' + '),
    status: legs.map((leg) => leg.status).every((status) => status === legs[0].status) ? legs[0].status : 'Mixed',
    gate: legs.map((leg) => leg.gate).filter(Boolean).join(' · ') || undefined,
    terminal: legs.map((leg) => leg.terminal).filter(Boolean).join(' · ') || undefined,
    score,
    risk: riskFromScore(score, legs.map((leg) => leg.status).join(' ')),
    source: legs.some((leg) => leg.source.includes('flightaware'))
      ? `${legs[0].source.replace('+flightaware', '')}+flightaware`
      : legs[0].source,
    sourceProvider: legs[0].sourceProvider,
    sourceCheckedAt: legs.map((leg) => leg.sourceCheckedAt).filter(Boolean).sort().slice(-1)[0],
    duplicateCount: legs.reduce((total, leg) => total + (leg.duplicateCount || 0), 0)
  }
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function carrierLabel(value?: string) {
  return carrierLabels[value || 'all'] || value || 'All Supported Carriers'
}
