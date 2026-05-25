export type SearchableFlight = {
  origin?: string | null
  destination?: string | null
  flight_number?: string | null
  aircraft?: string | null
  status?: string | null
  score?: number | null
}

function clean(value: string) {
  return value
    .toUpperCase()
    .replace(/\bFLIGHT\b/g, ' ')
    .replace(/[#→–—/]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\bTO\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value: string) {
  return clean(value).replace(/\s+/g, '')
}

export function flightMatchesSearch(flight: SearchableFlight, rawQuery: string) {
  const query = clean(rawQuery)
  if (!query) return true

  const origin = clean(flight.origin || '')
  const destination = clean(flight.destination || '')
  const flightNumber = clean(flight.flight_number || '')
  const route = `${origin} ${destination}`.trim()
  const compactRoute = compact(`${origin}${destination}`)
  const compactQuery = compact(query)
  const haystack = clean([
    origin,
    destination,
    flightNumber,
    compact(flight.flight_number || ''),
    flight.aircraft || '',
    flight.status || '',
    String(flight.score ?? '')
  ].join(' '))

  if (flightNumber === query || compact(flightNumber) === compactQuery) return true
  if (route === query || compactRoute === compactQuery) return true

  const routeTokens = query.match(/\b[A-Z]{3}\b/g)
  if (routeTokens && routeTokens.length >= 2) {
    const [from, to] = routeTokens
    if (origin === from && destination === to) return true
  }

  return query.split(' ').every((term) => haystack.includes(term))
}
