import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { InMemoryWeatherCacheStore } from './weatherCache.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { getInternalWeatherPrefetchFlag, prefetchRouteWeatherInternal } from './weatherPrefetch.ts'

describe('internal weather prefetch integration', () => {
  it('keeps internal weather prefetch disabled unless explicitly flagged', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const result = await prefetchRouteWeatherInternal({
      store,
      airportCodes: ['SFO'],
      env: {
        NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('[]')
      }
    })

    assert.equal(getInternalWeatherPrefetchFlag({}), 'disabled')
    assert.equal(getInternalWeatherPrefetchFlag({ NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED: 'true' }), 'enabled')
    assert.equal(result.status, 'disabled')
    assert.equal(result.serverOnly, true)
    assert.equal(result.internalOnly, true)
    assert.equal(result.advisoryOnly, true)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
    assert.equal(result.liveCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(fetchCalls, 0)
  })

  it('does not invoke providers when the integration flag is enabled but refresh is disabled', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const result = await prefetchRouteWeatherInternal({
      store,
      route: 'SFO to LAX',
      env: {
        NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED: 'true',
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('[]')
      }
    })

    assert.equal(result.status, 'disabled')
    assert.equal(result.refresh?.status, 'disabled')
    assert.equal(result.liveCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(fetchCalls, 0)
    assert.ok(result.diagnostics.some((item) => /server-side weather refresh was skipped/i.test(item)))
  })

  it('safely invokes server-side refresh when all explicit flags are enabled', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const result = await prefetchRouteWeatherInternal({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:45:00Z'),
      env: {
        NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED: 'true',
        NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response(JSON.stringify([
          {
            icaoId: 'KSFO',
            obsTime: '2026-07-04T12:40:00Z',
            rawOb: 'KSFO 041240Z 28018G28KT 10SM FEW018',
            flightCategory: 'VFR',
            wspd: 18,
            wgst: 28,
            visib: 10,
            ceil: 6000
          }
        ]), { status: 200 })
      }
    })

    assert.equal(result.status, 'prefetched')
    assert.equal(result.refresh?.status, 'refreshed')
    assert.equal(result.refresh?.after.status, 'fresh')
    assert.equal(result.liveCallsAttempted, true)
    assert.equal(result.cacheUpdated, true)
    assert.equal(fetchCalls, 1)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
    assert.equal(result.refresh?.after.usableSignals.length, 1)
  })

  it('does not expose provider calls to client-side runtimes', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const globalWithWindow = globalThis as unknown as { window?: unknown }
    globalWithWindow.window = {}
    try {
      const result = await prefetchRouteWeatherInternal({
        store,
        airportCodes: ['SFO'],
        env: {
          NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED: 'true',
          NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
          NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
        },
        fetchImpl: async () => {
          fetchCalls += 1
          return new Response('[]')
        }
      })

      assert.equal(result.status, 'skipped')
      assert.equal(result.refresh, null)
      assert.equal(result.liveCallsAttempted, false)
      assert.equal(result.cacheUpdated, false)
      assert.equal(fetchCalls, 0)
      assert.ok(result.diagnostics.some((item) => /client-side provider request was attempted/i.test(item)))
    } finally {
      Reflect.deleteProperty(globalWithWindow, 'window')
    }
  })

  it('keeps missing prefetch targets neutral without provider calls', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const result = await prefetchRouteWeatherInternal({
      store,
      env: {
        NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED: 'true',
        NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('[]')
      }
    })

    assert.equal(result.status, 'skipped')
    assert.equal(result.liveCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(fetchCalls, 0)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
  })
})
