import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
// @ts-expect-error Node's experimental TypeScript runner resolves the app component .tsx file directly.
import { OriginCoverageNotice } from '../app/plan/OriginCoverageNotice.tsx'
// @ts-expect-error Node's experimental TypeScript runner resolves the app route .ts file directly.
import { GET } from '../app/api/itinerary/search/route.ts'

type JsonObject = Record<string, unknown>

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

function resetProviderEnvironment() {
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

async function insufficientOriginSearch() {
  const request = new Request('https://nonrevy.test/api/itinerary/search?origin=MRY&destination=OGG&date=2026-08-15')
  const response = await GET(request)
  assert.equal(response.status, 200)
  return response.json() as Promise<JsonObject>
}

function assertNoConfirmedAvailabilityClaims(markup: string) {
  const text = markup.toLowerCase()
  assert.doesNotMatch(text, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(text, /(standby|clearance)\s+(availability\s+)?(confirmed|guaranteed)/)
  assert.doesNotMatch(text, /(you\s+can\s+clear|will\s+clear|should\s+clear)\s+standby/)
  assert.doesNotMatch(text, /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
}

describe('planner origin-coverage notice smoke test', () => {
  beforeEach(() => {
    resetProviderEnvironment()
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    resetProviderEnvironment()
    globalThis.fetch = originalFetch
  })

  it('renders insufficient-origin coverage guidance without fabricated itineraries or availability claims', async () => {
    const data = await insufficientOriginSearch()
    const coverage = (data.originCoverage || (data.debug as JsonObject).originCoverage) as Parameters<typeof OriginCoverageNotice>[0]['coverage']

    assert.equal(data.ok, true)
    assert.equal(data.count, 0)
    assert.deepEqual(data.itineraries, [])
    assert.equal(coverage?.status, 'insufficient')

    const markup = renderToStaticMarkup(<OriginCoverageNotice coverage={coverage} />)

    assert.match(markup, /Origin coverage/)
    assert.match(markup, /Provider coverage is limited from MRY\./)
    assert.match(markup, /will not fail the request or invent MRY flights/i)
    assert.match(markup, /Nearest supported airports to try/)
    assert.match(markup, /SFO · 77 mi/)
    assert.match(markup, /LAX · 266 mi/)
    assert.match(markup, /SJC · 54 mi/)
    assert.match(markup, /href="\/results\?q=SFO%20%E2%86%92%20OGG"/)
    assert.match(markup, /alternate search origins only/i)
    assert.match(markup, /not fabricating flights from MRY/i)
    assert.match(markup, /not claiming standby availability/i)
    assert.doesNotMatch(markup, /Live availability confirmed|Current live availability|standby confirmed/i)
    assertNoConfirmedAvailabilityClaims(markup)
  })
})
