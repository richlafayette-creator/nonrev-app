import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { InMemoryWeatherCacheStore, readRouteWeatherCache } from './weatherCache.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { getAviationWeatherCachePopulationFlag, getServerWeatherRefreshFlag, populateWeatherCacheFromAviationWeather, refreshRouteWeatherCacheServerSide } from './weatherCacheServer.ts'

describe('server-side AviationWeather cache population', () => {
  it('keeps AviationWeather cache population disabled unless explicitly flagged', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const result = await populateWeatherCacheFromAviationWeather({
      store,
      airportCodes: ['SFO'],
      env: {},
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('[]')
      }
    })

    assert.equal(getAviationWeatherCachePopulationFlag({}), 'disabled')
    assert.equal(getAviationWeatherCachePopulationFlag({ NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true' }), 'enabled')
    assert.equal(result.status, 'disabled')
    assert.equal(result.serverOnly, true)
    assert.equal(result.advisoryOnly, true)
    assert.equal(result.liveCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(fetchCalls, 0)
    assert.equal(store.get(result.key), undefined)
  })

  it('does not attempt client-side weather requests', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const globalWithWindow = globalThis as unknown as { window?: unknown }
    globalWithWindow.window = {}
    try {
      const result = await populateWeatherCacheFromAviationWeather({
        store,
        airportCodes: ['SFO'],
        env: { NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true' },
        fetchImpl: async () => {
          fetchCalls += 1
          return new Response('[]')
        }
      })

      assert.equal(result.status, 'skipped')
      assert.equal(result.liveCallsAttempted, false)
      assert.equal(result.cacheUpdated, false)
      assert.equal(fetchCalls, 0)
      assert.ok(result.diagnostics.some((item) => /client-side weather request was attempted/i.test(item)))
    } finally {
      Reflect.deleteProperty(globalWithWindow, 'window')
    }
  })

  it('populates the server cache from advisory AviationWeather METAR data when flagged', async () => {
    const store = new InMemoryWeatherCacheStore()
    const result = await populateWeatherCacheFromAviationWeather({
      store,
      airportCodes: ['SFO', 'HNL'],
      now: new Date('2026-07-04T12:00:00Z'),
      env: {
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true',
        NONREV_WEATHER_CACHE_FRESH_MINUTES: '30',
        NONREV_WEATHER_CACHE_DIAGNOSTIC_STALE_MINUTES: '120'
      },
      fetchImpl: async (url, init) => {
        assert.match(String(url), /ids=KSFO%2CPHNL/)
        assert.equal(init?.cache, 'no-store')
        return new Response(JSON.stringify([
          {
            icaoId: 'KSFO',
            obsTime: '2026-07-04T11:50:00Z',
            rawOb: 'KSFO 041150Z 28012KT 10SM FEW012',
            flightCategory: 'VFR',
            wspd: 12,
            wgst: null,
            visib: 10,
            ceil: 5000
          },
          {
            icaoId: 'PHNL',
            obsTime: '2026-07-04T11:45:00Z',
            rawOb: 'PHNL 041145Z 07010KT 10SM FEW025',
            flightCategory: 'VFR',
            wspd: 10,
            wgst: null,
            visib: 10,
            ceil: 2500
          }
        ]), { status: 200 })
      }
    })

    assert.equal(result.status, 'populated')
    assert.equal(result.liveCallsAttempted, true)
    assert.equal(result.cacheUpdated, true)
    assert.equal(result.entry?.advisoryOnly, true)
    assert.equal(result.entry?.signals.length, 2)
    assert.ok(result.limitations.some((item) => /never confirms standby availability|load factors|sellable seat/i.test(item)))

    const readResult = readRouteWeatherCache({
      store,
      airportCodes: ['SFO', 'HNL'],
      now: new Date('2026-07-04T12:10:00Z'),
      env: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    })
    assert.equal(readResult.status, 'fresh')
    assert.equal(readResult.usableSignals.length, 2)
    assert.equal(readResult.appliesToScoring, false)
    assert.equal(readResult.unknownWeatherNeutral, true)
  })

  it('leaves the cache unchanged and neutral when AviationWeather has no cacheable signals', async () => {
    const store = new InMemoryWeatherCacheStore()
    const result = await populateWeatherCacheFromAviationWeather({
      store,
      airportCodes: ['ZZZ'],
      env: { NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true' },
      fetchImpl: async () => {
        throw new Error('fetch should not be called for unsupported airport codes')
      }
    })

    assert.equal(result.status, 'skipped')
    assert.equal(result.liveCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(store.get(result.key), undefined)
    assert.ok(result.diagnostics.some((item) => /unknown weather remains neutral/i.test(item)))
  })

  it('does not overwrite existing cache entries on provider failure', async () => {
    const store = new InMemoryWeatherCacheStore()
    const first = await populateWeatherCacheFromAviationWeather({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:00:00Z'),
      env: { NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true' },
      fetchImpl: async () => new Response(JSON.stringify([
        {
          icaoId: 'KSFO',
          obsTime: '2026-07-04T11:50:00Z',
          rawOb: 'KSFO 041150Z 28012KT 10SM FEW012',
          flightCategory: 'VFR',
          wspd: 12,
          visib: 10,
          ceil: 5000
        }
      ]), { status: 200 })
    })
    assert.equal(first.status, 'populated')
    const originalEntry = store.get(first.key)

    const failed = await populateWeatherCacheFromAviationWeather({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:10:00Z'),
      env: { NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true' },
      fetchImpl: async () => new Response('rate limited', { status: 429 })
    })

    assert.equal(failed.status, 'failed')
    assert.equal(failed.cacheUpdated, false)
    assert.equal(store.get(first.key), originalEntry)
    assert.ok(failed.diagnostics.some((item) => /left unchanged|rate limit/i.test(item)))
  })
})

describe('server-side weather refresh orchestration', () => {
  it('returns unknown/no-op when the refresh flag is disabled', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const result = await refreshRouteWeatherCacheServerSide({
      store,
      airportCodes: ['SFO'],
      env: {
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('[]')
      }
    })

    assert.equal(getServerWeatherRefreshFlag({}), 'disabled')
    assert.equal(getServerWeatherRefreshFlag({ NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true' }), 'enabled')
    assert.equal(result.status, 'disabled')
    assert.equal(result.liveCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(fetchCalls, 0)
    assert.equal(result.before.status, 'missing')
    assert.equal(result.after.usableSignals.length, 0)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
  })

  it('uses a fresh cache hit without calling AviationWeather.gov again', async () => {
    const store = new InMemoryWeatherCacheStore()
    const initial = await populateWeatherCacheFromAviationWeather({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:00:00Z'),
      env: { NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true' },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 },
      fetchImpl: async () => new Response(JSON.stringify([
        {
          icaoId: 'KSFO',
          obsTime: '2026-07-04T11:50:00Z',
          rawOb: 'KSFO 041150Z 28012KT 10SM FEW012',
          flightCategory: 'VFR',
          wspd: 12,
          visib: 10,
          ceil: 5000
        }
      ]), { status: 200 })
    })
    assert.equal(initial.status, 'populated')

    let fetchCalls = 0
    const result = await refreshRouteWeatherCacheServerSide({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:10:00Z'),
      env: {
        NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 },
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response('[]')
      }
    })

    assert.equal(result.status, 'fresh')
    assert.equal(result.before.status, 'fresh')
    assert.equal(result.after.status, 'fresh')
    assert.equal(result.liveCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(fetchCalls, 0)
    assert.equal(result.appliesToScoring, false)
  })

  it('refreshes a cache miss server-side when both refresh and population flags are enabled', async () => {
    const store = new InMemoryWeatherCacheStore()
    const result = await refreshRouteWeatherCacheServerSide({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:00:00Z'),
      env: {
        NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 },
      fetchImpl: async () => new Response(JSON.stringify([
        {
          icaoId: 'KSFO',
          obsTime: '2026-07-04T11:55:00Z',
          rawOb: 'KSFO 041155Z 28012KT 10SM FEW012',
          flightCategory: 'VFR',
          wspd: 12,
          visib: 10,
          ceil: 5000
        }
      ]), { status: 200 })
    })

    assert.equal(result.before.status, 'missing')
    assert.equal(result.status, 'refreshed')
    assert.equal(result.after.status, 'fresh')
    assert.equal(result.liveCallsAttempted, true)
    assert.equal(result.cacheUpdated, true)
    assert.equal(result.after.usableSignals.length, 1)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
  })

  it('refreshes stale cache server-side when both refresh and population flags are enabled', async () => {
    const store = new InMemoryWeatherCacheStore()
    const initial = await populateWeatherCacheFromAviationWeather({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:00:00Z'),
      env: { NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true' },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 },
      fetchImpl: async () => new Response(JSON.stringify([
        {
          icaoId: 'KSFO',
          obsTime: '2026-07-04T11:50:00Z',
          rawOb: 'KSFO 041150Z 28012KT 10SM FEW012',
          flightCategory: 'VFR',
          wspd: 12,
          visib: 10,
          ceil: 5000
        }
      ]), { status: 200 })
    })
    assert.equal(initial.status, 'populated')

    const result = await refreshRouteWeatherCacheServerSide({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:45:00Z'),
      env: {
        NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 },
      fetchImpl: async () => new Response(JSON.stringify([
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
    })

    assert.equal(result.before.status, 'stale')
    assert.equal(result.status, 'refreshed')
    assert.equal(result.after.status, 'fresh')
    assert.equal(result.liveCallsAttempted, true)
    assert.equal(result.cacheUpdated, true)
    assert.equal(result.after.usableSignals.length, 1)
    assert.match(result.after.usableSignals[0].condition, /041240Z/)
    assert.equal(result.advisoryOnly, true)
    assert.equal(result.appliesToScoring, false)
  })

  it('keeps unavailable weather neutral when refresh cannot populate fresh data', async () => {
    const store = new InMemoryWeatherCacheStore()
    const result = await refreshRouteWeatherCacheServerSide({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:45:00Z'),
      env: {
        NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true',
        NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true'
      },
      fetchImpl: async () => new Response('rate limited', { status: 429 })
    })

    assert.equal(result.status, 'failed')
    assert.equal(result.before.status, 'missing')
    assert.equal(result.after.status, 'missing')
    assert.equal(result.after.usableSignals.length, 0)
    assert.equal(result.liveCallsAttempted, true)
    assert.equal(result.cacheUpdated, false)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
    assert.ok(result.diagnostics.some((item) => /unknown\/neutral|rate limit/i.test(item)))
  })

  it('does not expose refresh provider calls to client-side runtimes', async () => {
    const store = new InMemoryWeatherCacheStore()
    let fetchCalls = 0
    const globalWithWindow = globalThis as unknown as { window?: unknown }
    globalWithWindow.window = {}
    try {
      const result = await refreshRouteWeatherCacheServerSide({
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

      assert.equal(result.status, 'skipped')
      assert.equal(result.liveCallsAttempted, false)
      assert.equal(result.cacheUpdated, false)
      assert.equal(fetchCalls, 0)
      assert.equal(result.after.usableSignals.length, 0)
      assert.ok(result.diagnostics.some((item) => /client-side provider request was attempted/i.test(item)))
    } finally {
      Reflect.deleteProperty(globalWithWindow, 'window')
    }
  })
})
