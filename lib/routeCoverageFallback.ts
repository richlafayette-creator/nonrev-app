export type RouteCoverageFallbackRequest = {
  origin?: string
  destination?: string
  date?: string
}

export type AirportGroupName = 'Tokyo' | 'London' | 'Rome' | 'Paris' | 'NYC' | 'Los Angeles' | 'Bay Area'

export type AirportGroup = {
  name: AirportGroupName
  codes: string[]
  aliases: string[]
}

export type RouteCoverageLookupStatus = 'not_checked' | 'provider_rows_found' | 'provider_no_rows' | 'provider_warning' | 'skipped_rate_limited'

export type RouteCoverageSuggestionKind = 'hub-positioning' | 'destination-airport-group' | 'hub-to-destination-group'

export type RouteCoverageSuggestion = {
  id: string
  kind: RouteCoverageSuggestionKind
  label: string
  searchQuery: string
  origin: string
  destination: string
  via?: string
  confidence: 'Conservative'
  basis: string
  lookupStatus: RouteCoverageLookupStatus
  providerResultCount: number
  providerDetail?: string
}

export const airportGroups: AirportGroup[] = [
  { name: 'Tokyo', codes: ['HND', 'NRT'], aliases: ['TOKYO'] },
  { name: 'London', codes: ['LHR', 'LGW'], aliases: ['LONDON'] },
  { name: 'Rome', codes: ['FCO', 'CIA'], aliases: ['ROME'] },
  { name: 'Paris', codes: ['CDG', 'ORY'], aliases: ['PARIS'] },
  { name: 'NYC', codes: ['JFK', 'EWR', 'LGA'], aliases: ['NYC', 'NEWYORK'] },
  { name: 'Los Angeles', codes: ['LAX', 'BUR', 'SNA'], aliases: ['LOSANGELES', 'LA'] },
  { name: 'Bay Area', codes: ['SFO', 'SJC', 'OAK'], aliases: ['BAYAREA', 'SANFRANCISCOBAY', 'SF'] }
]

export const smallAirportHubMap: Record<string, string[]> = {
  SBP: ['LAX', 'SFO', 'SEA', 'DEN', 'PHX'],
  MRY: ['SFO', 'LAX'],
  SMX: ['LAX', 'SFO'],
  SBA: ['LAX', 'SFO', 'SEA', 'DEN', 'PHX'],
  RDM: ['SEA', 'SFO', 'DEN', 'LAX', 'PHX'],
  AVL: ['CLT', 'ATL', 'IAD', 'ORD', 'DEN'],
  CHO: ['IAD', 'DCA', 'CLT', 'ATL', 'ORD'],
  FAR: ['MSP', 'ORD', 'DEN', 'DFW', 'SEA']
}

const airportGroupLookup = airportGroups.reduce<Record<string, AirportGroup>>((lookup, group) => {
  group.codes.forEach((code) => { lookup[code] = group })
  group.aliases.forEach((alias) => { lookup[alias] = group })
  return lookup
}, {})

function airportCode(value?: string) {
  const normalized = value?.trim().toUpperCase()
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : undefined
}

function uniqueCodes(codes: string[]) {
  return [...new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{3}$/.test(code)))]
}

function suggestionId(kind: RouteCoverageSuggestionKind, origin: string, destination: string, via?: string) {
  return [kind, origin, via, destination].filter(Boolean).join('-').toLowerCase()
}

function createSuggestion({
  kind,
  origin,
  destination,
  via,
  basis,
  label
}: {
  kind: RouteCoverageSuggestionKind
  origin: string
  destination: string
  via?: string
  basis: string
  label: string
}): RouteCoverageSuggestion {
  const route = via ? `${origin} → ${via} → ${destination}` : `${origin} → ${destination}`
  return {
    id: suggestionId(kind, origin, destination, via),
    kind,
    label,
    searchQuery: route,
    origin,
    destination,
    via,
    confidence: 'Conservative',
    basis,
    lookupStatus: 'not_checked',
    providerResultCount: 0
  }
}

function airportGroupFor(value?: string) {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z]/g, '')
  return normalized ? airportGroupLookup[normalized] : undefined
}

export function destinationAirportGroup(destination?: string) {
  const normalized = destination?.trim().toUpperCase()
  const group = airportGroupFor(normalized)
  return normalized ? uniqueCodes(group?.codes || [normalized]) : []
}

export function positioningHubsForOrigin(origin?: string) {
  const normalized = origin?.trim().toUpperCase()
  if (!normalized) return []
  return uniqueCodes(smallAirportHubMap[normalized] || []).filter((hub) => hub !== normalized)
}

export function buildRouteCoverageFallbackSuggestions(request: RouteCoverageFallbackRequest, limit = 10): RouteCoverageSuggestion[] {
  const origin = airportCode(request.origin)
  const destination = airportCode(request.destination)
  if (!origin && !destination) return []

  const hubs = positioningHubsForOrigin(origin).filter((hub) => hub !== destination)
  const suggestions: RouteCoverageSuggestion[] = []

  if (origin && destination && hubs.length) {
    hubs.slice(0, 5).forEach((hub) => {
      if (hub === destination) return
      suggestions.push(createSuggestion({
        kind: 'hub-to-destination-group',
        origin,
        via: hub,
        destination,
        label: `${origin} → ${hub} → ${destination}`,
        basis: `Search this as a complete route framework: position from ${origin} to ${hub}, then continue to ${destination}. Keep confidence conservative until live results appear.`
      }))
    })
  }

  const deduped = new Map<string, RouteCoverageSuggestion>()
  suggestions.forEach((suggestion) => {
    if (!deduped.has(suggestion.id)) deduped.set(suggestion.id, suggestion)
  })
  return [...deduped.values()].slice(0, limit)
}

export function applyRouteCoverageLookupResult(
  suggestion: RouteCoverageSuggestion,
  result: { status: RouteCoverageLookupStatus; providerResultCount?: number; providerDetail?: string }
): RouteCoverageSuggestion {
  return {
    ...suggestion,
    lookupStatus: result.status,
    providerResultCount: result.providerResultCount || 0,
    providerDetail: result.providerDetail
  }
}
