import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { airportWeatherSignalFromAviationWeatherMetar, aviationWeatherStationForAirport, fetchAviationWeatherMetarSignals } from './aviationWeatherMetarAdapter.ts'

describe('AviationWeather.gov METAR adapter', () => {
  it('resolves supported beta airports to ICAO weather stations conservatively', () => {
    assert.equal(aviationWeatherStationForAirport('SFO'), 'KSFO')
    assert.equal(aviationWeatherStationForAirport('HNL'), 'PHNL')
    assert.equal(aviationWeatherStationForAirport('ZZZ'), '')
  })

  it('parses advisory METAR observations without claiming standby availability', () => {
    const signal = airportWeatherSignalFromAviationWeatherMetar({
      icaoId: 'KSFO',
      obsTime: '2026-07-04T11:00:00Z',
      rawOb: 'KSFO 041100Z 28018G31KT 2SM BR OVC006 13/11 A2992',
      flightCategory: 'IFR',
      wspd: 18,
      wgst: 31,
      visib: '2',
      ceil: 600
    }, new Date('2026-07-04T11:30:00Z'))

    assert.equal(signal.airportCode, 'SFO')
    assert.equal(signal.source, 'AviationWeather.gov / METAR / TAF')
    assert.equal(signal.delayRisk, 'risky')
    assert.equal(signal.fogRisk, 'risky')
    assert.equal(signal.confidence, 'high')
    assert.ok(signal.limitations.some((item) => /does not provide standby|load factors|sellable seat/i.test(item)))
  })

  it('does not call the live API unless explicitly enabled', async () => {
    let called = false
    const result = await fetchAviationWeatherMetarSignals(['SFO'], {
      fetchImpl: async () => {
        called = true
        throw new Error('should not call')
      }
    })

    assert.equal(called, false)
    assert.equal(result.liveCallsAttempted, false)
    assert.equal(result.advisoryOnly, true)
    assert.deepEqual(result.airports, [])
  })

  it('fetches bounded advisory METAR JSON when explicitly enabled', async () => {
    const result = await fetchAviationWeatherMetarSignals(['SFO', 'HNL'], {
      liveCallsEnabled: true,
      now: new Date('2026-07-04T12:00:00Z'),
      fetchImpl: async (url, init) => {
        assert.ok(String(url).startsWith('https://aviationweather.gov/api/data/metar?'))
        assert.ok(String(url).includes('ids=KSFO%2CPHNL'))
        assert.equal(init?.cache, 'no-store')
        return new Response(JSON.stringify([
          { icaoId: 'KSFO', obsTime: '2026-07-04T11:20:00Z', rawOb: 'KSFO 041120Z 28012KT 10SM FEW012', flightCategory: 'VFR', wspd: 12, visib: '10', ceil: 12000 },
          { icaoId: 'PHNL', obsTime: '2026-07-04T11:30:00Z', rawOb: 'PHNL 041130Z 07010KT 10SM FEW025', flightCategory: 'VFR', wspd: 10, visib: '10', ceil: 2500 }
        ]), { status: 200 })
      }
    })

    assert.equal(result.liveCallsAttempted, true)
    assert.equal(result.provider, 'AviationWeather.gov / METAR / TAF')
    assert.equal(result.airports.length, 2)
    assert.deepEqual(result.airports.map((airport) => airport.airportCode), ['SFO', 'HNL'])
    assert.ok(result.limitations.every((item) => !/confirmed standby availability/i.test(item)))
  })

  it('fails closed on provider errors', async () => {
    const result = await fetchAviationWeatherMetarSignals(['SFO'], {
      liveCallsEnabled: true,
      fetchImpl: async () => new Response('', { status: 503 })
    })

    assert.equal(result.liveCallsAttempted, true)
    assert.deepEqual(result.airports, [])
    assert.ok(result.diagnostics.some((item) => /service unavailable/i.test(item)))
  })
})
