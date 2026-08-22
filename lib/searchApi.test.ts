import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { executeSearchApi, executeSearchApiAsync, serializeSearchResult } from './searchResponse.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { readSearchRequestBody, toSearchPipelineRequest } from './searchRequest.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { runSearchPipeline } from './searchPipeline.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type SearchExecutionProvider } from './searchExecutionEngine.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { validateSearchRequest } from './searchValidation.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTravelerProfile, type TravelerProfileScaffold } from './travelerProfile.ts'

const now = new Date('2026-07-22T00:00:00Z')

describe('/api/search beta search API', () => {
  it('validates a complete one-way request', () => {
    const validation = validateSearchRequest(validBody())

    assert.equal(validation.ok, true)
    if (validation.ok) {
      assert.equal(validation.request.origin, 'SFO')
      assert.equal(validation.request.destination, 'FRA')
      assert.equal(validation.request.travelerCount, 2)
    }
  })

  it('normalizes API input into a search pipeline request', () => {
    const validation = validateSearchRequest(validBody())
    assert.equal(validation.ok, true)
    if (!validation.ok) return

    const request = toSearchPipelineRequest(validation.request)
    assert.equal(request.destinationRegion, 'Europe')
    assert.deepEqual(request.preferredDestinations, ['FRA'])
    assert.equal(request.allowZed, true)
  })

  it('returns status 200 for a valid API request', () => {
    const response = executeSearchApi(validBody(), { now })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.equal(response.body.tripType, 'one_way')
    assert.ok(response.body.summary.includes('ranked itinerary framework'))
  })

  it('returns Plan A, Plan B, and Plan C summaries', () => {
    const response = executeSearchApi(validBody(), { now })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.equal(response.body.planA?.label, 'Plan A')
    assert.equal(response.body.planB?.label, 'Plan B')
    assert.equal(response.body.planC?.label, 'Plan C')
    assert.deepEqual(response.body.recommendations.ranked.map((item) => item.label), ['Plan A', 'Plan B', 'Plan C'])
  })

  it('serializes warnings, confidence, recommendations, segments, timeline, summary, and fallbacks', () => {
    const response = executeSearchApi(validBody(), { now })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.ok(Array.isArray(response.body.warnings))
    assert.equal(typeof response.body.confidence.score, 'number')
    assert.ok(response.body.recommendations.ranked.length > 0)
    assert.ok(response.body.segments.length > 0)
    assert.ok(response.body.timeline.length > 0)
    assert.ok(response.body.summary)
    assert.ok(response.body.fallbacks.length > 0)
  })

  it('does not fabricate flight numbers, times, seats, or current live availability', () => {
    const response = executeSearchApi(validBody(), { now })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    const serialized = JSON.stringify(response.body)
    assert.ok(response.body.unknownScheduleIndicators.includes('Unknown - provider schedule validation required'))
    assert.equal(/\b[A-Z]{2}\d{2,4}\b/.test(serialized), false)
    assert.equal(serialized.includes('5 seats'), false)
    assert.equal(serialized.toLowerCase().includes('current live availability'), false)
  })

  it('returns 400 for missing required fields', () => {
    const response = executeSearchApi({ ...validBody(), origin: undefined }, { now })

    assert.equal(response.status, 400)
    if (response.status === 200) return
    assert.equal(response.body.code, 'missing_required_field')
    assert.ok(response.body.issues?.some((issue) => issue.field === 'origin'))
  })

  it('returns 400 when the body is not an object', () => {
    const response = executeSearchApi(null, { now })

    assert.equal(response.status, 400)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'body'))
  })

  it('returns 400 for invalid JSON at the request boundary', async () => {
    const response = await readSearchRequestBody(new Request('https://nonrevy.test/api/search', {
      method: 'POST',
      body: '{'
    }))

    assert.equal(response.ok, false)
    if (response.ok) return
    assert.equal(response.status, 400)
    assert.equal(response.code, 'invalid_json')
  })

  it('returns 422 for an invalid origin airport', () => {
    const response = executeSearchApi({ ...validBody(), origin: 'San Francisco' }, { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'origin'))
  })

  it('returns 422 when a metro code is submitted as a physical origin airport', () => {
    const response = executeSearchApi({ ...validBody(), origin: 'NYC' }, { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'origin' && /physical airport/i.test(issue.message)))
  })

  it('returns 422 for an invalid destination airport', () => {
    const response = executeSearchApi({ ...validBody(), destination: 'Tokyo' }, { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'destination'))
  })

  it('returns 422 when origin and destination are the same airport', () => {
    const response = executeSearchApi({ ...validBody(), destination: 'SFO' }, { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'destination'))
  })

  it('returns 422 for traveler counts below one', () => {
    const response = executeSearchApi({ ...validBody(), travelerCount: 0 }, { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'travelerCount'))
  })

  it('returns 422 for non-integer traveler counts', () => {
    const response = executeSearchApi({ ...validBody(), travelerCount: 1.5 }, { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'travelerCount'))
  })

  it('returns 422 for invalid departure dates', () => {
    const response = executeSearchApi({ ...validBody(), departureDate: '2026-02-30' }, { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'departureDate'))
  })

  it('returns 422 for invalid return dates', () => {
    const response = executeSearchApi({ ...validBody(), returnDate: 'tomorrow' }, { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'returnDate'))
  })

  it('returns 422 when return date is before departure date', () => {
    const response = executeSearchApi({ ...validBody(), returnDate: '2026-07-21' }, { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'returnDate'))
  })

  it('returns round-trip journeys when returnDate and round_trip are supplied', () => {
    const response = executeSearchApi(validBody({
      returnDate: '2026-08-02',
      preferences: { ...validBody().preferences, tripType: 'round_trip' }
    }), { now })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.equal(response.body.tripType, 'round_trip')
    assert.equal(response.body.itineraries[0].journeys.length, 2)
    assert.equal(response.body.itineraries[0].journeys[1].date, '2026-08-02')
  })

  it('returns one-way results when no return date is supplied', () => {
    const response = executeSearchApi(validBody(), { now })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.equal(response.body.tripType, 'one_way')
    assert.equal(response.body.itineraries[0].journeys.length, 1)
  })

  it('returns 422 when one_way conflicts with returnDate', () => {
    const response = executeSearchApi(validBody({ returnDate: '2026-08-02' }), { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'returnDate'))
  })

  it('returns 422 when round_trip omits returnDate', () => {
    const response = executeSearchApi(validBody({
      preferences: { ...validBody().preferences, tripType: 'round_trip' }
    }), { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'returnDate'))
  })

  it('supports family traveler counts', () => {
    const response = executeSearchApi(validBody({ travelerCount: 5 }), { now })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.ok(response.body.planA?.risks.some((risk) => risk.includes('Large traveling party')))
  })

  it('supports employee traveler profiles', () => {
    const response = executeSearchApi(validBody({ travelerProfile: profile('Employee') }), { now })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.ok(response.body.pipelineTrace.some((item) => item.stage === 'traveler_profile' && item.status === 'ok'))
  })

  it('supports retiree traveler profiles', () => {
    const response = executeSearchApi(validBody({ travelerProfile: profile('Retiree') }), { now })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.ok(JSON.stringify(response.body.recommendations).includes('Retiree') === false)
    assert.ok(response.body.pipelineTrace.some((item) => item.stage === 'traveler_profile'))
  })

  it('reports provider unavailable signals as warnings', () => {
    const response = executeSearchApi(validBody(), { now, env: {} })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.ok(response.body.warnings.some((warning) => warning.includes('Live standby/load data is unavailable')))
    assert.ok(response.body.warnings.some((warning) => warning.includes('Live operating schedule data is unavailable')))
    assert.ok(response.body.providerReadiness.schedule.some((provider) => provider.enabled && !provider.credentialConfigured))
  })

  it('returns partial pipeline results without crashing when providers produce no gateways', () => {
    const response = executeSearchApi(validBody(), {
      now,
      pipelineOptions: { adapters: { discoverGateways: () => [] } }
    })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.deepEqual(response.body.segments, [])
    assert.ok(response.body.warnings.includes('No gateway candidates were discovered for the normalized mission.'))
    assert.equal(response.body.pipelineTrace.find((item) => item.stage === 'gateway_discovery')?.status, 'partial')
  })

  it('returns 422 for unsupported trip types', () => {
    const response = executeSearchApi(validBody({
      preferences: { ...validBody().preferences, tripType: 'multi_city' }
    }), { now })

    assert.equal(response.status, 422)
    if (response.status === 200) return
    assert.ok(response.body.issues?.some((issue) => issue.field === 'preferences.tripType'))
  })

  it('serializes provider readiness without exposing credential values', () => {
    const result = runSearchPipeline(toSearchPipelineRequest(validate(validBody())), { now })
    const body = serializeSearchResult(result, { FLIGHTAWARE_API_KEY: 'secret-flightaware-value' })
    const serialized = JSON.stringify(body)

    assert.equal(serialized.includes('secret-flightaware-value'), false)
    assert.ok(body.providerReadiness.schedule.some((provider) => provider.provider === 'flightaware' && provider.credentialConfigured))
    assert.equal(body.providerReadiness.weather.clientLiveCallsAllowed, false)
  })

  it('surfaces execution provider health in async API responses', async () => {
    const response = await executeSearchApiAsync(validBody({
      origin: 'LAX',
      destination: 'HND',
      preferences: { ...validBody().preferences, preferredDepartureAirports: ['LAX'], preferredDestinations: ['HND'] }
    }), {
      now,
      pipelineOptions: { executionProviders: [apiProvider('alpha')] }
    })

    assert.equal(response.status, 200)
    if (response.status !== 200) return
    assert.ok(response.body.providerRuns.some((run) => run.providerId === 'alpha' && run.status === 'success'))
    assert.ok(response.body.providerHealth.some((health) => health.providerId === 'alpha' && health.recordsNormalized === 1))
    assert.equal(JSON.stringify(response.body).includes('super-secret-api-key'), false)
  })

  it('returns 500 when an unexpected pipeline exception escapes', () => {
    const response = executeSearchApi(validBody(), {
      now,
      runPipeline: () => {
        throw new Error('unexpected pipeline exception')
      }
    })

    assert.equal(response.status, 500)
    if (response.status === 200) return
    assert.equal(response.body.code, 'search_pipeline_failed')
    assert.ok(response.body.issues?.[0].message.includes('unexpected pipeline exception'))
  })
})

function validate(body: ReturnType<typeof validBody>) {
  const validation = validateSearchRequest(body)
  assert.equal(validation.ok, true)
  if (!validation.ok) throw new Error('expected valid search body')
  return validation.request
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    origin: 'SFO',
    destination: 'FRA',
    departureDate: '2026-07-27',
    travelerCount: 2,
    tripMission: { allowZed: true, priority: 'balanced' },
    travelerProfile: profile('Employee'),
    preferences: {
      tripType: 'one_way',
      flexibleGateway: true,
      allowZed: true,
      allowRevenue: true
    },
    ...overrides
  }
}

function profile(travelerType: TravelerProfileScaffold['travelerType']) {
  return normalizeTravelerProfile({
    travelerType,
    homeAirport: 'SFO',
    preferredAirports: ['SFO', 'LAX'],
    travelingParty: [
      { id: travelerType.toLowerCase().replace(/\s+/g, '-'), travelerType: travelerType === 'Buddy Pass' ? 'buddy_pass' : 'employee' }
    ],
    zedAgreements: []
  } as Partial<TravelerProfileScaffold>)
}

function apiProvider(id: string): SearchExecutionProvider {
  return {
    id,
    name: `${id} provider`,
    readiness: { enabled: true, status: 'ready' },
    capabilities: { schedules: true, routeSearch: true, loads: false },
    async search() {
      return {
        itineraries: [{
          dataQuality: 'high',
          segments: [{
            origin: 'LAX',
            destination: 'HND',
            transportType: 'flight',
            carrier: 'JL',
            flightNumber: 'JL15',
            departureTime: '2026-07-27T13:00:00Z',
            arrivalTime: '2026-07-28T04:30:00Z',
            notes: ['Provider supplied normalized schedule candidate.']
          }]
        }],
        diagnostics: {
          recordsReceived: 1,
          recordsNormalized: 1,
          recordsMatched: 1,
          recordsUnmatched: 0,
          responseLatencyMs: 2
        }
      }
    }
  }
}
