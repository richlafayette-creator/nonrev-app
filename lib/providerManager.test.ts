import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createDefaultProviderManager, createPlaceholderFlightProvider } from './providerAdapters.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { ProviderManager, type StandardFlightProvider } from './providerManager.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { SearchExecutionEngine } from './searchExecutionEngine.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTravelerProfile } from './travelerProfile.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeTripMission } from './tripMission.ts'

const request = {
  mission: normalizeTripMission({
    originAirports: ['LAX'],
    preferredDepartureAirports: ['LAX'],
    preferredDestinations: ['HND'],
    departureDate: '2026-07-27',
    travelers: 1
  }),
  tripType: 'one_way' as const,
  travelerCount: 1,
  travelerProfile: normalizeTravelerProfile(),
  routeSegments: [{ origin: 'LAX', destination: 'HND', transportType: 'flight' as const, journeyDate: '2026-07-27' }]
}

describe('provider manager', () => {
  it('registers beta providers without enabling placeholders', () => {
    const metadata = createDefaultProviderManager({ apiKey: 'key' }).providerMetadata()

    assert.deepEqual(metadata.map((provider) => provider.id), [
      'aerodatabox',
      'google-flights-parser',
      'stafftraveler',
      'myidtravel',
      'zed'
    ])
    assert.equal(metadata.find((provider) => provider.id === 'aerodatabox')?.enabled, true)
    assert.equal(metadata.filter((provider) => provider.placeholder).every((provider) => provider.enabled === false), true)
  })

  it('runs providers independently and continues after failures', async () => {
    const manager = new ProviderManager({
      providers: [successProvider('alpha'), throwingProvider('broken'), warningProvider('quota')],
      timeoutMs: 25
    })
    const result = await new SearchExecutionEngine({ providerManager: manager }).execute(request)

    assert.equal(result.itineraries.length, 1)
    assert.deepEqual(result.providerRuns.map((run) => run.status), ['success', 'failed', 'quota_exhausted'])
    assert.deepEqual(result.providerHealth.map((health) => health.providerId), ['alpha', 'broken', 'quota'])
    assert.equal(result.providerRuns[2].diagnostics?.errorCategory, 'quota_exhausted')
  })

  it('keeps placeholders health-checkable and data-empty', async () => {
    const manager = new ProviderManager({
      providers: [
        createPlaceholderFlightProvider({
          id: 'future-provider',
          name: 'Future provider',
          message: 'Future provider is disabled.',
          capabilities: { schedules: true, routeSearch: true }
        })
      ]
    })
    const result = await new SearchExecutionEngine({ providerManager: manager }).execute(request)

    assert.deepEqual(result.itineraries, [])
    assert.equal(result.providerRuns[0].status, 'skipped')
    assert.equal(result.providerHealth[0].status, 'disabled')
    assert.equal(result.providerHealth[0].recordsNormalized, 0)
  })
})

function successProvider(id: string): StandardFlightProvider {
  async function searchSchedules() {
    return {
      itineraries: [{
        dataQuality: 'high' as const,
        segments: [{
          origin: 'LAX',
          destination: 'HND',
          transportType: 'flight' as const,
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
        responseLatencyMs: 3
      }
    }
  }
  return {
    searchFlights: searchSchedules,
    searchSchedules,
    async healthCheck() {
      return {
        providerId: id,
        providerName: `${id} provider`,
        status: 'ready',
        enabled: true,
        checkedAt: '2026-07-22T00:00:00.000Z',
        responseLatencyMs: 0,
        confidenceWeight: 80,
        recordsReceived: 0,
        recordsNormalized: 0,
        warnings: []
      }
    },
    providerMetadata() {
      return {
        id,
        name: `${id} provider`,
        enabled: true,
        confidenceWeight: 80,
        capabilities: { schedules: true, routeSearch: true }
      }
    }
  }
}

function throwingProvider(id: string): StandardFlightProvider {
  return {
    ...successProvider(id),
    async searchSchedules() {
      throw new Error(`${id} provider failed`)
    }
  }
}

function warningProvider(id: string): StandardFlightProvider {
  return {
    ...successProvider(id),
    async searchSchedules() {
      return {
        itineraries: [],
        status: 'quota_exhausted',
        warnings: ['Provider monthly quota exhausted.'],
        diagnostics: {
          recordsReceived: 0,
          recordsNormalized: 0,
          recordsMatched: 0,
          recordsUnmatched: 0,
          responseLatencyMs: 4,
          errorCategory: 'quota_exhausted'
        }
      }
    }
  }
}
