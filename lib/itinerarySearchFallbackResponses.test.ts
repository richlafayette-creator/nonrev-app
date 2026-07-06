import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript runner resolves the app route .ts file directly.
import { GET } from '../app/api/itinerary/search/route.ts'

type JsonObject = Record<string, unknown>

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

function resetEnv() {
  process.env = { ...originalEnv }
  delete process.env.SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.FLIGHTAWARE_API_KEY
  delete process.env.AVIATIONSTACK_API_KEY
  delete process.env.NONREVY_TEST_DATA_MODE
  delete process.env.PERSONAL_TESTING_NEAREST_DATE_TOLERANCE_DAYS
}

function itinerarySearchUrl(params: Record<string, string>) {
  const search = new URLSearchParams(params)
  return new Request(`https://nonrevy.test/api/itinerary/search?${search.toString()}`)
}

async function search(params: Record<string, string>) {
  const response = await GET(itinerarySearchUrl(params))
  assert.equal(response.status, 200)
  return response.json() as Promise<JsonObject>
}

function assertFallbackDoesNotFabricateItineraries(data: JsonObject) {
  assert.equal(data.ok, true)
  assert.equal(data.count, 0)
  assert.deepEqual(data.itineraries, [])
  const frameworks = Array.isArray(data.frameworkRoutes) ? data.frameworkRoutes as JsonObject[] : []
  for (const route of frameworks) {
    assert.notEqual(route.source_provider, 'live')
    assert.notEqual(route.sourceProvider, 'live')
    assert.doesNotMatch(JSON.stringify(route).toLowerCase(), /flight-number\/time rows|live availability confirmed|standby available|standby confirmed/)
  }
}

function assertDoesNotClaimStandbyAvailability(data: JsonObject) {
  const text = JSON.stringify(data).toLowerCase()
  assert.doesNotMatch(text, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(text, /(standby|clearance)\s+(availability\s+)?(confirmed|guaranteed)/)
  assert.doesNotMatch(text, /(you\s+can\s+clear|will\s+clear|should\s+clear)\s+standby/)
  assert.doesNotMatch(text, /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
}

describe('/api/itinerary/search fallback responses', () => {
  beforeEach(() => {
    resetEnv()
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    resetEnv()
    globalThis.fetch = originalFetch
  })

  it('returns a non-fatal insufficient-origin coverage diagnostic with nearest supported origins', async () => {
    const data = await search({ origin: 'MRY', destination: 'OGG', date: '2026-08-15' })
    const debug = data.debug as JsonObject
    const coverage = (data.originCoverage || debug.originCoverage) as JsonObject
    const recommendations = coverage.recommendations as JsonObject[]

    assert.equal(data.source, 'planning-fallback')
    assert.equal(coverage.status, 'insufficient')
    assert.equal(coverage.origin, 'MRY')
    assert.match(String(coverage.message), /will not fail the request or invent MRY flights/i)
    assert.deepEqual(recommendations.slice(0, 2).map((item) => item.code), ['SFO', 'LAX'])
    assert.match(String(data.statusMessage), /Provider coverage from requested origin MRY is limited/i)
    assertFallbackDoesNotFabricateItineraries(data)
    assertDoesNotClaimStandbyAvailability(data)
  })

  it('returns provider-rate-limit fallback diagnostics without retrying alternate route lookups as live availability', async () => {
    process.env.FLIGHTAWARE_API_KEY = 'test-flightaware-key'
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('aeroapi.flightaware.com')) {
        return new Response(JSON.stringify({ title: 'monthly quota exceeded' }), { status: 429, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const data = await search({ origin: 'SBP', destination: 'NRT', date: '2026-08-15' })
    const debug = data.debug as JsonObject
    const rateLimits = debug.rateLimits as string[]
    const suggestions = (data.routeCoverageSuggestions || debug.routeCoverageSuggestions || []) as JsonObject[]

    assert.equal(data.source, 'planning-fallback')
    assert.ok(rateLimits.some((message) => /FlightAware/i.test(message) && /rate/i.test(message)))
    assert.ok(suggestions.length > 0)
    assert.ok(suggestions.every((suggestion) => suggestion.lookupStatus === 'skipped_rate_limited'))
    assert.match(JSON.stringify(data), /FlightAware quota\/rate-limit already affected the exact search/i)
    assertFallbackDoesNotFabricateItineraries(data)
    assertDoesNotClaimStandbyAvailability(data)
  })

  it('summarizes empty-provider responses without returning fabricated itineraries', async () => {
    const data = await search({ origin: 'ZZZ', destination: 'YYY', date: '2026-08-15' })
    const debug = data.debug as JsonObject
    const emptyResults = debug.emptyResults as string[]

    assert.equal(data.source, 'planning-fallback')
    assert.equal(data.dataMode, 'no-current-live-data')
    assert.equal(data.frameworkRouteCount, 0)
    assert.ok(emptyResults.some((message) => /returned zero usable flight rows|returned no usable rows|returned no matching rows|no matching rows/i.test(message)))
    assert.match(String(data.statusMessage), /No current live itinerary availability or complete route frameworks found/i)
    assertFallbackDoesNotFabricateItineraries(data)
    assertDoesNotClaimStandbyAvailability(data)
  })
})
