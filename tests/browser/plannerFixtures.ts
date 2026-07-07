function futureIso(daysFromNow: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  return date.toISOString().slice(0, 10)
}

function isoAt(date: string, time: string) {
  return `${date}T${time}:00.000Z`
}

const fixtureDate = futureIso(35)

export const plannerSmokeSearches = {
  itineraryCards: 'SFO to HNL',
  originCoverage: 'MRY to OGG',
  emptyState: 'SBP to NRT'
} as const

export function plannerItineraryFixture() {
  const departure = isoAt(fixtureDate, '15:00')
  const arrival = isoAt(fixtureDate, '20:40')

  return {
    ok: true,
    count: 1,
    dataMode: 'live-provider',
    sourceLabel: 'FlightAware live schedules',
    request: { origin: 'SFO', destination: 'HNL', date: fixtureDate },
    warnings: [],
    itineraries: [
      {
        id: 'smoke-live-sfo-hnl-1',
        route: 'SFO → HNL',
        origin: 'SFO',
        destination: 'HNL',
        carrier: 'United',
        flightNumber: 'UA1170',
        operatingFlightNumber: 'UA1170',
        departureTime: departure,
        arrivalTime: arrival,
        duration: '5h 40m',
        aircraft: '777 smoke fixture',
        status: 'Smoke fixture live provider row',
        score: 82,
        risk: 'Medium',
        source: 'flightaware',
        sourceProvider: 'flightaware',
        sourceCheckedAt: new Date().toISOString(),
        dataFreshnessLabel: 'Live provider API data',
        dataFreshnessDetail: 'Smoke fixture exact requested-date provider row.',
        dataFreshnessRule: 'exact-requested-date',
        providerBadges: ['Live provider API data', 'FlightAware smoke fixture'],
        productionAvailability: true,
        requestedDate: fixtureDate,
        matchedDate: fixtureDate,
        legs: [
          {
            id: 'smoke-leg-sfo-hnl-1',
            route: 'SFO → HNL',
            origin: 'SFO',
            destination: 'HNL',
            carrier: 'United',
            flightNumber: 'UA1170',
            departureTime: departure,
            arrivalTime: arrival,
            duration: '5h 40m',
            aircraft: '777 smoke fixture',
            status: 'Smoke fixture live provider row',
            score: 82,
            risk: 'Medium',
            source: 'flightaware',
            sourceProvider: 'flightaware'
          }
        ]
      }
    ],
    frameworkRoutes: [],
    debug: {
      parsedOrigin: 'SFO',
      parsedDestination: 'HNL',
      testDataModeEnabled: false,
      originCoverage: {
        status: 'sufficient',
        origin: 'SFO',
        destination: 'HNL',
        providerOriginRowCount: 1,
        frameworkRouteCount: 1,
        message: 'Smoke fixture has provider coverage.',
        recommendations: [],
        limitations: []
      }
    }
  }
}

export function originCoverageFixture() {
  return {
    ok: true,
    count: 0,
    dataMode: 'no-current-live-data',
    sourceLabel: 'Smoke fixture provider diagnostics',
    request: { origin: 'MRY', destination: 'OGG', date: fixtureDate },
    warnings: ['Provider coverage is limited from MRY.'],
    itineraries: [],
    frameworkRoutes: [],
    debug: {
      parsedOrigin: 'MRY',
      parsedDestination: 'OGG',
      testDataModeEnabled: false,
      originCoverage: {
        status: 'insufficient',
        origin: 'MRY',
        destination: 'OGG',
        providerOriginRowCount: 0,
        frameworkRouteCount: 0,
        message: 'Provider coverage is limited from MRY. Try a nearby supported origin without treating it as a substitute for the requested origin.',
        recommendations: [
          { code: 'SJC', name: 'San Jose Mineta International', distanceMiles: 54, searchQuery: 'SJC → OGG', reason: 'Nearest supported Bay Area origin.' },
          { code: 'SFO', name: 'San Francisco International', distanceMiles: 77, searchQuery: 'SFO → OGG', reason: 'Large supported hub.' },
          { code: 'LAX', name: 'Los Angeles International', distanceMiles: 266, searchQuery: 'LAX → OGG', reason: 'Large supported West Coast hub.' }
        ],
        limitations: ['Alternate origins are search suggestions only.', 'No standby availability is claimed.']
      },
      routeCoverageSuggestions: []
    }
  }
}

export function emptyStateFixture() {
  return {
    ok: true,
    count: 0,
    dataMode: 'no-current-live-data',
    sourceLabel: 'Smoke fixture empty provider result',
    request: { origin: 'SBP', destination: 'NRT', date: fixtureDate },
    warnings: ['No current live rows passed trust checks for this smoke fixture.'],
    itineraries: [],
    frameworkRoutes: [],
    routeCoverageSuggestions: [],
    debug: {
      parsedOrigin: 'SBP',
      parsedDestination: 'NRT',
      testDataModeEnabled: false,
      trueLiveDataUnavailableReason: 'Smoke fixture intentionally returns no current live rows.',
      providerExplanation: ['Smoke fixture empty result.'],
      dataFreshnessExplanation: ['No current live availability was supplied by the fixture.'],
      routeCoverageSuggestions: [],
      originCoverage: {
        status: 'sufficient',
        origin: 'SBP',
        destination: 'NRT',
        providerOriginRowCount: 1,
        frameworkRouteCount: 0,
        message: 'Smoke fixture origin coverage is sufficient but no live rows are available.',
        recommendations: [],
        limitations: []
      }
    }
  }
}

export { fixtureDate as plannerSmokeFixtureDate }
