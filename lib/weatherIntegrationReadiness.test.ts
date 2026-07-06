import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { getWeatherIntegrationReadiness } from './weatherIntegrationReadiness.ts'

describe('weather integration readiness guardrails', () => {
  it('keeps weather integrations disabled, advisory, and neutral by default', () => {
    const readiness = getWeatherIntegrationReadiness({})

    assert.equal(readiness.readinessLevel, 'disabled')
    assert.equal(readiness.enabledFlags.length, 0)
    assert.equal(readiness.disabledFlags.length, 5)
    assert.equal(readiness.advisoryOnly, true)
    assert.equal(readiness.clientLiveCallsAllowed, false)
    assert.equal(readiness.appliesToScoring, false)
    assert.equal(readiness.unknownWeatherNeutral, true)
    assert.match(readiness.diagnostics.join(' '), /unknown and neutral/i)
  })

  it('distinguishes cache-read readiness from full server-refresh gate readiness', () => {
    const cacheRead = getWeatherIntegrationReadiness({ NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true' })
    const serverRefresh = getWeatherIntegrationReadiness({
      NONREV_ROUTE_LIVE_WEATHER_ENABLED: 'true',
      NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED: 'true',
      NONREV_SERVER_WEATHER_REFRESH_ENABLED: 'true'
    })

    assert.equal(cacheRead.readinessLevel, 'cache-read-ready')
    assert.deepEqual(cacheRead.enabledFlags, ['NONREV_ROUTE_LIVE_WEATHER_ENABLED'])
    assert.equal(serverRefresh.readinessLevel, 'server-refresh-ready')
    assert.deepEqual(serverRefresh.enabledFlags, [
      'NONREV_ROUTE_LIVE_WEATHER_ENABLED',
      'NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED',
      'NONREV_SERVER_WEATHER_REFRESH_ENABLED'
    ])
    assert.equal(serverRefresh.clientLiveCallsAllowed, false)
    assert.equal(serverRefresh.appliesToScoring, false)
  })

  it('flags partial weather enablement without allowing client calls or availability claims', () => {
    const readiness = getWeatherIntegrationReadiness({
      NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED: 'true',
      NONREV_SERVER_WEATHER_REFRESH_SCHEDULER_ENABLED: 'true'
    })
    const joined = [...readiness.diagnostics, ...readiness.limitations, ...readiness.gates.map((gate) => gate.purpose)].join(' ').toLowerCase()

    assert.equal(readiness.readinessLevel, 'partial')
    assert.deepEqual(readiness.enabledFlags, ['NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED', 'NONREV_SERVER_WEATHER_REFRESH_SCHEDULER_ENABLED'])
    assert.equal(readiness.clientLiveCallsAllowed, false)
    assert.match(joined, /advisory only|neutral|client-side live weather provider calls remain disallowed/)
    assert.match(joined, /standby availability|seat inventory|airline website scraping/)
    assert.doesNotMatch(joined, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  })
})
