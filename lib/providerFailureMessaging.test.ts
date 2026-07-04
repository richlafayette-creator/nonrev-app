import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { providerFailureKindFromStatus, providerFailureMessage, providerFailureMessageFromStatus } from './providerFailureMessaging.ts'

describe('provider failure messaging', () => {
  it('labels rate limits without implying live availability', () => {
    assert.equal(providerFailureKindFromStatus(429, 'monthly quota exceeded'), 'rate-limited')
    assert.match(providerFailureMessageFromStatus('FlightAware', 429, 'monthly quota exceeded'), /live availability is unavailable/i)
  })

  it('labels partial provider coverage without fabricating missing legs', () => {
    assert.equal(providerFailureKindFromStatus(200, 'partial response with missing legs'), 'partial')
    assert.match(providerFailureMessage('Aviationstack', 'partial'), /not filled with fabricated availability/i)
  })

  it('labels stale provider data as context only', () => {
    assert.equal(providerFailureKindFromStatus(undefined, 'cached rows older than 3 days'), 'stale')
    assert.match(providerFailureMessage('Supabase', 'stale'), /not current live availability/i)
  })

  it('redacts credential-like details in provider errors', () => {
    const message = providerFailureMessageFromStatus('Provider', 403, 'request failed api_key=abc123 token=def456')

    assert.doesNotMatch(message, /abc123|def456/)
    assert.match(message, /\[redacted\]/)
  })
})
