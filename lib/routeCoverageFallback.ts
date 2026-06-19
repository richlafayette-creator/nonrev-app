export type RouteCoverageFallbackRequest = {
  origin?: string
  destination?: string
  date?: string
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

const smallAirportHubMap: Record<string, string[]> = {
  SBP: ['LAX', 'SFO', 'SEA', 'DEN', 'PHX'],
  SBA: ['LAX', 'SFO', 'SEA', 'DEN', 'PHX'],
  RDM: ['SEA', 'SFO', 'DEN', 'LAX', 'PHX'],
  AVL: ['CLT', 'ATL', 'IAD', 'ORD', 'DEN'],
  CHO: ['IAD', 'DCA', 'CLT', 'ATL', 'ORD'],
  FAR: ['MSP', 'ORD', 'DEN', 'DFW', 'SEA']
}

const defaultPositioningHubs = ['LAX', 'SFO', 'SEA', 'DEN', 'PHX']

const internationalAirportGroups: Record<string, string[]> = {
  HND: ['HND', 'NRT'],
  NRT: ['HND', 'NRT'],
  TOKYO: ['HND', 'NRT'],
  FCO: ['FCO', 'CIA'],
  CIA: ['FCO', 'CIA'],
  ROME: ['FCO', 'CIA'],
  LHR: ['LHR', 'LGW'],
  LGW: ['LHR', 'LGW'],
  LONDON: ['LHR', 'LGW'],
  CDG: ['CDG', 'ORY'],
  ORY: ['CDG', 'ORY'],
  PARIS: ['CDG', 'ORY']
}

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

export function destinationAirportGroup(destination?: string) {
  const normalized = destination?.trim().toUpperCase()
  return normalized ? uniqueCodes(internationalAirportGroups[normalized] || [normalized]) : []
}

export function positioningHubsForOrigin(origin?: string) {
  const normalized = origin?.trim().toUpperCase()
  if (!normalized) return []
  return uniqueCodes(smallAirportHubMap[normalized] || defaultPositioningHubs).filter((hub) => hub !== normalized)
}

export function buildRouteCoverageFallbackSuggestions(request: RouteCoverageFallbackRequest, limit = 10): RouteCoverageSuggestion[] {
  const origin = airportCode(request.origin)
  const destination = airportCode(request.destination)
  if (!origin && !destination) return []

  const destinationGroup = destinationAirportGroup(destination).filter((code) => code !== origin)
  const hubs = positioningHubsForOrigin(origin).filter((hub) => hub !== destination)
  const suggestions: RouteCoverageSuggestion[] = []

  if (origin && destination && hubs.length) {
    const destinationOptions = destinationGroup.length ? destinationGroup : [destination]
    hubs.slice(0, 5).forEach((hub) => {
      destinationOptions.slice(0, 2).forEach((destinationOption) => {
        if (hub === destinationOption) return
        suggestions.push(createSuggestion({
          kind: 'hub-to-destination-group',
          origin,
          via: hub,
          destination: destinationOption,
          label: `Try ${hub} to ${destinationOption}`,
          basis: `Search the long-haul or trunk segment separately after positioning to ${hub}. Keep confidence conservative until live results appear.`
        }))
      })
    })
  }

  if (origin && destinationGroup.length) {
    destinationGroup
      .filter((alternateDestination) => alternateDestination !== destination)
      .forEach((alternateDestination) => suggestions.push(createSuggestion({
        kind: 'destination-airport-group',
        origin,
        destination: alternateDestination,
        label: `Try ${origin} to ${alternateDestination}`,
        basis: 'Nearby international airport in the same destination market. Search this as route guidance only until live availability is confirmed.'
      })))
  }

  if (origin && hubs.length) {
    hubs.forEach((hub) => suggestions.push(createSuggestion({
      kind: 'hub-positioning',
      origin,
      destination: hub,
      label: `Position to ${hub}`,
      basis: `${origin} is better covered by searching common positioning hubs first. This does not imply seat availability.`
    })))
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
