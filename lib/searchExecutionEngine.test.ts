import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { SearchExecutionEngine, type SearchExecutionProvider } from './searchExecutionEngine.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { runSearchPipelineWithExecution, type NaturalSearchObject } from './searchPipeline.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTravelerProfile } from './travelerProfile.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTripMission } from './tripMission.ts'

const request = {
  mission: normalizeTripMission({
    originAirports: ['LAX'],
    preferredDepartureAirports: ['LAX'],
    destinationRegion: 'Japan',
    preferredDestinations: ['HND'],
    departureDate: '2026-07-27',
    travelers: 2
  }),
  tripType: 'one_way' as const,
  travelerCount: 2,
  travelerProfile: normalizeTravelerProfile()
}

const normalizedRequest: NaturalSearchObject = {
  origin: 'LAX',
  destination: 'HND',
  departureDate: '2026-07-27',
  travelerCount: 2,
  travelerProfile: normalizeTravelerProfile(),
  tripMission: request.mission,
  allowZed: true
}

describe('search execution engine', () => {
  it('handles zero providers deterministically', async () => {
    const result = await new SearchExecutionEngine({ providers: [] }).execute(request)

    assert.deepEqual(result.itineraries, [])
    assert.deepEqual(result.providerRuns, [])
    assert.equal(result.dataQuality, 'low')
    assert.ok(result.warnings.includes('No search execution providers are configured.'))
  })

  it('executes one ready provider and returns normalized itineraries', async () => {
    const result = await new SearchExecutionEngine({ providers: [provider('alpha')] }).execute(request)

    assert.equal(result.providerRuns[0].status, 'success')
    assert.equal(result.itineraries.length, 1)
    assert.equal(result.itineraries[0].segments[0].flightNumber, 'UA39')
    assert.deepEqual(result.itineraries[0].providerAttribution, [{ providerId: 'alpha', providerName: 'Alpha Provider' }])
  })

  it('executes multiple ready providers in parallel and merges their results', async () => {
    const result = await new SearchExecutionEngine({
      providers: [
        provider('alpha'),
        provider('beta', { flightNumber: 'NH105', carrier: 'NH' })
      ]
    }).execute(request)

    assert.deepEqual(result.providerRuns.map((run) => run.status), ['success', 'success'])
    assert.equal(result.itineraries.length, 2)
    assert.deepEqual(result.itineraries.map((itinerary) => itinerary.providerAttribution?.[0].providerId), ['alpha', 'beta'])
  })

  it('merges duplicate itineraries by preserving provider attribution', async () => {
    const result = await new SearchExecutionEngine({
      providers: [provider('alpha'), provider('beta')]
    }).execute(request)

    assert.equal(result.itineraries.length, 1)
    assert.deepEqual(result.itineraries[0].providerAttribution?.map((item) => item.providerId), ['alpha', 'beta'])
  })

  it('continues when one provider fails', async () => {
    const result = await new SearchExecutionEngine({
      providers: [provider('alpha'), failingProvider('broken')]
    }).execute(request)

    assert.equal(result.itineraries.length, 1)
    assert.deepEqual(result.providerRuns.map((run) => run.status), ['success', 'failed'])
    assert.match(result.warnings.join(' '), /provider failed/i)
  })

  it('reports full provider failure without throwing', async () => {
    const result = await new SearchExecutionEngine({
      providers: [failingProvider('broken')]
    }).execute(request)

    assert.deepEqual(result.itineraries, [])
    assert.equal(result.providerRuns[0].status, 'failed')
    assert.equal(result.dataQuality, 'low')
  })

  it('times out slow providers without blocking other providers', async () => {
    const result = await new SearchExecutionEngine({
      providers: [provider('alpha'), timeoutProvider('slow')],
      timeoutMs: 5
    }).execute(request)

    assert.equal(result.itineraries.length, 1)
    assert.deepEqual(result.providerRuns.map((run) => run.status), ['success', 'timeout'])
    assert.match(result.warnings.join(' '), /timed out/i)
  })

  it('preserves unknown schedule values instead of inventing flight data', async () => {
    const result = await new SearchExecutionEngine({
      providers: [provider('alpha', { flightNumber: undefined, departureTime: undefined, arrivalTime: undefined })]
    }).execute(request)

    const segment = result.itineraries[0].segments[0]
    assert.equal(segment.flightNumber, undefined)
    assert.equal(segment.departureTime, undefined)
    assert.equal(segment.arrivalTime, undefined)
  })

  it('preserves unknown seat values instead of inventing load data', async () => {
    const result = await new SearchExecutionEngine({
      providers: [provider('alpha', { seatCount: undefined, loadStatus: 'Live load unavailable' })]
    }).execute(request)

    const segment = result.itineraries[0].segments[0]
    assert.equal(segment.seatCount, undefined)
    assert.equal(segment.loadStatus, undefined)
  })

  it('skips providers that are not ready', async () => {
    const result = await new SearchExecutionEngine({
      providers: [provider('disabled', {}, { enabled: false, status: 'disabled', message: 'disabled for test' })]
    }).execute(request)

    assert.equal(result.providerRuns[0].status, 'skipped')
    assert.deepEqual(result.itineraries, [])
    assert.ok(result.warnings.includes('disabled for test'))
  })

  it('preserves provider attribution on pipeline itineraries without changing recommendation ordering', async () => {
    const baseline = await runSearchPipelineWithExecution(normalizedRequest, {
      now: new Date('2026-07-22T00:00:00Z'),
      executionProviders: [],
      executionTimeoutMs: 20
    })
    const result = await runSearchPipelineWithExecution(normalizedRequest, {
      now: new Date('2026-07-22T00:00:00Z'),
      executionProviders: [provider('alpha')],
      executionTimeoutMs: 20
    })

    assert.deepEqual(
      result.recommendations.ranked.map((recommendation) => recommendation.label),
      baseline.recommendations.ranked.map((recommendation) => recommendation.label)
    )
    assert.equal(result.providerRuns[0].status, 'success')
    assert.ok(result.itineraries.some((itinerary) => itinerary.providerAttribution.some((item) => item.providerId === 'alpha')))
  })
})

function provider(
  id: string,
  segment: Partial<{
    carrier: string
    flightNumber: string
    departureTime: string
    arrivalTime: string
    seatCount: string
    loadStatus: string
  }> = {},
  readiness: SearchExecutionProvider['readiness'] = { enabled: true, status: 'ready' }
): SearchExecutionProvider {
  const value = <K extends keyof typeof segment>(key: K, fallback: NonNullable<typeof segment[K]>) =>
    Object.prototype.hasOwnProperty.call(segment, key) ? segment[key] : fallback
  return {
    id,
    name: `${title(id)} Provider`,
    readiness,
    capabilities: { schedules: true, loads: false, routeSearch: true },
    search: async () => ({
      itineraries: [{
        dataQuality: 'high',
        segments: [{
          origin: 'LAX',
          destination: 'HND',
          transportType: 'flight',
          carrier: value('carrier', 'UA'),
          flightNumber: value('flightNumber', 'UA39'),
          departureTime: value('departureTime', '2026-07-27T10:00:00-07:00'),
          arrivalTime: value('arrivalTime', '2026-07-28T14:00:00+09:00'),
          seatCount: segment.seatCount,
          loadStatus: segment.loadStatus,
          scheduleStatus: 'Provider schedule candidate',
          notes: ['Provider supplied normalized schedule candidate.']
        }]
      }]
    })
  }
}

function failingProvider(id: string): SearchExecutionProvider {
  return {
    ...provider(id),
    search: async () => { throw new Error(`${id} provider failed`) }
  }
}

function timeoutProvider(id: string): SearchExecutionProvider {
  return {
    ...provider(id),
    search: async () => new Promise(() => {})
  }
}

function title(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}
