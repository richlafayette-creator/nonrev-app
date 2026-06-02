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
  },
  SEA: {
    code: 'SEA',
    name: 'Seattle-Tacoma International Airport',
    latitude: 47.4502,
    longitude: -122.3088,
    terminalPlaceholder: 'Concourses/satellites data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near concourse pending lounge API',
    navigationPlaceholder: 'Satellite train/walking route placeholder'
  },
  ORD: {
    code: 'ORD',
    name: "Chicago O'Hare International Airport",
    latitude: 41.9742,
    longitude: -87.9073,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Terminal transfer placeholder'
  },
  IAH: {
    code: 'IAH',
    name: 'George Bush Intercontinental Airport',
    latitude: 29.9902,
    longitude: -95.3368,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Skyway/subway transfer placeholder'
  },
  ATL: {
    code: 'ATL',
    name: 'Hartsfield-Jackson Atlanta International Airport',
    latitude: 33.6407,
    longitude: -84.4277,
    terminalPlaceholder: 'Concourse data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near concourse pending lounge API',
    navigationPlaceholder: 'Plane Train/walking route placeholder'
  },
  DTW: {
    code: 'DTW',
    name: 'Detroit Metropolitan Wayne County Airport',
    latitude: 42.2162,
    longitude: -83.3554,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Terminal walking/tram placeholder'
  },
  MSP: {
    code: 'MSP',
    name: 'Minneapolis-Saint Paul International Airport',
    latitude: 44.8848,
    longitude: -93.2223,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Terminal transfer placeholder'
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
