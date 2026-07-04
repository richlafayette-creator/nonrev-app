import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AirportWeatherSignal } from './weatherIntelligence'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createWeatherCacheEntry, getRouteLiveWeatherFlag, getWeatherFreshnessPolicy, InMemoryWeatherCacheStore, readRouteWeatherCache, weatherCacheKeyForAirports, weatherCacheKeyForRoute } from './weatherCache.ts'

const sampleSignal: AirportWeatherSignal = {
  airportCode: 'SFO',
  observedAt: '2026-07-04T12:00:00Z',
  forecastTime: null,
  condition: 'Sample advisory METAR',
  windSpeed: 10,
  windGusts: null,
  visibility: 10,
  ceiling: 5000,
  precipitation: null,
  thunderstormRisk: 'clear',
  snowIceRisk: 'clear',
  fogRisk: 'clear',
  delayRisk: 'clear',
  cancellationRisk: 'clear',
  confidence: 'medium',
  source: 'AviationWeather.gov / METAR / TAF',
  limitations: ['Sample signal remains advisory only.']
}

describe('weather cache infrastructure', () => {
  it('keeps route-level live weather disabled unless explicitly flagged', () => {
    assert.equal(getRouteLiveWeatherFlag({}), 'disabled')
    assert.equal(getRouteLiveWeatherFlag({ NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'false' }), 'disabled')
    assert.equal(getRouteLiveWeatherFlag({ NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' }), 'enabled')
  })

  it('normalizes route weather cache keys without guessing missing airports', () => {
    assert.equal(weatherCacheKeyForAirports(['sfo', ' jfk ']), 'route-weather:SFO>JFK')
    assert.equal(weatherCacheKeyForRoute('SFO → JFK via BOS'), 'route-weather:SFO>JFK>BOS')
    assert.equal(weatherCacheKeyForAirports(['??']), 'route-weather:unknown')
  })

  it('clamps freshness policy from env', () => {
    assert.deepEqual(getWeatherFreshnessPolicy({ NONREV_WEATHER_CACHE_FRESH_MINUTES: '1', NONREV_WEATHER_CACHE_DIAGNOSTIC_STALE_MINUTES: '9999' }), {
      freshForMinutes: 5,
      diagnosticStaleForMinutes: 720
    })
    assert.deepEqual(getWeatherFreshnessPolicy({ NONREV_WEATHER_CACHE_FRESH_MINUTES: '45', NONREV_WEATHER_CACHE_DIAGNOSTIC_STALE_MINUTES: '90' }), {
      freshForMinutes: 45,
      diagnosticStaleForMinutes: 90
    })
  })

  it('ignores cache data when the feature flag is disabled', () => {
    const store = new InMemoryWeatherCacheStore()
    const entry = createWeatherCacheEntry({
      provider: 'AviationWeather.gov / METAR / TAF',
      airportCodes: ['SFO'],
      signals: [sampleSignal],
      fetchedAt: new Date('2026-07-04T12:00:00Z')
    })
    store.set(entry)

    const result = readRouteWeatherCache({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:05:00Z'),
      env: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'false' }
    })

    assert.equal(result.status, 'disabled')
    assert.deepEqual(result.usableSignals, [])
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
    assert.ok(result.diagnostics.some((item) => /disabled/i.test(item)))
  })

  it('returns fresh cache signals as advisory-only infrastructure without scoring effects', () => {
    const store = new InMemoryWeatherCacheStore()
    store.set(createWeatherCacheEntry({
      provider: 'AviationWeather.gov / METAR / TAF',
      airportCodes: ['SFO'],
      signals: [sampleSignal],
      fetchedAt: new Date('2026-07-04T12:00:00Z'),
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    }))

    const result = readRouteWeatherCache({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:20:00Z'),
      env: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    })

    assert.equal(result.status, 'fresh')
    assert.equal(result.usableSignals.length, 1)
    assert.equal(result.advisoryOnly, true)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownWeatherNeutral, true)
    assert.ok(result.limitations.some((item) => /never confirms standby availability|load factors|sellable seat/i.test(item)))
  })

  it('keeps missing, stale, and expired cache neutral', () => {
    const store = new InMemoryWeatherCacheStore()
    store.set(createWeatherCacheEntry({
      provider: 'AviationWeather.gov / METAR / TAF',
      airportCodes: ['SFO'],
      signals: [sampleSignal],
      fetchedAt: new Date('2026-07-04T12:00:00Z'),
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    }))

    const stale = readRouteWeatherCache({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T12:45:00Z'),
      env: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    })
    const expired = readRouteWeatherCache({
      store,
      airportCodes: ['SFO'],
      now: new Date('2026-07-04T14:30:00Z'),
      env: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    })
    const missing = readRouteWeatherCache({
      store,
      airportCodes: ['JFK'],
      now: new Date('2026-07-04T12:05:00Z'),
      env: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' },
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    })

    assert.equal(stale.status, 'stale')
    assert.equal(expired.status, 'expired')
    assert.equal(missing.status, 'missing')
    for (const result of [stale, expired, missing]) {
      assert.deepEqual(result.usableSignals, [])
      assert.equal(result.appliesToScoring, false)
      assert.equal(result.unknownWeatherNeutral, true)
    }
  })
})
