import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { getWeatherSourceReadiness, weatherIntelligenceFutureDataSources } from './weatherSourceReadiness.ts'

describe('weather source readiness', () => {
  it('prepares real weather source contracts without enabling live calls', () => {
    const readiness = getWeatherSourceReadiness({ TOMORROW_IO_API_KEY: 'configured' })

    assert.deepEqual(weatherIntelligenceFutureDataSources, [
      'NOAA',
      'National Weather Service',
      'AviationWeather.gov / METAR / TAF',
      'Tomorrow.io',
      'OpenWeather',
      'FlightAware weather alerts'
    ])
    assert.ok(readiness.some((source) => source.provider === 'NOAA' && source.status === 'adapter-ready'))
    assert.ok(readiness.some((source) => source.provider === 'Tomorrow.io' && source.status === 'credential-configured'))
    assert.ok(readiness.some((source) => source.provider === 'OpenWeather' && source.status === 'credential-missing'))
    assert.ok(readiness.every((source) => source.liveCallsEnabled === false))
    assert.ok(readiness.every((source) => source.advisoryOnly === true))
    assert.ok(readiness.every((source) => source.cannotProvide.length > 0))
    assert.ok(readiness.some((source) => source.cannotProvide.some((item) => /standby|seat|clearance|inventory/i.test(item))))
  })
})
