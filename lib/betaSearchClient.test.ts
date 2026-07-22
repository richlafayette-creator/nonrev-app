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

const now = new Date('2026-07-22T00:00:00Z')
const europePrompt = 'Family of 5 leaving SBP July 27. Anywhere in Europe. Eventually Montenegro, Albania, or Greece. We can position through SFO or LAX. Use ZED or revenue backups.'

describe('beta search client', () => {
  it('constructs a valid API request from a natural-language prompt', () => {
    const built = buildBetaSearchRequest('Family of 2 leaving SFO July 27 to HND. Use ZED.', profile())

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.origin, 'SFO')
    assert.equal(built.request.destination, 'HND')
    assert.equal(built.request.departureDate, '2026-07-27')
  })

  it('uses mission-derived traveler count before profile fallback', () => {
    const built = buildBetaSearchRequest(europePrompt, profile(2))

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.travelerCount, 5)
  })

  it('uses profile-derived traveler count when the mission does not specify travelers', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND. Use ZED.', profile(3))

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.travelerCount, 3)
  })

  it('defaults to one-way only when no return date exists', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND.', profile())

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.preferences.tripType, 'one_way')
  })

  it('handles round-trip prompts when a return date exists', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND returning August 2.', profile())

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.preferences.tripType, 'round_trip')
    assert.equal(built.request.returnDate, '2026-08-02')
  })

  it('uses a schema-safe placeholder for region-only destination searches', () => {
    const built = buildBetaSearchRequest(europePrompt, profile())

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.destination.mode, 'region')
    assert.equal(built.destination.label, 'Europe')
    assert.equal(built.request.destination, 'FRA')
    assert.deepEqual(built.destination.preferredDestinations, ['Montenegro', 'Albania', 'Greece'])
  })

  it('uses a specific airport destination when one is present', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND.', profile())

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.destination.mode, 'airport')
    assert.equal(built.destination.label, 'HND')
    assert.equal(built.request.destination, 'HND')
  })

  it('maps ZED preference from the mission parser', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND with ZED.', profile())

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.preferences.allowZed, true)
  })

  it('maps revenue backup preference from the mission parser', () => {
    const built = buildBetaSearchRequest('Leaving SFO July 27 to HND with revenue backups.', profile())

    assert.equal(built.ok, true)
    if (!built.ok) return
    assert.equal(built.request.preferences.allowRevenue, true)
  })

  it('returns a concise validation state for malformed prompts', () => {
    const built = buildBetaSearchRequest('maybe someday', profile())

    assert.equal(built.ok, false)
    if (built.ok) return
    assert.equal(built.state, 'parsing')
    assert.ok(built.issues.length >= 1)
  })

  it('maps API 400 responses to API validation errors', async () => {
    const result = await runBetaSearchFromPrompt({
      prompt: 'Leaving SFO July 27 to HND.',
      profile: profile(),
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
    const first = buildBetaSearchRequest(europePrompt, profile())
    const second = buildBetaSearchRequest(europePrompt, profile())

    assert.deepEqual(second, first)
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

function memoryStorage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) }
  }
}
