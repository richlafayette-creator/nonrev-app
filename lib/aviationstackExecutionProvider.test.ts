import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createAviationstackExecutionProvider } from './aviationstackExecutionProvider.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { SearchExecutionEngine, type SearchExecutionRequest } from './searchExecutionEngine.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { executeSearchApiAsync } from './searchResponse.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTravelerProfile } from './travelerProfile.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTripMission } from './tripMission.ts'
import type { LiveScheduleProvider, LiveScheduleProviderResponse, NormalizedScheduleResult } from './liveScheduleProviders'

const originalFetch = globalThis.fetch
const originalKey = process.env.AVIATIONSTACK_API_KEY
const now = new Date('2026-07-22T00:00:00.000Z')

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.AVIATIONSTACK_API_KEY
  else process.env.AVIATIONSTACK_API_KEY = originalKey
})

describe('aviationstack search execution provider', () => {
  it('reports missing API key as unavailable without calling the provider', async () => {
    const provider = createAviationstackExecutionProvider({ apiKey: '   ', now: () => now })
    const result = await new SearchExecutionEngine({ providers: [provider] }).execute(request())

    assert.equal(result.providerRuns[0].status, 'skipped')
    assert.equal(result.providerRuns[0].readiness.status, 'credential_missing')
    assert.deepEqual(result.itineraries, [])
  })

  it('trims configured keys and exposes explicit non-load capabilities', () => {
    const provider = createAviationstackExecutionProvider({ apiKey: ' key ', now: () => now, provider: stubProvider([]) })

    assert.equal(provider.readiness.status, 'ready')
    assert.equal(provider.capabilities.schedules, true)
    assert.equal(provider.capabilities.flightStatus, true)
    assert.equal(provider.capabilities.loads, false)
    assert.equal(provider.capabilities.fares, false)
    assert.equal(provider.capabilities.zedEligibility, false)
  })

  it('constructs bounded AeroDataBox airport requests without exposing the key', async () => {
    const captured: string[] = []
    globalThis.fetch = async (url) => {
      captured.push(String(url))
      return jsonResponse({ departures: [] })
    }
    const provider = createAviationstackExecutionProvider({ apiKey: 'test-secret-key', now: () => now, cache: new Map() })
    const result = await new SearchExecutionEngine({ providers: [provider] }).execute(request())

    assert.equal(captured.length, 2)
    assert.ok(captured.every((url) => url.startsWith('https://prod.api.market/api/v1/aedbx/aerodatabox/flights/airports/Iata/LAX/')))
    assert.ok(captured[0].includes('2026-07-27T00%3A00/2026-07-27T12%3A00'))
    assert.ok(captured[1].includes('2026-07-27T12%3A00/2026-07-27T23%3A59'))
    assert.ok(captured.every((url) => url.includes('direction=Departure')))
    assert.equal(captured.some((url) => url.includes('test-secret-key')), false)
    assert.equal(JSON.stringify(result).includes('test-secret-key'), false)
  })

  it('normalizes a successful airport-pair result with attribution', async () => {
    const result = await executeWith([schedule()])
    const segment = result.itineraries[0].segments[0]

    assert.equal(result.providerRuns[0].status, 'success')
    assert.equal(segment.origin, 'LAX')
    assert.equal(segment.destination, 'HND')
    assert.equal(segment.transportType, 'flight')
    assert.equal(segment.airlineCode, 'JL')
    assert.equal(segment.airlineName, 'Japan Airlines')
    assert.equal(segment.flightNumber, 'JL15')
    assert.equal(segment.scheduledDeparture, '2026-07-27T13:00:00.000Z')
    assert.equal(segment.scheduledArrival, '2026-07-28T04:30:00.000Z')
    assert.equal(segment.flightStatus, 'scheduled')
    assert.deepEqual(result.itineraries[0].providerAttribution?.[0].providerRecordIds, ['JL15-20260727'])
  })

  it('preserves multiple returned flights as distinct records', async () => {
    const result = await executeWith([
      schedule({ flightNumber: 'JL15', providerRecordId: 'record-1' }),
      schedule({ flightNumber: 'NH105', operatingFlightNumber: 'NH105', providerRecordId: 'record-2', carrier: 'All Nippon Airways', airlineCode: 'NH', operatingCarrier: 'NH' })
    ])

    assert.equal(result.itineraries.length, 2)
    assert.deepEqual(result.itineraries.map((item) => item.segments[0].flightNumber).sort(), ['JL15', 'NH105'])
  })

  it('distinguishes a valid empty result from fabricated no-flight certainty', async () => {
    const result = await executeWith([])

    assert.equal(result.providerRuns[0].status, 'skipped')
    assert.match(result.warnings.join(' '), /did not return future schedule data/i)
    assert.equal(JSON.stringify(result).toLowerCase().includes('no flights exist'), false)
  })

  it('classifies authentication errors', async () => {
    const result = await executeWith([], { status: 'warning', warning: 'Aviationstack credentials rejected or endpoint not available for this key' })

    assert.equal(result.providerRuns[0].status, 'unsupported_request')
    assert.equal(result.providerRuns[0].diagnostics?.errorCategory, 'authentication_failure')
  })

  it('classifies rate limits', async () => {
    const result = await executeWith([], { status: 'warning', warning: 'Aviationstack rate limit reached; skipped this provider safely' })

    assert.equal(result.providerRuns[0].status, 'rate_limited')
    assert.equal(result.providerRuns[0].diagnostics?.errorCategory, 'rate_limit')
  })

  it('classifies timeouts', async () => {
    const result = await executeWith([], { status: 'warning', warning: 'Aviationstack request timed out; fallback provider skipped safely' })

    assert.equal(result.providerRuns[0].status, 'timeout')
    assert.equal(result.providerRuns[0].diagnostics?.errorCategory, 'timeout')
  })

  it('classifies provider 500 failures as degraded', async () => {
    const result = await executeWith([], { status: 'warning', warning: 'Aviationstack service unavailable (500); skipped safely' })

    assert.equal(result.providerRuns[0].status, 'degraded')
    assert.equal(result.providerRuns[0].diagnostics?.errorCategory, 'provider_server_failure')
  })

  it('handles malformed provider responses as degraded', async () => {
    const result = await executeWith([], { status: 'degraded', warning: 'unexpected payload from schedule provider' })

    assert.equal(result.providerRuns[0].status, 'degraded')
    assert.match(result.warnings.join(' '), /unexpected payload/i)
  })

  it('quarantines malformed flight records missing endpoints', async () => {
    const result = await executeWith([schedule({ origin: 'TBD' })])

    assert.equal(result.itineraries.length, 0)
    assert.equal(result.providerRuns[0].diagnostics?.recordsReceived, 1)
    assert.equal(result.providerRuns[0].diagnostics?.recordsUnmatched, 1)
  })

  it('keeps partial records with missing airline', async () => {
    const result = await executeWith([schedule({ carrier: 'Unknown Airline', airlineCode: undefined, airlineName: undefined })])

    assert.equal(result.itineraries.length, 1)
    assert.equal(result.itineraries[0].segments[0].airlineName, undefined)
  })

  it('keeps partial records with missing flight number', async () => {
    const result = await executeWith([schedule({ flightNumber: 'Flight TBD', operatingFlightNumber: undefined, providerRecordId: undefined })])

    assert.equal(result.itineraries.length, 1)
    assert.equal(result.itineraries[0].segments[0].flightNumber, undefined)
  })

  it('keeps partial records with missing timestamps without deriving duration', async () => {
    const result = await executeWith([schedule({ departureTime: 'Pending', arrivalTime: 'Pending', scheduledDeparture: undefined, scheduledArrival: undefined })])
    const segment = result.itineraries[0].segments[0]

    assert.equal(segment.scheduledDeparture, undefined)
    assert.equal(segment.duration, undefined)
  })

  it('normalizes terminal and gate metadata only when returned', async () => {
    const result = await executeWith([schedule({ departureTerminal: 'B', departureGate: '151', arrivalTerminal: '3', arrivalGate: '108' })])
    const segment = result.itineraries[0].segments[0]

    assert.equal(segment.departureTerminal, 'B')
    assert.equal(segment.departureGate, '151')
    assert.equal(segment.arrivalTerminal, '3')
    assert.equal(segment.arrivalGate, '108')
  })

  it('normalizes aircraft metadata', async () => {
    const result = await executeWith([schedule({ aircraftRegistration: 'JA123J', aircraftIata: '789', aircraftIcao: 'B789' })])
    const segment = result.itineraries[0].segments[0]

    assert.equal(segment.aircraftRegistration, 'JA123J')
    assert.equal(segment.aircraftIata, '789')
    assert.equal(segment.aircraftIcao, 'B789')
  })

  it('preserves codeshare information', async () => {
    const result = await executeWith([schedule({ codeshareIdentity: 'AA8404 marketed on JL15', marketingFlightNumbers: ['AA8404'] })])

    assert.deepEqual(result.itineraries[0].segments[0].codeshareInformation, ['AA8404 marketed on JL15', 'AA8404'])
  })

  it('normalizes uppercase airports and rejects wrong direction', async () => {
    const result = await executeWith([schedule({ origin: 'hnd', destination: 'lax' })])

    assert.equal(result.itineraries.length, 0)
    assert.equal(result.providerRuns[0].diagnostics?.recordsUnmatched, 1)
  })

  it('rejects records for the wrong date', async () => {
    const result = await executeWith([schedule({ operatingDate: '2026-07-28' })])

    assert.equal(result.itineraries.length, 0)
    assert.match(result.warnings.join(' '), /none matched/i)
  })

  it('overlays a matching segment in the beta pipeline while leaving loads unknown', async () => {
    const result = await executeSearchApiAsync({
      origin: 'LAX',
      destination: 'HND',
      departureDate: '2026-07-27',
      travelerCount: 2,
      tripMission: { allowZed: true },
      travelerProfile: normalizeTravelerProfile(),
      preferences: { tripType: 'one_way', allowZed: true }
    }, {
      now,
      pipelineOptions: {
        executionProviders: [createAviationstackExecutionProvider({ apiKey: 'key', now: () => now, cache: new Map(), provider: stubProvider([schedule()]) })]
      }
    })

    assert.equal(result.status, 200)
    if (result.status !== 200) return
    const firstSegment = result.body.itineraries[0].segments[0]
    assert.equal(firstSegment.schedule.flightNumber, 'JL15')
    assert.equal(firstSegment.schedule.seatCount, 'Unknown - live load data not attached')
    assert.ok(firstSegment.notes.some((note) => /Schedule data: Aviationstack/i.test(note)))
    assert.equal(JSON.stringify(result.body).includes('seat count: 5'), false)
  })

  it('does not let unmatched provider records corrupt static plans', async () => {
    const result = await executeSearchApiAsync({
      origin: 'LAX',
      destination: 'HND',
      departureDate: '2026-07-27',
      travelerCount: 2,
      tripMission: {},
      travelerProfile: normalizeTravelerProfile(),
      preferences: { tripType: 'one_way' }
    }, {
      now,
      pipelineOptions: {
        executionProviders: [createAviationstackExecutionProvider({ apiKey: 'key', now: () => now, cache: new Map(), provider: stubProvider([schedule({ origin: 'HND', destination: 'LAX' })]) })]
      }
    })

    assert.equal(result.status, 200)
    if (result.status !== 200) return
    assert.equal(result.body.itineraries[0].segments[0].origin, 'LAX')
    assert.equal(result.body.itineraries[0].segments[0].destination, 'HND')
    assert.ok((result.body.providerRuns[0].diagnostics?.recordsUnmatched || 0) >= 1)
  })

  it('deduplicates duplicate provider records through the execution merge path', async () => {
    const result = await executeWith([schedule({ providerRecordId: 'dupe' }), schedule({ providerRecordId: 'dupe' })])

    assert.equal(result.itineraries.length, 1)
    assert.equal(result.itineraries[0].segments[0].providerRecordId, 'dupe')
  })

  it('records fetched timestamp and provider supplied fields', async () => {
    const result = await executeWith([schedule({ retrievalTimestamp: '2026-07-22T12:00:00.000Z' })])
    const attribution = result.itineraries[0].providerAttribution?.[0]

    assert.equal(attribution?.fetchedAt, '2026-07-22T12:00:00.000Z')
    assert.ok(attribution?.fields?.includes('flightStatus'))
  })

  it('uses cache hits and reports cache age', async () => {
    let calls = 0
    const cache = new Map()
    const provider = createAviationstackExecutionProvider({
      apiKey: 'key',
      now: () => now,
      cache,
      provider: stubProvider([schedule()], { onCall: () => { calls += 1 } })
    })

    await new SearchExecutionEngine({ providers: [provider] }).execute(request())
    const second = await new SearchExecutionEngine({ providers: [provider] }).execute(request())

    assert.equal(calls, 1)
    assert.equal(second.providerRuns[0].diagnostics?.cached, true)
  })

  it('expires cache entries by date and isolates cache keys by date', async () => {
    let current = new Date('2026-07-22T00:00:00.000Z')
    let calls = 0
    const provider = createAviationstackExecutionProvider({
      apiKey: 'key',
      now: () => current,
      cache: new Map(),
      provider: stubProvider([schedule()], { onCall: () => { calls += 1 } })
    })

    await new SearchExecutionEngine({ providers: [provider] }).execute(request({ date: '2026-07-27' }))
    await new SearchExecutionEngine({ providers: [provider] }).execute(request({ date: '2026-07-28' }))
    current = new Date('2026-07-22T01:00:00.000Z')
    await new SearchExecutionEngine({ providers: [provider] }).execute(request({ date: '2026-07-27' }))

    assert.equal(calls, 3)
  })

  it('uses a shorter same-day TTL than future-date TTL', async () => {
    let current = new Date('2026-07-27T00:00:00.000Z')
    let calls = 0
    const provider = createAviationstackExecutionProvider({
      apiKey: 'key',
      now: () => current,
      cache: new Map(),
      provider: stubProvider([schedule({ operatingDate: '2026-07-27' })], { onCall: () => { calls += 1 } })
    })

    await new SearchExecutionEngine({ providers: [provider] }).execute(request({ date: '2026-07-27' }))
    current = new Date('2026-07-27T00:04:00.000Z')
    await new SearchExecutionEngine({ providers: [provider] }).execute(request({ date: '2026-07-27' }))

    assert.equal(calls, 2)
  })

  it('bounds airport-pair fan-out for region-style route frameworks', async () => {
    const searched: string[] = []
    const provider = createAviationstackExecutionProvider({
      apiKey: 'key',
      now: () => now,
      maxAirportPairs: 4,
      provider: stubProvider([], { onRequest: (request) => searched.push(`${request.origin}-${request.destination}`) })
    })

    await new SearchExecutionEngine({ providers: [provider] }).execute(request({
      routeSegments: [
        ['SBP', 'FRA'], ['SBP', 'AMS'], ['SBP', 'MUC'], ['SBP', 'CDG'], ['SBP', 'LHR'], ['SBP', 'ZRH']
      ].map(([origin, destination]) => ({ origin, destination, transportType: 'flight' as const, journeyDate: '2026-07-27' }))
    }))

    assert.deepEqual(searched, ['SBP-FRA', 'SBP-AMS', 'SBP-MUC', 'SBP-CDG'])
  })

  it('skips unsupported requests when no valid airport pair exists', async () => {
    const provider = createAviationstackExecutionProvider({ apiKey: 'key', now: () => now, provider: stubProvider([]) })
    const result = await new SearchExecutionEngine({ providers: [provider] }).execute(request({
      routeSegments: [{ origin: 'SBP', destination: 'Europe', transportType: 'flight', journeyDate: '2026-07-27' }],
      preferredDestinations: ['Europe']
    }))

    assert.equal(result.providerRuns[0].status, 'unsupported_request')
    assert.equal(result.providerRuns[0].diagnostics?.requestCount, 0)
  })

  it('keeps API responses HTTP 200 with static recommendations on recoverable provider failure', async () => {
    const response = await executeSearchApiAsync({
      origin: 'LAX',
      destination: 'HND',
      departureDate: '2026-07-27',
      travelerCount: 2,
      tripMission: {},
      travelerProfile: normalizeTravelerProfile(),
      preferences: { tripType: 'one_way' }
    }, {
      now,
      pipelineOptions: {
        executionProviders: [createAviationstackExecutionProvider({ apiKey: 'key', now: () => now, cache: new Map(), provider: stubProvider([], { status: 'warning', warning: 'Aviationstack service unavailable (500); skipped safely' }) })]
      }
    })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.ok(response.body.recommendations.ranked.length > 0)
    assert.equal(response.body.providerRuns[0].status, 'degraded')
  })

  it('serializes providerRuns diagnostics without raw payloads', async () => {
    const result = await executeWith([schedule()])
    const diagnostics = result.providerRuns[0].diagnostics

    assert.equal(diagnostics?.recordsReceived, 1)
    assert.equal(diagnostics?.recordsMatched, 1)
    assert.equal('raw' in (diagnostics || {}), false)
  })

  it('does not serialize the configured API key in API output', async () => {
    const secret = 'aviationstack-test-secret'
    process.env.AVIATIONSTACK_API_KEY = secret
    globalThis.fetch = async () => jsonResponse({ data: [flight()] })

    const response = await executeSearchApiAsync({ origin: 'LAX', destination: 'HND', departureDate: '2026-07-27', travelerCount: 1, tripMission: {}, travelerProfile: normalizeTravelerProfile(), preferences: { tripType: 'one_way' } }, { now })

    assert.equal(response.status, 200)
    assert.equal(JSON.stringify(response).includes(secret), false)
  })

  it('never invents seats, ZED eligibility, fares, or load availability from Aviationstack', async () => {
    const result = await executeWith([schedule()])
    const serialized = JSON.stringify(result).toLowerCase()

    assert.equal(serialized.includes('open seats'), false)
    assert.equal(serialized.includes('fare available'), false)
    assert.equal(serialized.includes('zed eligible'), false)
    assert.equal(result.itineraries[0].segments[0].seatCount, undefined)
    assert.equal(result.itineraries[0].segments[0].loadStatus, undefined)
  })

  it('is deterministic for repeated stubbed executions', async () => {
    const first = await executeWith([schedule()])
    const second = await executeWith([schedule()])

    assert.deepEqual(first.itineraries, second.itineraries)
  })

  it('keeps backward-compatible search execution behavior with explicit zero providers', async () => {
    const result = await new SearchExecutionEngine({ providers: [] }).execute(request())

    assert.deepEqual(result.providerRuns, [])
    assert.deepEqual(result.itineraries, [])
  })

  it('keeps production build-facing serialized readiness free of server credentials', async () => {
    process.env.AVIATIONSTACK_API_KEY = 'production-secret-key'
    globalThis.fetch = async () => jsonResponse({ data: [] })
    const response = await executeSearchApiAsync({ origin: 'LAX', destination: 'HND', departureDate: '2026-07-27', travelerCount: 1, tripMission: {}, travelerProfile: normalizeTravelerProfile(), preferences: { tripType: 'one_way' } }, { now })

    assert.equal(response.status, 200)
    assert.equal(JSON.stringify(response).includes('production-secret-key'), false)
    if (response.status === 200) assert.ok(response.body.providerReadiness.schedule.some((item) => item.provider === 'aviationstack' && item.credentialConfigured))
  })
})

async function executeWith(results: NormalizedScheduleResult[], overrides: Partial<LiveScheduleProviderResponse> = {}) {
  const provider = createAviationstackExecutionProvider({
    apiKey: 'key',
    now: () => now,
    cache: new Map(),
    provider: stubProvider(results, overrides)
  })
  return new SearchExecutionEngine({ providers: [provider] }).execute(request())
}

function request(options: {
  date?: string
  routeSegments?: SearchExecutionRequest['routeSegments']
  preferredDestinations?: string[]
} = {}): SearchExecutionRequest {
  const date = options.date || '2026-07-27'
  return {
    mission: normalizeTripMission({
      originAirports: ['LAX'],
      preferredDepartureAirports: ['LAX'],
      destinationRegion: 'Japan',
      preferredDestinations: options.preferredDestinations || ['HND'],
      departureDate: date,
      travelers: 2
    }),
    tripType: 'one_way',
    travelerCount: 2,
    travelerProfile: normalizeTravelerProfile(),
    routeSegments: options.routeSegments || [{ origin: 'LAX', destination: 'HND', transportType: 'flight', journeyDate: date }]
  }
}

function stubProvider(results: NormalizedScheduleResult[], options: Partial<LiveScheduleProviderResponse> & {
  onCall?: () => void
  onRequest?: (request: { origin?: string; destination?: string; date?: string; maxResults?: number }) => void
} = {}): LiveScheduleProvider {
  return {
    key: 'aviationstack',
    label: 'Aviationstack',
    capabilities: { futureSchedules: true, currentFlightStatus: true, routeSearch: true, flightNumberEnrichment: false },
    async searchSchedules(request) {
      options.onCall?.()
      options.onRequest?.(request)
      return {
        provider: 'aviationstack',
        results,
        requestCount: 1,
        status: options.status || (results.length ? 'success' : 'skipped'),
        warning: options.warning,
        detail: options.detail || `${results.length} stubbed result(s).`,
        providerCallLogs: options.providerCallLogs || [{
          provider: 'aviationstack',
          latencyMs: 12,
          quotaHeaders: {},
          rateLimited: /rate limit/i.test(options.warning || ''),
          authenticationFailure: /credential|auth/i.test(options.warning || ''),
          cacheStatus: 'bypass',
          detail: options.warning || 'stubbed'
        }]
      }
    }
  }
}

function schedule(overrides: Partial<NormalizedScheduleResult> = {}): NormalizedScheduleResult {
  return {
    carrier: 'Japan Airlines',
    airlineCode: 'JL',
    airlineName: 'Japan Airlines',
    flightNumber: 'JL15',
    origin: 'LAX',
    destination: 'HND',
    departureTime: '2026-07-27T13:00:00.000Z',
    arrivalTime: '2026-07-28T04:30:00.000Z',
    scheduledDeparture: '2026-07-27T13:00:00.000Z',
    scheduledArrival: '2026-07-28T04:30:00.000Z',
    aircraft: '789',
    aircraftIata: '789',
    aircraftIcao: 'B789',
    status: 'scheduled',
    source: 'aviationstack',
    sourceCheckedAt: '2026-07-22T12:00:00.000Z',
    operatingCarrier: 'JL',
    operatingFlightNumber: 'JL15',
    marketingAirline: 'Japan Airlines',
    operatingAirline: 'Japan Airlines',
    marketingFlightNumber: 'JL15',
    operatingDate: '2026-07-27',
    arrivalOperatingDate: '2026-07-28',
    providerRecordId: 'JL15-20260727',
    retrievalTimestamp: '2026-07-22T12:00:00.000Z',
    dataFreshness: '0h',
    dataStatus: 'live',
    duplicateCount: 0,
    ...overrides
  }
}

function flight(overrides: Record<string, unknown> = {}) {
  return {
    flight_date: '2026-07-27',
    flight_status: 'scheduled',
    departure: { airport: 'Los Angeles', iata: 'LAX', terminal: 'B', gate: '151', scheduled: '2026-07-27T13:00:00+00:00' },
    arrival: { airport: 'Haneda', iata: 'HND', terminal: '3', gate: '108', scheduled: '2026-07-28T04:30:00+00:00' },
    airline: { name: 'Japan Airlines', iata: 'JL' },
    flight: { number: '15', iata: 'JL15', icao: 'JAL15' },
    aircraft: { registration: 'JA123J', iata: '789', icao: 'B789' },
    ...overrides
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) }
  })
}
