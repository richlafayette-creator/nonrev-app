import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { betaReadinessDashboardFeatureFlag, buildBetaReadiness } from './betaReadiness.ts'

const now = new Date('2026-07-08T03:32:00.000Z')

function env(extra: Record<string, string | undefined> = {}) {
  return { [betaReadinessDashboardFeatureFlag]: 'true', ...extra }
}

function assertGuardrails(readiness: NonNullable<ReturnType<typeof buildBetaReadiness>>) {
  assert.equal(readiness.diagnosticsOnly, true)
  assert.equal(readiness.advisoryOnly, true)
  assert.equal(readiness.noItineraryGenerationChange, true)
  assert.equal(readiness.noRankingChange, true)
  assert.equal(readiness.noScoringChange, true)
  assert.equal(readiness.noPlannerBehaviorChange, true)
  assert.equal(readiness.noUiChange, true)
  assert.equal(readiness.noApiContractChange, true)
  assert.equal(readiness.noAdvisoryWordingChange, true)
  assert.equal(readiness.neverExposeSecrets, true)
}

describe('beta readiness dashboard diagnostics', () => {
  it('omits the readiness object when the feature flag is disabled', () => {
    const readiness = buildBetaReadiness({
      now,
      env: {},
      providerHealth: { summary: { overallStatus: 'healthy' } }
    })

    assert.equal(readiness, undefined)
  })

  it('aggregates all readiness components into a single diagnostics-only object', () => {
    const readiness = buildBetaReadiness({
      now,
      env: env(),
      providerHealth: {
        summary: { overallStatus: 'healthy' },
        providers: [
          { provider: 'AviationWeather.gov METAR cache', status: 'healthy', cacheAgeMinutes: 12, cacheStatus: 'fresh', summary: 'Weather cache is healthy.' },
          { provider: 'Historical Reliability Service', status: 'healthy', cacheAgeMinutes: 20, cacheStatus: 'fresh', summary: 'Reliability cache is healthy.' }
        ]
      },
      historicalReliability: {
        providerStatus: { status: 'available', providers: [{ providerName: 'HistoricalReliabilityProviderAdapter', status: 'available' }] },
        dataFreshness: { status: 'fresh', maxAgeMinutes: 30 },
        summary: 'Historical reliability aggregation is available.'
      },
      airportIntelligence: {
        status: 'ready',
        providers: [{ provider: 'Local static airport scaffold', status: 'ready', cache: { status: 'fresh', ageMinutes: 1440 } }]
      },
      commercialAvailability: {
        status: 'limited',
        providers: [{ providerName: 'Commercial availability proxy cache', status: 'limited', cacheAgeMinutes: 45 }]
      },
      weather: {
        readinessLevel: 'server-refresh-ready',
        gates: [{ provider: 'NONREV_ROUTE_LIVE_WEATHER_ENABLED', status: 'enabled' }],
        cacheStatus: 'fresh',
        cacheAgeMinutes: 9
      },
      recoveryEngineV2: {
        enabled: true,
        sources: [{ source: 'Alternate airport intelligence', status: 'manual-source-ready' }],
        diagnostics: ['Recovery Engine v2 advisory candidate pipeline is enabled.']
      },
      standbyConfidence: {
        status: 'advisory',
        providerName: 'Standby Confidence Engine',
        diagnostics: ['Structured load input is trusted.']
      },
      plannerSignalAttribution: {
        status: 'present',
        diagnostics: ['Planner attribution diagnostics are present.']
      },
      smokeTests: [
        { name: 'itinerary parser smoke', status: 'pass' },
        { name: 'watchlist activity smoke', status: 'pass' }
      ],
      i18n: {
        defaultLocale: 'en',
        locales: ['en', 'es', 'ja'],
        messageCatalogsPresent: true
      }
    })

    assert.ok(readiness)
    assertGuardrails(readiness)
    assert.equal(readiness.generatedAt, '2026-07-08T03:32:00.000Z')
    assert.equal(readiness.overallStatus, 'warning')
    assert.deepEqual(readiness.unavailable, [])
    assert.deepEqual(readiness.missingComponents, [])
    assert.ok(readiness.ready.includes('Provider Health'))
    assert.ok(readiness.warning.includes('Commercial Availability'))
    assert.ok(readiness.providerSummaries.some((summary) => summary.provider === 'AviationWeather.gov METAR cache'))
    assert.ok(readiness.cacheSummaries.some((summary) => summary.component === 'Weather' && summary.cacheAgeMinutes === 9))
    assert.equal(readiness.diagnosticsSummaries.length, 10)
  })

  it('reports unavailable overall status and missing components when inputs are absent or failed', () => {
    const readiness = buildBetaReadiness({
      now,
      env: env(),
      providerHealth: { summary: { overallStatus: 'degraded' }, providers: [{ provider: 'Provider Health', status: 'degraded' }] },
      smokeTests: [{ name: 'route matrix smoke', status: 'fail', summary: 'Route matrix smoke failed.' }],
      i18n: { defaultLocale: 'en', locales: ['en'], messageCatalogsPresent: true }
    })

    assert.ok(readiness)
    assert.equal(readiness.overallStatus, 'unavailable')
    assert.ok(readiness.warning.includes('Provider Health'))
    assert.ok(readiness.warning.includes('i18n foundation'))
    assert.ok(readiness.unavailable.includes('Smoke Tests'))
    assert.ok(readiness.missingComponents.includes('Historical Reliability'))
    assert.ok(readiness.missingComponents.includes('Weather'))
    assert.ok(readiness.diagnosticsSummaries.find((summary) => summary.component === 'Smoke Tests')?.summary)
  })

  it('redacts secrets, credential-like values, query params, and internal paths from summaries', () => {
    const readiness = buildBetaReadiness({
      now,
      env: env({ SECRET_TOKEN: 'secret-provider-token' }),
      providerHealth: {
        summary: { overallStatus: 'degraded' },
        providers: [{
          provider: 'Bearer secret-provider-token',
          status: 'failed',
          summary: 'GET https://example.test/path?api_key=secret-provider-token failed at fetchProvider (/root/nonrev-app/lib/provider.ts:22:4) with token_abcdefghijklmnop'
        }]
      },
      historicalReliability: { status: 'available', summary: 'Bearer secret-provider-token' },
      airportIntelligence: { status: 'available' },
      commercialAvailability: { status: 'available' },
      weather: { status: 'available' },
      recoveryEngineV2: { status: 'available' },
      standbyConfidence: { status: 'available' },
      plannerSignalAttribution: { status: 'available' },
      smokeTests: [{ name: 'smoke', status: 'pass' }],
      i18n: { defaultLocale: 'en', locales: ['en', 'es'], messageCatalogsPresent: true }
    })

    assert.ok(readiness)
    const serialized = JSON.stringify(readiness)
    assert.doesNotMatch(serialized, /secret-provider-token/)
    assert.doesNotMatch(serialized, /api_key=secret-provider-token/)
    assert.doesNotMatch(serialized, /token_abcdefghijklmnop/)
    assert.doesNotMatch(serialized, /\/root\/nonrev-app\/lib\/provider\.ts/)
    assert.doesNotMatch(serialized, /confirmed standby|standby is available|seat is available|guaranteed|booked/i)
  })
})
