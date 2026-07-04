import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildProviderDiagnostics } from './providerDiagnostics.ts'

describe('provider diagnostics', () => {
  it('structures freshness, rate-limit, partial coverage, and fallback signals', () => {
    const diagnostics = buildProviderDiagnostics({
      dataFreshnessMode: 'provider-cache',
      dataFreshnessExplanation: ['Recent provider cache checked within 6-24 hours.'],
      rateLimits: ['FlightAware quota exceeded; skipped this provider safely'],
      emptyResults: ['FlightAware returned no usable rows for SBP → LAX.'],
      providerFallbackOrder: ['flightaware-schedules', 'provider-cache', 'route-framework'],
      providerStatuses: [
        { provider: 'flightaware', label: 'FlightAware', state: 'warning', detail: 'No usable FlightAware schedule rows returned before cache fallback.' },
        { provider: 'planning', label: 'Planning', state: 'success', detail: 'Route frameworks supplemented cached schedule rows.' }
      ],
      routeCoverageSuggestions: [
        { lookupStatus: 'provider_no_rows', providerResultCount: 0, searchQuery: 'SBP → SFO → NRT', providerDetail: 'No provider rows found for alternate route.' }
      ]
    })

    assert.ok(diagnostics.some((diagnostic) => diagnostic.category === 'freshness' && diagnostic.provider === 'provider-cache'))
    assert.ok(diagnostics.some((diagnostic) => diagnostic.category === 'rate-limit' && diagnostic.provider === 'flightaware'))
    assert.ok(diagnostics.some((diagnostic) => diagnostic.category === 'partial-coverage' && diagnostic.evidenceCount === 1))
    assert.ok(diagnostics.some((diagnostic) => diagnostic.category === 'fallback' && /cache fallback/i.test(diagnostic.detail)))
  })

  it('keeps live-current freshness informational', () => {
    const diagnostics = buildProviderDiagnostics({
      dataFreshnessMode: 'live-current-api',
      dataFreshnessExplanation: ['Exact requested date provider rows returned.']
    })

    assert.equal(diagnostics[0].severity, 'info')
  })
})
