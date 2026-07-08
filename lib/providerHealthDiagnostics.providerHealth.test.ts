import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildProviderHealthDiagnostics, providerHealthDiagnosticsFeatureFlag } from './providerHealthDiagnostics.ts'

const now = new Date('2026-07-08T03:10:00.000Z')

function env(extra: Record<string, string | undefined> = {}) {
  return { [providerHealthDiagnosticsFeatureFlag]: 'true', ...extra }
}

function serialized(value: unknown) {
  const output = JSON.stringify(value)
  assert.doesNotMatch(output, /confirmed standby|standby is available|seat is available|guaranteed|booked/i)
  return output
}

function assertGuardrails(provider: {
  diagnosticsOnly: true
  missingProviderNeutral: true
  noItineraryGenerationChange: true
  noPlannerBehaviorChange: true
  noRankingChange: true
  noScoringChange: true
  noAdvisoryWordingChange: true
  noUiChange: true
  noApiContractChange: true
}) {
  assert.equal(provider.diagnosticsOnly, true)
  assert.equal(provider.missingProviderNeutral, true)
  assert.equal(provider.noItineraryGenerationChange, true)
  assert.equal(provider.noPlannerBehaviorChange, true)
  assert.equal(provider.noRankingChange, true)
  assert.equal(provider.noScoringChange, true)
  assert.equal(provider.noAdvisoryWordingChange, true)
  assert.equal(provider.noUiChange, true)
  assert.equal(provider.noApiContractChange, true)
}

describe('provider health diagnostics', () => {
  it('reports healthy providers', () => {
    const diagnostics = buildProviderHealthDiagnostics({
      now,
      env: env(),
      providers: [
        {
          provider: 'AviationWeather.gov METAR cache',
          category: 'weather',
          enabled: true,
          available: true,
          cacheFetchedAt: '2026-07-08T02:50:00.000Z',
          cacheFreshForMinutes: 60,
          lastSuccessfulRefresh: '2026-07-08T02:50:00.000Z',
          timeoutCount: 0,
          failureCount: 0
        },
        {
          provider: 'Historical Reliability Service',
          category: 'historical-reliability',
          status: 'success',
          cacheAgeMinutes: 15,
          cacheFreshForMinutes: 120,
          lastSuccessfulRefresh: '2026-07-08T02:55:00.000Z'
        }
      ]
    })

    assert.ok(diagnostics)
    assert.equal(diagnostics.enabled, true)
    assert.equal(diagnostics.diagnosticsOnly, true)
    assert.equal(diagnostics.noApiContractChange, true)
    assert.equal(diagnostics.summary.totalProviders, 2)
    assert.equal(diagnostics.summary.healthyProviders, 2)
    assert.equal(diagnostics.summary.overallStatus, 'healthy')
    assert.equal(diagnostics.providers[0].cacheAgeMinutes, 20)
    assert.equal(diagnostics.providers[0].staleStatus, 'fresh')
    diagnostics.providers.forEach(assertGuardrails)
    serialized(diagnostics)
  })

  it('reports stale cache as degraded with neutral fallback', () => {
    const diagnostics = buildProviderHealthDiagnostics({
      now,
      env: env(),
      providers: [{
        provider: 'Commercial availability proxy cache',
        category: 'commercial-availability',
        enabled: true,
        available: true,
        cacheAgeMinutes: 240,
        cacheFreshForMinutes: 60,
        lastSuccessfulRefresh: '2026-07-07T23:10:00.000Z'
      }]
    })

    assert.ok(diagnostics)
    const provider = diagnostics.providers[0]
    assert.equal(provider.staleStatus, 'stale')
    assert.equal(provider.status, 'degraded')
    assert.match(provider.neutralFallbackReason, /stale or expired/i)
    assert.equal(diagnostics.summary.staleProviders, 1)
    assert.equal(diagnostics.summary.neutralFallbackProviders, 1)
  })

  it('reports disabled providers as unavailable and neutral', () => {
    const diagnostics = buildProviderHealthDiagnostics({
      now,
      env: env(),
      providers: [{
        provider: 'Duffel commercial availability',
        category: 'commercial-availability',
        enabled: false,
        cacheAgeMinutes: null,
        lastSuccessfulRefresh: null
      }]
    })

    assert.ok(diagnostics)
    const provider = diagnostics.providers[0]
    assert.equal(provider.enabled, 'disabled')
    assert.equal(provider.availability, 'unavailable')
    assert.equal(provider.staleStatus, 'disabled')
    assert.equal(provider.status, 'disabled')
    assert.match(provider.neutralFallbackReason, /disabled/i)
    assert.equal(diagnostics.summary.disabledProviders, 1)
    assert.equal(diagnostics.summary.overallStatus, 'disabled')
  })

  it('reports provider timeout counts as degraded neutral fallback', () => {
    const diagnostics = buildProviderHealthDiagnostics({
      now,
      env: env(),
      providers: [{
        provider: 'FlightAware weather alerts',
        category: 'weather',
        enabled: true,
        available: true,
        cacheStatus: 'fresh',
        lastSuccessfulRefresh: '2026-07-08T02:58:00.000Z',
        timeoutCount: 3,
        failureCount: 0
      }]
    })

    assert.ok(diagnostics)
    const provider = diagnostics.providers[0]
    assert.equal(provider.timeoutCount, 3)
    assert.equal(provider.status, 'degraded')
    assert.match(provider.neutralFallbackReason, /timeout/i)
    assert.equal(diagnostics.summary.timedOutProviders, 1)
    assert.equal(diagnostics.summary.overallStatus, 'degraded')
  })

  it('reports provider failures as unavailable neutral fallback', () => {
    const diagnostics = buildProviderHealthDiagnostics({
      now,
      env: env(),
      providers: [{
        provider: 'Airport intelligence provider',
        category: 'airport-intelligence',
        enabled: true,
        available: false,
        cacheStatus: 'missing',
        timeoutCount: 0,
        failureCount: 2,
        detail: 'Provider returned 500; neutral fallback applied.'
      }]
    })

    assert.ok(diagnostics)
    const provider = diagnostics.providers[0]
    assert.equal(provider.failureCount, 2)
    assert.equal(provider.availability, 'unavailable')
    assert.equal(provider.status, 'unavailable')
    assert.match(provider.neutralFallbackReason, /failure/i)
    assert.equal(diagnostics.summary.failedProviders, 1)
    assert.equal(diagnostics.summary.missingProviders, 1)
  })

  it('aggregates healthy, stale, disabled, timeout, failure, and missing providers', () => {
    const diagnostics = buildProviderHealthDiagnostics({
      now,
      env: env(),
      providers: [
        { provider: 'Weather cache', enabled: true, available: true, cacheAgeMinutes: 5, cacheFreshForMinutes: 60, lastSuccessfulRefresh: '2026-07-08T03:05:00.000Z' },
        { provider: 'Historical cache', enabled: true, available: true, cacheAgeMinutes: 500, cacheFreshForMinutes: 60, lastSuccessfulRefresh: '2026-07-07T18:50:00.000Z' },
        { provider: 'Recovery v2 provider', enabled: false, available: false },
        { provider: 'Standby confidence provider', enabled: true, available: true, cacheStatus: 'fresh', timeoutCount: 1 },
        { provider: 'Airport intelligence provider', enabled: true, available: false, failureCount: 1 }
      ],
      expectedProviders: ['Commercial availability provider']
    })

    assert.ok(diagnostics)
    assert.equal(diagnostics.summary.totalProviders, 6)
    assert.equal(diagnostics.summary.enabledProviders, 4)
    assert.equal(diagnostics.summary.disabledProviders, 2)
    assert.equal(diagnostics.summary.healthyProviders, 1)
    assert.equal(diagnostics.summary.staleProviders, 1)
    assert.equal(diagnostics.summary.timedOutProviders, 1)
    assert.equal(diagnostics.summary.failedProviders, 1)
    assert.equal(diagnostics.summary.missingProviders, 2)
    assert.equal(diagnostics.summary.overallStatus, 'degraded')
    assert.match(diagnostics.summary.summary, /1\/6 providers healthy/)
    const missing = diagnostics.providers.find((provider) => provider.provider === 'Commercial availability provider')
    assert.ok(missing)
    assert.equal(missing.metadata.missingProvider, true)
    assert.match(missing.neutralFallbackReason, /not supplied/i)
  })

  it('omits diagnostics completely when the feature flag is disabled', () => {
    const diagnostics = buildProviderHealthDiagnostics({
      now,
      env: {},
      providers: [{ provider: 'Weather cache', enabled: true, available: true }]
    })

    assert.equal(diagnostics, undefined)
  })

  it('omits undefined detail from provider metadata', () => {
    const diagnostics = buildProviderHealthDiagnostics({
      now,
      env: env(),
      providers: [{
        provider: 'Weather cache',
        enabled: true,
        available: true,
        detail: undefined,
        metadata: { optional: undefined }
      }]
    })

    assert.ok(diagnostics)
    assert.equal(Object.hasOwn(diagnostics.providers[0].metadata, 'detail'), false)
    assert.equal(diagnostics.providers[0].metadata.optional, null)
    assert.doesNotMatch(JSON.stringify(diagnostics.providers[0].metadata), /undefined/)
  })

  it('redacts secrets, credential-like values, query params, and internal implementation details', () => {
    const diagnostics = buildProviderHealthDiagnostics({
      now,
      env: env({ SECRET_TOKEN: 'secret-provider-token' }),
      providers: [{
        provider: 'Bearer secret-provider-token',
        category: 'weather',
        enabled: true,
        available: false,
        cacheStatus: 'missing',
        failureCount: 1,
        neutralFallbackReason: 'GET https://example.test/path?api_key=secret-provider-token failed at fetchProvider (/root/nonrev-app/lib/provider.ts:22:4) with token_abcdefghijklmnop',
        detail: 'Bearer secret-provider-token in lib/providerHealthDiagnostics.ts:10:2',
        metadata: {
          providerSecret: 'secret-provider-token',
          authHeader: 'Bearer token_abcdefghijklmnop',
          internalPath: '/root/nonrev-app/lib/provider.ts'
        }
      }]
    })

    const output = JSON.stringify(diagnostics)
    assert.ok(diagnostics)
    assert.doesNotMatch(output, /secret-provider-token/)
    assert.doesNotMatch(output, /token_abcdefghijklmnop/)
    assert.doesNotMatch(output, /api_key=secret-provider-token/)
    assert.doesNotMatch(output, /\/root\/nonrev-app/)
    assert.doesNotMatch(output, /lib\/provider\.ts/)
    assert.match(output, /\[redacted\]|\[internal\]/)
  })
})
