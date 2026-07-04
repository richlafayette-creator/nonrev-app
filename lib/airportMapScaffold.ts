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
  HND: {
    code: 'HND',
    name: 'Tokyo Haneda Airport',
    latitude: 35.5494,
    longitude: 139.7798,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Premium cabin/lounge guidance pending provider data',
    navigationPlaceholder: 'Tokyo Haneda terminal navigation placeholder'
  },
  NRT: {
    code: 'NRT',
    name: 'Tokyo Narita International Airport',
    latitude: 35.7719,
    longitude: 140.3929,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Premium cabin/lounge guidance pending provider data',
    navigationPlaceholder: 'Tokyo Narita terminal navigation placeholder'
  },
  SBP: {
    code: 'SBP',
    name: 'San Luis Obispo County Regional Airport',
    latitude: 35.2368,
    longitude: -120.6421,
    terminalPlaceholder: 'Small-airport terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability limited; verify airport amenities before travel',
    navigationPlaceholder: 'San Luis Obispo airport navigation placeholder'
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
  },
  PHX: {
    code: 'PHX',
    name: 'Phoenix Sky Harbor International Airport',
    latitude: 33.4352,
    longitude: -112.0101,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Sky Train/terminal transfer placeholder'
  },
  CLT: {
    code: 'CLT',
    name: 'Charlotte Douglas International Airport',
    latitude: 35.214,
    longitude: -80.9431,
    terminalPlaceholder: 'Concourse data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near concourse pending lounge API',
    navigationPlaceholder: 'Concourse walking route placeholder'
  },
  DCA: {
    code: 'DCA',
    name: 'Ronald Reagan Washington National Airport',
    latitude: 38.8512,
    longitude: -77.0402,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability pending provider data',
    navigationPlaceholder: 'Terminal walking route placeholder'
  },
  DFW: {
    code: 'DFW',
    name: 'Dallas Fort Worth International Airport',
    latitude: 32.8998,
    longitude: -97.0403,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Skylink/terminal transfer placeholder'
  },
  MRY: {
    code: 'MRY',
    name: 'Monterey Regional Airport',
    latitude: 36.587,
    longitude: -121.8429,
    terminalPlaceholder: 'Small-airport terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability limited; verify airport amenities before travel',
    navigationPlaceholder: 'Monterey airport navigation placeholder'
  },
  SMX: {
    code: 'SMX',
    name: 'Santa Maria Public Airport',
    latitude: 34.8989,
    longitude: -120.4576,
    terminalPlaceholder: 'Small-airport terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability limited; verify airport amenities before travel',
    navigationPlaceholder: 'Santa Maria airport navigation placeholder'
  },
  SBA: {
    code: 'SBA',
    name: 'Santa Barbara Airport',
    latitude: 34.4262,
    longitude: -119.8404,
    terminalPlaceholder: 'Small-airport terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability limited; verify airport amenities before travel',
    navigationPlaceholder: 'Santa Barbara airport navigation placeholder'
  },
  RDM: {
    code: 'RDM',
    name: 'Redmond Municipal Airport',
    latitude: 44.2541,
    longitude: -121.15,
    terminalPlaceholder: 'Small-airport terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability limited; verify airport amenities before travel',
    navigationPlaceholder: 'Redmond airport navigation placeholder'
  },
  AVL: {
    code: 'AVL',
    name: 'Asheville Regional Airport',
    latitude: 35.4362,
    longitude: -82.5418,
    terminalPlaceholder: 'Small-airport terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability limited; verify airport amenities before travel',
    navigationPlaceholder: 'Asheville airport navigation placeholder'
  },
  CHO: {
    code: 'CHO',
    name: 'Charlottesville-Albemarle Airport',
    latitude: 38.1386,
    longitude: -78.4529,
    terminalPlaceholder: 'Small-airport terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability limited; verify airport amenities before travel',
    navigationPlaceholder: 'Charlottesville airport navigation placeholder'
  },
  FAR: {
    code: 'FAR',
    name: 'Hector International Airport',
    latitude: 46.9207,
    longitude: -96.8158,
    terminalPlaceholder: 'Small-airport terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability limited; verify airport amenities before travel',
    navigationPlaceholder: 'Fargo airport navigation placeholder'
  },
  LGW: {
    code: 'LGW',
    name: 'London Gatwick Airport',
    latitude: 51.1537,
    longitude: -0.1821,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Terminal transfer placeholder'
  },
  CIA: {
    code: 'CIA',
    name: 'Rome Ciampino Airport',
    latitude: 41.7994,
    longitude: 12.5949,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability pending provider data',
    navigationPlaceholder: 'Airport navigation placeholder'
  },
  ORY: {
    code: 'ORY',
    name: 'Paris Orly Airport',
    latitude: 48.7262,
    longitude: 2.3652,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Terminal transfer placeholder'
  },
  EWR: {
    code: 'EWR',
    name: 'Newark Liberty International Airport',
    latitude: 40.6895,
    longitude: -74.1745,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'AirTrain/terminal transfer placeholder'
  },
  LGA: {
    code: 'LGA',
    name: 'LaGuardia Airport',
    latitude: 40.7769,
    longitude: -73.874,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Terminal transfer placeholder'
  },
  BUR: {
    code: 'BUR',
    name: 'Hollywood Burbank Airport',
    latitude: 34.2007,
    longitude: -118.3587,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability pending provider data',
    navigationPlaceholder: 'Burbank airport navigation placeholder'
  },
  SNA: {
    code: 'SNA',
    name: 'John Wayne Airport',
    latitude: 33.6757,
    longitude: -117.8682,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounge availability pending provider data',
    navigationPlaceholder: 'Orange County airport navigation placeholder'
  },
  SJC: {
    code: 'SJC',
    name: 'San Jose Mineta International Airport',
    latitude: 37.3639,
    longitude: -121.9289,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Terminal transfer placeholder'
  },
  OAK: {
    code: 'OAK',
    name: 'Oakland International Airport',
    latitude: 37.7126,
    longitude: -122.2197,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Terminal transfer placeholder'
  },
  FCO: {
    code: 'FCO',
    name: 'Rome Fiumicino Leonardo da Vinci Airport',
    latitude: 41.8003,
    longitude: 12.2389,
    terminalPlaceholder: 'Terminal data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near terminal pending lounge API',
    navigationPlaceholder: 'Terminal transfer placeholder'
  },
  IAD: {
    code: 'IAD',
    name: 'Washington Dulles International Airport',
    latitude: 38.9531,
    longitude: -77.4565,
    terminalPlaceholder: 'Terminal/concourse data pending provider connection',
    gatePlaceholder: 'Gate-level data pending provider connection',
    loungePlaceholder: 'Lounges near concourse pending lounge API',
    navigationPlaceholder: 'AeroTrain/mobile lounge transfer placeholder'
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
