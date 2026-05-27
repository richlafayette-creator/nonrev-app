export type AirportMapScaffold = {
  code: string
  name: string
  latitude: number
  longitude: number
  terminalPlaceholder: string
  gatePlaceholder: string
  loungePlaceholder: string
  navigationPlaceholder: string
}

export const airportMapScaffolds: Record<string, AirportMapScaffold> = {
  LAX: {
    code: 'LAX',
    name: 'Los Angeles International Airport',
    latitude: 33.9416,
    longitude: -118.4085,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Indoor routing/GPS placeholder'
  },
  HNL: {
    code: 'HNL',
    name: 'Daniel K. Inouye International Airport',
    latitude: 21.3187,
    longitude: -157.9225,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Airport navigation placeholder'
  },
  OGG: {
    code: 'OGG',
    name: 'Kahului Airport',
    latitude: 20.8986,
    longitude: -156.4305,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability pending provider data',
    navigationPlaceholder: 'Airport navigation placeholder'
  },
  JFK: {
    code: 'JFK',
    name: 'John F. Kennedy International Airport',
    latitude: 40.6413,
    longitude: -73.7781,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Inter-terminal navigation placeholder'
  },
  LHR: {
    code: 'LHR',
    name: 'London Heathrow Airport',
    latitude: 51.47,
    longitude: -0.4543,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Inter-terminal navigation placeholder'
  },
  CDG: {
    code: 'CDG',
    name: 'Paris Charles de Gaulle Airport',
    latitude: 49.0097,
    longitude: 2.5479,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Airport navigation placeholder'
  },
  SFO: {
    code: 'SFO',
    name: 'San Francisco International Airport',
    latitude: 37.6213,
    longitude: -122.379,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'AirTrain/walking route placeholder'
  },
  DEN: {
    code: 'DEN',
    name: 'Denver International Airport',
    latitude: 39.8561,
    longitude: -104.6737,
    terminalPlaceholder: 'Terminal/concourse data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near concourse pending lounge API',
    navigationPlaceholder: 'Train/walking route placeholder'
  }
}

export function airportCodesFromRoute(route: string) {
  return Array.from(new Set((route.match(/\b[A-Z]{3}\b/g) || [])))
}

export function airportScaffoldFor(code?: string | null) {
  if (!code) return null
  return airportMapScaffolds[code.toUpperCase()] || null
}

export function mapboxStaticImageUrl(airport: AirportMapScaffold, token?: string) {
  if (!token) return ''
  const marker = `pin-s-airport+38bdf8(${airport.longitude},${airport.latitude})`
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${marker}/${airport.longitude},${airport.latitude},12,0/640x320?access_token=${token}`
}
