import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AirportWeatherSignal } from './weatherIntelligence'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createWeatherCacheEntry, InMemoryWeatherCacheStore } from './weatherCache.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { rankItineraries } from './decisionEngine.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { getRouteWeatherRisk } from './weatherIntelligence.ts'
import type { ItineraryResult } from './itinerarySearch'

const watchWeatherSignal: AirportWeatherSignal = {
  airportCode: 'SFO',
  observedAt: '2026-07-04T12:00:00Z',
  forecastTime: null,
  condition: 'Advisory cached METAR watch conditions',
  windSpeed: 18,
  windGusts: 31,
  visibility: 10,
  ceiling: 1800,
  precipitation: null,
  thunderstormRisk: 'clear',
  snowIceRisk: 'clear',
  fogRisk: 'watch',
  delayRisk: 'watch',
  cancellationRisk: 'clear',
  confidence: 'medium',
  source: 'AviationWeather.gov / METAR / TAF',
  limitations: ['Cached METAR is advisory only.']
}

function itinerary(input: { id: string; route: string; departure: string; arrival: string; flightNumber: string; score?: number }): ItineraryResult {
  const [origin, destination] = input.route.split('→').map((part) => part.trim())
  return {
    id: input.id,
    route: input.route,
    legs: [{
      origin,
      destination,
      route: input.route,
      carrier: 'UA',
      flightNumber: input.flightNumber,
      departureTime: input.departure,
      arrivalTime: input.arrival,
      aircraft: '737',
      status: 'Scheduled',
      score: input.score || 80,
      risk: 'Low',
      source: 'test-provider',
      sourceProvider: 'test-provider'
    }],
    carrier: 'UA',
    flightNumber: input.flightNumber,
    departureTime: input.departure,
    arrivalTime: input.arrival,
    aircraft: '737',
    status: 'Scheduled',
    score: input.score || 80,
    risk: 'Low',
    source: 'test-provider',
    sourceProvider: 'test-provider',
    dataFreshnessRule: 'exact-requested-date'
  }
}

function sampleItineraries() {
  return [
    itinerary({ id: 'later-fast', route: 'SFO → LAX', departure: '2026-07-04T15:00:00Z', arrival: '2026-07-04T16:30:00Z', flightNumber: 'UA100' }),
    itinerary({ id: 'earlier-slow', route: 'SFO → LAX', departure: '2026-07-04T13:00:00Z', arrival: '2026-07-04T15:00:00Z', flightNumber: 'UA101' })
  ]
}

function rankedSignature(results: ReturnType<typeof rankItineraries>) {
  return results.map((result) => ({ id: result.itinerary.id, score: result.decisionScore.overallScore, rank: result.rank }))
}

describe('cached weather itinerary intelligence', () => {
  it('keeps rankings identical when the weather cache feature flag is disabled', () => {
    const store = new InMemoryWeatherCacheStore()
    store.set(createWeatherCacheEntry({
      provider: 'AviationWeather.gov / METAR / TAF',
      airportCodes: ['SFO', 'LAX'],
      signals: [{ ...watchWeatherSignal, delayRisk: 'risky', cancellationRisk: 'watch', thunderstormRisk: 'risky' }],
      fetchedAt: new Date('2026-07-04T12:00:00Z')
    }))

    const baseline = rankItineraries(sampleItineraries())
    const withDisabledWeather = rankItineraries(sampleItineraries(), {
      weatherCacheStore: store,
      weatherCacheNow: new Date('2026-07-04T12:05:00Z'),
      weatherCacheEnv: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'false' }
    })

    assert.deepEqual(rankedSignature(withDisabledWeather), rankedSignature(baseline))
    assert.equal(withDisabledWeather[0].itinerary.weatherIntelligence, undefined)
  })

  it('keeps stale cached weather neutral', () => {
    const store = new InMemoryWeatherCacheStore()
    store.set(createWeatherCacheEntry({
      provider: 'AviationWeather.gov / METAR / TAF',
      airportCodes: ['SFO', 'LAX'],
      signals: [watchWeatherSignal],
      fetchedAt: new Date('2026-07-04T12:00:00Z'),
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    }))

    const baseline = rankItineraries(sampleItineraries())
    const stale = rankItineraries(sampleItineraries(), {
      weatherCacheStore: store,
      weatherCacheNow: new Date('2026-07-04T12:45:00Z'),
      weatherFreshnessPolicy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 },
      weatherCacheEnv: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' }
    })

    assert.deepEqual(rankedSignature(stale), rankedSignature(baseline))
    assert.equal(stale[0].itinerary.weatherIntelligence, undefined)
  })

  it('keeps missing cached weather neutral', () => {
    const store = new InMemoryWeatherCacheStore()
    const baseline = rankItineraries(sampleItineraries())
    const missing = rankItineraries(sampleItineraries(), {
      weatherCacheStore: store,
      weatherCacheNow: new Date('2026-07-04T12:05:00Z'),
      weatherCacheEnv: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' }
    })

    assert.deepEqual(rankedSignature(missing), rankedSignature(baseline))
    assert.equal(missing[0].itinerary.weatherIntelligence, undefined)
  })

  it('attaches fresh cached advisory labels without scoring or certainty claims', () => {
    const store = new InMemoryWeatherCacheStore()
    store.set(createWeatherCacheEntry({
      provider: 'AviationWeather.gov / METAR / TAF',
      airportCodes: ['SFO', 'LAX'],
      signals: [watchWeatherSignal],
      fetchedAt: new Date('2026-07-04T12:00:00Z'),
      policy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 }
    }))

    const baseline = rankItineraries(sampleItineraries())
    const withWeather = rankItineraries(sampleItineraries(), {
      weatherCacheStore: store,
      weatherCacheNow: new Date('2026-07-04T12:05:00Z'),
      weatherFreshnessPolicy: { freshForMinutes: 30, diagnosticStaleForMinutes: 120 },
      weatherCacheEnv: { NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' }
    })
    const weather = withWeather[0].itinerary.weatherIntelligence

    assert.deepEqual(rankedSignature(withWeather), rankedSignature(baseline))
    assert.equal(weather?.advisoryOnly, true)
    assert.equal(weather?.cacheStatus, 'fresh')
    assert.equal(weather?.routeRisk.label, 'Watch')
    assert.equal(weather?.routeRisk.level, 'watch')
    assert.equal(weather?.routeRisk.scoreImpact, 0)
    assert.equal(weather?.routeRisk.successProbabilityImpact, 0)
    assert.equal(weather?.routeRisk.routeRankingImpact, 0)
    assert.match(weather?.routeRisk.summary || '', /Advisory-only cached weather signal/i)
    assert.doesNotMatch(weather?.routeRisk.summary || '', /will delay|will cancel|certain/i)

    const displayRisk = getRouteWeatherRisk(withWeather[0].itinerary.route, weather)
    assert.equal(displayRisk.displayLabel, 'Watch')
    assert.equal(displayRisk.status, 'cached-advisory')
    assert.equal(displayRisk.scoreImpact, 0)
    assert.equal(displayRisk.successProbabilityImpact, 0)
    assert.equal(displayRisk.routeRankingImpact, 0)
  })
})
