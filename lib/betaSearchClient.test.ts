import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { executeSearchApi } from './searchResponse.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  betaSearchResultStorageKey,
  buildBetaSearchRequest,
  loadStoredBetaSearchResult,
  runBetaSearchFromPrompt,
  type FetchLike,
  type StorageLike
} from './betaSearchClient.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTravelerProfile, type TravelerProfileScaffold, type ZedAgreementRecord } from './travelerProfile.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type SearchApiSuccessResponse } from './searchResponse.ts'

const now = new Date('2026-07-22T00:00:00Z')
const europePrompt = 'Family of 5 leaving SBP July 27. Anywhere in Europe. Eventually Montenegro, Albania, or Greece. We can position through SFO or LAX. Use ZED or revenue backups.'

describe('beta search client', () => {
  it('constructs a valid API request from a natural-language prompt', () => {
    const built = buildBetaSearchRequest('Family of 2 leaving SFO July 27 to HND. Use ZED.', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.origin, 'SFO')
    assert.equal(built.request.destination, 'HND')
    assert.equal(built.request.departureDate, '2026-07-27')
  })

  it('uses mission-derived traveler count before profile fallback', () => {
    const built = buildBetaSearchRequest(europePrompt, profile(2), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.travelerCount, 5)
  })

  it('uses profile-derived traveler count when the mission does not specify travelers', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND. Use ZED.', profile(3), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.travelerCount, 3)
  })

  it('defaults to one-way only when no return date exists', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND.', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.preferences.tripType, 'one_way')
  })

  it('handles round-trip prompts when a return date exists', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND returning August 2.', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.preferences.tripType, 'round_trip')
    assert.equal(built.request.returnDate, '2026-08-02')
  })

  it('uses a schema-safe placeholder for region-only destination searches', () => {
    const built = buildBetaSearchRequest(europePrompt, profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.destination.mode, 'region')
    assert.equal(built.destination.label, 'Europe')
    assert.equal(built.request.destination, 'FRA')
    assert.deepEqual(built.destination.preferredDestinations, ['Montenegro', 'Albania', 'Greece'])
  })

  it('uses a specific airport destination when one is present', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND.', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.destination.mode, 'airport')
    assert.equal(built.destination.label, 'HND')
    assert.equal(built.request.destination, 'HND')
  })

  it('constructs broad airport-pair searches such as SBP to FCO', () => {
    const built = buildBetaSearchRequest('SBP to FCO July 27', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.origin, 'SBP')
    assert.equal(built.request.destination, 'FCO')
    assert.equal(built.destination.mode, 'airport')
    assert.equal(built.destination.label, 'FCO')
    assert.equal(built.request.departureDate, '2026-07-27')

    const apiResult = executeSearchApi({
      origin: built.request.origin,
      destination: built.request.destination,
      departureDate: built.request.departureDate,
      travelerCount: built.request.travelerCount
    }, { now })

    assert.notEqual(apiResult.status, 422)
  })

  it('constructs airport-set searches from metro codes such as NYC to CDG', () => {
    const built = buildBetaSearchRequest('NYC to CDG', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.origin, 'JFK')
    assert.equal(built.request.destination, 'CDG')
    assert.deepEqual((built.request.preferences.preferredDepartureAirports || []).slice(0, 3), ['JFK', 'EWR', 'LGA'])
    assert.equal(built.request.departureDate, '2026-07-22')
    assert.equal(built.originResolution?.type, 'metro')
  })

  it('keeps metro codes out of physical API route segments', () => {
    const built = buildBetaSearchRequest('NYC to CDG', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    const apiResult = executeSearchApi(built.request, { now })

    assert.equal(apiResult.status, 200)
    if (apiResult.status !== 200) return
    assert.equal(JSON.stringify(apiResult.body).includes('NYC'), false)
    assert.ok(apiResult.body.itineraries.every((itinerary) =>
      itinerary.segments.every((segment) => segment.origin !== 'NYC' && segment.destination !== 'NYC')
    ))
  })

  it('constructs city-name searches such as San Luis Obispo to Rome', () => {
    const built = buildBetaSearchRequest('San Luis Obispo to Rome', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.origin, 'SBP')
    assert.equal(built.request.destination, 'FCO')
    assert.ok((built.request.preferences.preferredDestinations || []).includes('FCO'))
  })

  it('constructs closest-airport and country searches without requiring airport codes', () => {
    const closest = buildBetaSearchRequest('SBP to closest airport to Longview, WA', profile(), { now })
    const maldives = buildBetaSearchRequest('FCO to Maldives', profile(), { now })

    assert.equal(closest.ok, true)
    if (closest.ok) {
      assert.equal(closest.request.origin, 'SBP')
      assert.equal(closest.request.destination, 'PDX')
      assert.equal(closest.destination.resolution?.type, 'place')
    }
    assert.equal(maldives.ok, true)
    if (maldives.ok) {
      assert.equal(maldives.request.origin, 'FCO')
      assert.equal(maldives.request.destination, 'MLE')
      assert.equal(maldives.destination.resolution?.type, 'country')
    }
  })

  it('constructs multi-airport destination searches such as LAX to Tokyo', () => {
    const built = buildBetaSearchRequest('LAX to Tokyo', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.origin, 'LAX')
    assert.equal(built.request.destination, 'HND')
    assert.ok((built.request.preferences.preferredDestinations || []).includes('NRT'))
  })

  it('maps ZED preference from the mission parser', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND with ZED.', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.preferences.allowZed, true)
  })

  it('maps revenue backup preference from the mission parser', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND with revenue backups.', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.preferences.allowRevenue, true)
  })

  it('returns a concise validation state for malformed prompts', () => {
    const built = buildBetaSearchRequest('maybe someday', profile(), { now })

    assert.equal(built.ok, false)
    if (built.ok) return
    assert.equal(built.state, 'parsing')
    assert.ok(built.issues.length >= 1)
  })

  it('maps API 400 responses to API validation errors', async () => {
    const result = await runBetaSearchFromPrompt({
      prompt: 'Leaving SFO July 27 to HND.',
      profile: profile(),
      now,
      fetchImpl: responseFetch(400, { error: 'Invalid search request.', issues: [{ field: 'origin', message: 'origin is required.' }] })
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.state, 'api-validation-error')
    assert.equal(result.status, 400)
  })

  it('maps API 422 responses to API validation errors', async () => {
    const result = await runBetaSearchFromPrompt({
      prompt: 'Leaving SFO July 27 to HND.',
      profile: profile(),
      now,
      fetchImpl: responseFetch(422, { error: 'Search request failed validation.', issues: [{ field: 'destination', message: 'invalid airport' }] })
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.state, 'api-validation-error')
    assert.equal(result.status, 422)
  })

  it('maps API 500 responses to server errors', async () => {
    const result = await runBetaSearchFromPrompt({
      prompt: 'Leaving SFO July 27 to HND.',
      profile: profile(),
      now,
      fetchImpl: responseFetch(500, { error: 'Search pipeline failed unexpectedly.' })
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.state, 'api-server-error')
  })

  it('maps network failures to offline/network state', async () => {
    const result = await runBetaSearchFromPrompt({
      prompt: 'Leaving SFO July 27 to HND.',
      profile: profile(),
      now,
      fetchImpl: async () => { throw new Error('offline') }
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.state, 'offline-network-error')
  })

  it('maps malformed API success payloads to malformed-response state', async () => {
    const result = await runBetaSearchFromPrompt({
      prompt: 'Leaving SFO July 27 to HND.',
      profile: profile(),
      now,
      fetchImpl: responseFetch(200, { ok: true })
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.state, 'malformed-response')
  })

  it('validates stored beta search results before loading them', async () => {
    const storage = memoryStorage()
    storage.setItem(betaSearchResultStorageKey, JSON.stringify({ version: 1, result: { bad: true } }))

    assert.equal(loadStoredBetaSearchResult(storage), null)
  })

  it('produces deterministic request construction for repeated prompts', () => {
    const first = buildBetaSearchRequest(europePrompt, profile(), { now })
    const second = buildBetaSearchRequest(europePrompt, profile(), { now })

    assert.deepEqual(second, first)
  })

  it('builds an API request with ISO departureDate from tomorrow', () => {
    const built = buildBetaSearchRequest('LAX to HND tomorrow', profile(), { now })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.origin, 'LAX')
    assert.equal(built.request.destination, 'HND')
    assert.equal(built.request.departureDate, '2026-07-23')
    assert.equal((built.request.tripMission as any).departureDate, '2026-07-23')
  })

  it('does not overwrite an explicit structured departure date with prompt text', () => {
    const built = buildBetaSearchRequest('LAX to HND tomorrow', profile(), {
      now,
      explicitDepartureDate: '2026-08-01'
    })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.departureDate, '2026-08-01')
  })

  it('uses a previously stored mission date when the prompt has no date', () => {
    const built = buildBetaSearchRequest('LAX to HND', profile(), {
      now,
      previousMission: { departureDate: '2026-07-27' }
    })

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.departureDate, '2026-07-27')
  })

  it('does not show missing-date copy after successful natural-language resolution', () => {
    const built = buildBetaSearchRequest('LAX to HND tomorrow', profile(), { now })

    assert.equal(built.ok, true)
    assert.equal(JSON.stringify(built).includes('Add a departure date.'), false)
  })

  it('returns a specific invalid-date message', () => {
    const built = buildBetaSearchRequest('LAX to HND 2/30/26', profile(), { now })

    assert.equal(built.ok, false)
    if (built.ok) return
    assert.equal(built.message, 'That date is not valid. Try July 27, 2026.')
  })

  it('returns a specific ambiguous numeric-date message', () => {
    const built = buildBetaSearchRequest('LAX to HND 27/7/26', profile(), { now })

    assert.equal(built.ok, false)
    if (built.ok) return
    assert.equal(built.message, 'Use month/day format, for example 7/27/26.')
  })

  it('stores successful API results in session storage', async () => {
    const storage = memoryStorage()
    const result = await runBetaSearchFromPrompt({
      prompt: 'Leaving SFO July 27 to HND. Use ZED or revenue.',
      profile: profile(),
      fetchImpl: apiBackedFetch(),
      storage,
      now
    })

    assert.equal(result.ok, true)
    assert.ok(storage.getItem(betaSearchResultStorageKey))
    assert.ok(loadStoredBetaSearchResult(storage))
  })

  it('clears stale storage before a fresh search and does not inherit the previous origin', async () => {
    const storage = memoryStorage()
    const requests: unknown[] = []
    storage.setItem(betaSearchResultStorageKey, JSON.stringify({
      version: 1,
      prompt: 'NYC to CDG',
      createdAt: '2026-08-22T00:00:00.000Z',
      request: { origin: 'JFK', destination: 'CDG', departureDate: '2026-08-22', travelerCount: 1, tripMission: {}, travelerProfile: {}, preferences: { tripType: 'one_way' } },
      destination: { mode: 'airport', label: 'CDG', preferredDestinations: [] },
      positioningAirports: [],
      result: completeSbpFcoResponse('stale-nyc-cdg', ['JFK', 'CDG'])
    }))

    const result = await runBetaSearchFromPrompt({
      prompt: 'FCO to Maldives',
      profile: profile(),
      explicitDepartureDate: '2026-08-22',
      storage,
      now,
      fetchImpl: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body || '{}')))
        return {
          ok: true,
          status: 200,
          json: async () => completeFcoMaldivesResponse()
        }
      }
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal((requests[0] as { origin: string }).origin, 'FCO')
    assert.equal((requests[0] as { destination: string }).destination, 'MLE')
    assert.equal(result.storedResult.request.origin, 'FCO')
    assert.equal(result.storedResult.request.destination, 'MLE')
    assert.deepEqual(result.storedResult.result.itineraries[0].segments.map((segment) => `${segment.schedule.flightNumber} ${segment.origin}-${segment.destination}`), [
      'NO610 FCO-MLE'
    ])
    const stored = loadStoredBetaSearchResult(storage)
    assert.equal(stored?.prompt, 'FCO to Maldives')
    assert.equal(JSON.stringify(stored).includes('CDG'), false)
  })

  it('overwrites stale persisted results with a fresh complete composed itinerary response', async () => {
    const storage = memoryStorage()
    storage.setItem(betaSearchResultStorageKey, JSON.stringify({
      version: 1,
      prompt: 'old SBP to FCO',
      createdAt: '2026-08-20T00:00:00.000Z',
      request: { origin: 'SBP', destination: 'FCO', departureDate: '2026-08-21', travelerCount: 1, tripMission: {}, travelerProfile: {}, preferences: { tripType: 'one_way' } },
      destination: { mode: 'airport', label: 'FCO', preferredDestinations: [] },
      positioningAirports: [],
      result: completeSbpFcoResponse('stale-framework', ['SBP', 'FRA', 'FCO'])
    }))

    const result = await runBetaSearchFromPrompt({
      prompt: 'SBP to FCO',
      profile: profile(),
      explicitDepartureDate: '2026-08-22',
      fetchImpl: responseFetch(200, completeSbpFcoResponse('complete-sbp-den-fco')),
      storage,
      now
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    const stored = loadStoredBetaSearchResult(storage)
    assert.ok(stored)
    assert.equal(stored.request.departureDate, '2026-08-22')
    assert.equal(stored.result.itineraries[0].id, 'complete-sbp-den-fco')
    assert.deepEqual(stored.result.itineraries[0].segments.map((segment) => `${segment.schedule.flightNumber} ${segment.origin}-${segment.destination}`), [
      'UA2329 SBP-DEN',
      'UA177 DEN-FCO'
    ])
  })

  it('stores provider-composed scheduled itineraries even when static recommendations are empty', async () => {
    const storage = memoryStorage()
    const result = await runBetaSearchFromPrompt({
      prompt: 'SBA to HNL',
      profile: profile(),
      explicitDepartureDate: '2026-08-22',
      fetchImpl: responseFetch(200, completeSbaHnlResponseWithoutRecommendations()),
      storage,
      now
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.storedResult.request.origin, 'SBA')
    assert.equal(result.storedResult.request.destination, 'HNL')
    assert.deepEqual(result.storedResult.result.itineraries[0].segments.map((segment) => `${segment.schedule.flightNumber} ${segment.origin}-${segment.destination}`), [
      'UA2865 SBA-DEN',
      'UA384 DEN-HNL'
    ])
    assert.ok(loadStoredBetaSearchResult(storage))
  })

  it('returns recognized-airport no-result copy only when no recommendations or itineraries exist', async () => {
    const result = await runBetaSearchFromPrompt({
      prompt: 'SBA to HNL',
      profile: profile(),
      explicitDepartureDate: '2026-08-22',
      fetchImpl: responseFetch(200, emptySearchResponse()),
      storage: memoryStorage(),
      now
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.state, 'no-viable-plans')
    assert.match(result.message, /recognized airports/i)
  })

  it('covers the manual beta fixture without fabricating live fields', async () => {
    const result = await runBetaSearchFromPrompt({
      prompt: europePrompt,
      profile: profile(5, [agreement('LH')]),
      fetchImpl: apiBackedFetch(),
      storage: memoryStorage(),
      now
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.storedResult.request.origin, 'SBP')
    assert.equal(result.storedResult.destination.mode, 'region')
    assert.equal(result.storedResult.request.preferences.allowZed, true)
    assert.equal(result.storedResult.request.preferences.allowRevenue, true)
    assert.deepEqual(result.storedResult.positioningAirports, ['SFO', 'LAX'])
    assert.ok(result.storedResult.result.planA)
    assert.ok(result.storedResult.result.planB)
    assert.ok(result.storedResult.result.unknownScheduleIndicators.includes('Unknown - live load data not attached'))
    assert.equal(JSON.stringify(result.storedResult).includes('5 seats'), false)
    assert.equal(/\b[A-Z]{2}\d{2,4}\b/.test(JSON.stringify(result.storedResult)), false)
  })
})

function profile(count = 1, zedAgreements: ZedAgreementRecord[] = []) {
  return normalizeTravelerProfile({
    homeAirport: 'SFO',
    preferredAirports: ['SFO', 'LAX'],
    travelingParty: Array.from({ length: count }, (_, index) => ({ id: `traveler-${index + 1}`, travelerType: index === 0 ? 'employee' : 'dependent_child' })),
    zedAgreements
  } as Partial<TravelerProfileScaffold>)
}

function agreement(airlineCode: string, overrides: Partial<ZedAgreementRecord> = {}): ZedAgreementRecord {
  return {
    id: `zed-${airlineCode}`,
    airlineCode,
    airlineName: airlineCode,
    agreementType: 'ZED',
    bookingPlatform: 'myIDTravel',
    eligibleTravelerTypes: ['employee', 'dependent_child'],
    cabinAccess: ['Economy'],
    verificationStatus: 'employer_verified',
    verifiedAt: '2026-07-01T00:00:00Z',
    active: true,
    ...overrides
  }
}

function responseFetch(status: number, body: unknown): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  })
}

function apiBackedFetch(): FetchLike {
  return async (_input, init) => {
    const result = executeSearchApi(JSON.parse(String(init?.body || '{}')), { now })
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body
    }
  }
}

function completeSbpFcoResponse(id: string, route: string[] = ['SBP', 'DEN', 'FCO']): SearchApiSuccessResponse {
  const segments = route.length === 3 && route[1] === 'DEN'
    ? [
      scheduledResponseSegment('sbp-den', 'UA2329', 'UA', 'SBP', 'DEN', '2026-08-22T12:20:00.000Z', '2026-08-22T15:45:00.000Z'),
      scheduledResponseSegment('den-fco', 'UA177', 'UA', 'DEN', 'FCO', '2026-08-22T17:30:00.000Z', '2026-08-23T03:20:00.000Z')
    ]
    : [
      unscheduledResponseSegment('sbp-fra', 'SBP', 'FRA'),
      unscheduledResponseSegment('fra-fco', 'FRA', 'FCO')
    ]

  return {
    id: 'search-sbp-fco',
    generatedAt: '2026-08-21T00:00:00.000Z',
    tripType: 'one_way',
    planA: { label: 'Plan A', rank: 1, status: 'viable', gateway: route[1], finalScore: 91, confidence: 84, estimatedSuccess: 80, summary: 'SBP to FCO', warnings: [] },
    warnings: [],
    confidence: { score: 84, label: 'high', reason: 'Fixture' },
    recommendations: {
      planA: { label: 'Plan A', rank: 1, status: 'viable', gateway: route[1], finalScore: 91, confidence: 84, estimatedSuccess: 80, summary: 'SBP to FCO', warnings: [] },
      ranked: [{ label: 'Plan A', rank: 1, status: 'viable', gateway: route[1], finalScore: 91, confidence: 84, estimatedSuccess: 80, summary: 'SBP to FCO', warnings: [] }]
    },
    recommendationDetails: [],
    dataQuality: 'medium',
    segments,
    timeline: [],
    summary: 'SBP to FCO fixture',
    fallbacks: [],
    providerReadiness: { schedule: [], groundTransport: [], hotel: [], weather: { readinessLevel: 'disabled', advisoryOnly: true, clientLiveCallsAllowed: false, appliesToScoring: false, unknownWeatherNeutral: true, gates: [], enabledFlags: [], disabledFlags: [], diagnostics: [], limitations: [] }, limitations: [] },
    providerHealth: [],
    unknownScheduleIndicators: [],
    itineraries: [{
      id,
      recommendationLabel: 'Plan A',
      recommendationRank: 1,
      gateway: route[1],
      confidence: 84,
      summary: 'SBP to FCO',
      detailedSummary: 'Complete provider-backed fixture when DEN is the hub.',
      segments,
      timeline: [],
      fallbacks: [],
      requiredZedAirlines: ['UA'],
      eligibleZedAirlines: [],
      revenueAirlines: [],
      providerAttribution: [{ provider: 'test-provider', recordCount: segments.length }],
      weatherPlaceholder: 'Weather not evaluated yet.',
      missingData: ['live loads'],
      unknownScheduleIndicators: [],
      journeys: []
    }],
    pipelineTrace: [],
    missingData: ['live loads']
  } as SearchApiSuccessResponse
}

function completeSbaHnlResponseWithoutRecommendations(): SearchApiSuccessResponse {
  const segments = [
    scheduledResponseSegment('sba-den', 'UA2865', 'UA', 'SBA', 'DEN', '2026-08-22T12:00:00.000Z', '2026-08-22T14:30:00.000Z'),
    scheduledResponseSegment('den-hnl', 'UA384', 'UA', 'DEN', 'HNL', '2026-08-22T18:00:00.000Z', '2026-08-23T01:16:00.000Z')
  ]
  return {
    ...emptySearchResponse(),
    summary: 'Provider-composed SBA to HNL fixture',
    dataQuality: 'medium',
    segments,
    itineraries: [{
      id: 'origin-first-composed-sba-den-hnl',
      recommendationLabel: 'Plan A',
      recommendationRank: 1,
      gateway: 'HNL',
      confidence: 65,
      summary: 'SBA to HNL live schedule option',
      detailedSummary: 'Complete provider-backed fixture.',
      segments,
      timeline: [],
      fallbacks: [],
      requiredZedAirlines: [],
      eligibleZedAirlines: [],
      revenueAirlines: [],
      providerAttribution: [{ provider: 'test-provider', recordCount: segments.length }],
      weatherPlaceholder: 'Weather not evaluated yet.',
      missingData: [],
      unknownScheduleIndicators: [],
      journeys: []
    }]
  } as SearchApiSuccessResponse
}

function completeFcoMaldivesResponse(): SearchApiSuccessResponse {
  const segments = [
    scheduledResponseSegment('fco-mle', 'NO610', 'NO', 'FCO', 'MLE', '2026-08-22T21:15:00.000Z', '2026-08-23T06:25:00.000Z')
  ]
  return {
    ...emptySearchResponse(),
    summary: 'Provider-composed FCO to MLE fixture',
    dataQuality: 'medium',
    segments,
    recommendations: {
      planA: { label: 'Plan A', rank: 1, status: 'viable', gateway: 'MLE', finalScore: 95, confidence: 83, estimatedSuccess: 93, summary: 'FCO to MLE live schedule option', warnings: [] },
      ranked: [{ label: 'Plan A', rank: 1, status: 'viable', gateway: 'MLE', finalScore: 95, confidence: 83, estimatedSuccess: 93, summary: 'FCO to MLE live schedule option', warnings: [] }]
    },
    itineraries: [{
      id: 'direct-fco-mle',
      recommendationLabel: 'Plan A',
      recommendationRank: 1,
      gateway: 'MLE',
      confidence: 83,
      summary: 'FCO to MLE live schedule option',
      detailedSummary: 'Complete provider-backed fixture.',
      segments,
      timeline: [],
      fallbacks: [],
      requiredZedAirlines: [],
      eligibleZedAirlines: [],
      revenueAirlines: [],
      providerAttribution: [{ provider: 'test-provider', recordCount: segments.length }],
      weatherPlaceholder: 'Weather not evaluated yet.',
      missingData: [],
      unknownScheduleIndicators: [],
      journeys: []
    }]
  } as SearchApiSuccessResponse
}

function emptySearchResponse(): SearchApiSuccessResponse {
  return {
    id: 'search-empty',
    generatedAt: '2026-08-21T00:00:00.000Z',
    tripType: 'one_way',
    warnings: [],
    confidence: { score: 0, label: 'low', reason: 'No fixture data' },
    recommendations: { ranked: [] },
    recommendationDetails: [],
    dataQuality: 'low',
    segments: [],
    timeline: [],
    summary: 'No scheduled options were found.',
    fallbacks: [],
    providerReadiness: { schedule: [], groundTransport: [], hotel: [], weather: { readinessLevel: 'disabled', advisoryOnly: true, clientLiveCallsAllowed: false, appliesToScoring: false, unknownWeatherNeutral: true, gates: [], enabledFlags: [], disabledFlags: [], diagnostics: [], limitations: [] }, limitations: [] },
    providerHealth: [],
    unknownScheduleIndicators: [],
    itineraries: [],
    pipelineTrace: [],
    missingData: ['operating schedules']
  } as SearchApiSuccessResponse
}

function scheduledResponseSegment(
  id: string,
  flightNumber: string,
  carrier: string,
  origin: string,
  destination: string,
  departureTime: string,
  arrivalTime: string
): SearchApiSuccessResponse['segments'][number] {
  return {
    id,
    origin,
    destination,
    mode: 'flight',
    carrier,
    schedule: {
      flightNumber,
      departureTime,
      arrivalTime,
      scheduledDepartureUtc: departureTime,
      scheduledArrivalUtc: arrivalTime,
      seatCount: 'Unknown - live load data not attached'
    },
    estimatedDuration: '2h',
    notes: ['Schedule data: test provider']
  }
}

function unscheduledResponseSegment(id: string, origin: string, destination: string): SearchApiSuccessResponse['segments'][number] {
  return {
    id,
    origin,
    destination,
    mode: 'flight',
    schedule: {
      flightNumber: 'Unknown - not provided by route framework',
      departureTime: 'Unknown - provider schedule validation required',
      arrivalTime: 'Unknown - provider schedule validation required',
      seatCount: 'Unknown - live load data not attached'
    },
    estimatedDuration: 'Unknown - provider schedule validation required',
    notes: ['Flight number, departure time, arrival time, and live loads are not attached.']
  }
}

function memoryStorage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) }
  }
}
