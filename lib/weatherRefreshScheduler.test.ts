import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { InMemoryWeatherCacheStore, readRouteWeatherCache } from './weatherCache.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { getServerWeatherRefreshSchedulerFlag, runServerWeatherRefreshScheduler } from './weatherRefreshScheduler.ts'

const enabledEnv = {
  NONREV_SERVER_WEATHER_REFRESH_SCHEDULER_ENABLED: 'true',
  NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
  NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true',
  NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true',
  NONREV_WEATHER_CACHE_FRESH_MINUTES: '30',
  NONREV_WEATHER_CACHE_DIAGNOSTIC_STALE_MINUTES: '120'
}

describe('server-side weather refresh scheduler', () => {
  it('keeps the scheduler disabled unless explicitly flagged', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const result = await runServerWeatherRefreshScheduler({
      store,
      targets: [{ airportCodes: ['SFO'] }],
      env: {
        NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('[]')
      }
    })

    assert.equal(getServerWeatherRefreshSchedulerFlag({}), 'disabled')
    assert.equal(getServerWeatherRefreshSchedulerFlag({ NONREV_SERVER_WEATHER_REFRESH_SCHEDULER_ENABLED: 'true' }), 'enabled')
    assert.equal(result.status, 'disabled')
    assert.equal(result.serverOnly, true)
    assert.equal(result.advisoryOnly, true)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
    assert.equal(result.liveCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(fetchCalls, 0)
  })

  it('does not attempt AviationWeather.gov requests in client-side runtimes', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const globalWithWindow = globalThis as unknown as { window?: unknown }
    globalWithWindow.window = {}
    try {
      const result = await runServerWeatherRefreshScheduler({
        store,
        targets: [{ airportCodes: ['SFO'] }],
        env: enabledEnv,
        fetchImpl: async () => {
          fetchCalls += 1
          return new Response('[]')
        }
      })

      assert.equal(result.status, 'skipped')
      assert.equal(result.liveCallsAttempted, false)
      assert.equal(result.cacheUpdated, false)
      assert.equal(fetchCalls, 0)
      assert.ok(result.diagnostics.some((item) => /client-side AviationWeather\.gov request was attempted/i.test(item)))
    } finally {
      Reflect.deleteProperty(globalWithWindow, 'window')
    }
  })

  it('refreshes the cache from AviationWeather.gov METAR data when scheduler and provider flags are enabled', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const result = await runServerWeatherRefreshScheduler({
      store,
      targets: [{ airportCodes: ['SFO', 'LAX'] }],
      env: enabledEnv,
      now: new Date('2026-07-04T18:20:00Z'),
      fetchImpl: async (url, init) => {
        fetchCalls += 1
        assert.match(String(url), /aviationweather\.gov\/api\/data\/metar/)
        assert.match(String(url), /ids=KSFO%2CKLAX/)
        assert.equal(init?.cache, 'no-store')
        return new Response(JSON.stringify([
          {
            icaoId: 'KSFO',
            obsTime: '2026-07-04T18:10:00Z',
            rawOb: 'KSFO 041810Z 28018G28KT 10SM FEW018',
            flightCategory: 'VFR',
            wspd: 18,
            wgst: 28,
            visib: 10,
            ceil: 6000
          },
          {
            icaoId: 'KLAX',
            obsTime: '2026-07-04T18:08:00Z',
            rawOb: 'KLAX 041808Z 25008KT 10SM FEW012',
            flightCategory: 'VFR',
            wspd: 8,
            visib: 10,
            ceil: 5000
          }
        ]), { status: 200 })
      }
    })

    assert.equal(result.status, 'completed')
    assert.equal(result.refreshes.length, 1)
    assert.equal(result.refreshes[0].status, 'refreshed')
    assert.equal(result.liveCallsAttempted, true)
    assert.equal(result.cacheUpdated, true)
    assert.equal(fetchCalls, 1)

    const read = readRouteWeatherCache({
      store,
      airportCodes: ['SFO', 'LAX'],
      now: new Date('2026-07-04T18:25:00Z'),
      env: enabledEnv,
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    })
    assert.equal(read.status, 'fresh')
    assert.equal(read.usableSignals.length, 2)
    assert.equal(read.appliesToScoring, false)
    assert.equal(read.unknownWeatherNeutral, true)
    assert.ok(read.entry?.limitations.some((item) => /standby availability|load factors|sellable seat/i.test(item)))
  })

  it('respects cache TTL and skips AviationWeather.gov when cached weather is already fresh', async () => {
    const store = new InMemoryWeatherCacheStore()
    const first = await runServerWeatherRefreshScheduler({
      store,
      targets: [{ airportCodes: ['SFO'] }],
      env: enabledEnv,
      now: new Date('2026-07-04T18:00:00Z'),
      fetchImpl: async () => new Response(JSON.stringify([
        {
          icaoId: 'KSFO',
          obsTime: '2026-07-04T17:50:00Z',
          rawOb: 'KSFO 041750Z 28012KT 10SM FEW012',
          flightCategory: 'VFR',
          wspd: 12,
          visib: 10,
          ceil: 5000
        }
      ]), { status: 200 })
    })
    assert.equal(first.cacheUpdated, true)

    let fetchCalls = 0
    const second = await runServerWeatherRefreshScheduler({
      store,
      targets: [{ airportCodes: ['SFO'] }],
      env: enabledEnv,
      now: new Date('2026-07-04T18:10:00Z'),
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('[]')
      },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    })

    assert.equal(second.status, 'completed')
    assert.equal(second.refreshes[0].status, 'fresh')
    assert.equal(second.liveCallsAttempted, false)
    assert.equal(second.cacheUpdated, false)
    assert.equal(fetchCalls, 0)
  })

  it('fails gracefully on AviationWeather.gov timeout and keeps unknown weather neutral', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const result = await runServerWeatherRefreshScheduler({
      store,
      targets: [{ airportCodes: ['SFO'] }],
      env: enabledEnv,
      now: new Date('2026-07-04T18:20:00Z'),
      timeoutMs: 1,
      fetchImpl: async (_url, init) => {
        fetchCalls += 1
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('timed out', 'AbortError'))
          })
        })
      }
    })

    assert.equal(result.status, 'completed')
    assert.equal(result.refreshes[0].status, 'failed')
    assert.equal(result.liveCallsAttempted, true)
    assert.equal(result.cacheUpdated, false)
    assert.equal(fetchCalls, 1)
    assert.equal(result.refreshes[0].after.status, 'missing')
    assert.equal(result.refreshes[0].after.usableSignals.length, 0)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
    assert.ok(result.diagnostics.some((item) => /timed out|unknown\/neutral/i.test(item)))
  })

  it('fails gracefully on unavailable AviationWeather.gov responses and leaves existing cache unchanged', async () => {
    const store = new InMemoryWeatherCacheStore()
    const first = await runServerWeatherRefreshScheduler({
      store,
      targets: [{ airportCodes: ['SFO'] }],
      env: enabledEnv,
      now: new Date('2026-07-04T18:00:00Z'),
      fetchImpl: async () => new Response(JSON.stringify([
        {
          icaoId: 'KSFO',
          obsTime: '2026-07-04T17:50:00Z',
          rawOb: 'KSFO 041750Z 28012KT 10SM FEW012',
          flightCategory: 'VFR',
          wspd: 12,
          visib: 10,
          ceil: 5000
        }
      ]), { status: 200 })
    })
    assert.equal(first.cacheUpdated, true)
    const originalEntry = store.get(first.refreshes[0].key)

    const unavailable = await runServerWeatherRefreshScheduler({
      store,
      targets: [{ airportCodes: ['SFO'] }],
      env: enabledEnv,
      now: new Date('2026-07-04T18:45:00Z'),
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 },
      fetchImpl: async () => new Response('service unavailable', { status: 503 })
    })

    assert.equal(unavailable.status, 'completed')
    assert.equal(unavailable.refreshes[0].before.status, 'stale')
    assert.equal(unavailable.refreshes[0].status, 'failed')
    assert.equal(unavailable.liveCallsAttempted, true)
    assert.equal(unavailable.cacheUpdated, false)
    assert.equal(store.get(first.refreshes[0].key), originalEntry)
    assert.equal(unavailable.refreshes[0].after.usableSignals.length, 0)
    assert.equal(unavailable.appliesToScoring, false)
    assert.equal(unavailable.unknownWeatherNeutral, true)
    assert.ok(unavailable.diagnostics.some((item) => /service unavailable|unknown\/neutral/i.test(item)))
  })
})
