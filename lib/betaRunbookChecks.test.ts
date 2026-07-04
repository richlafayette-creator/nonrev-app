import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { betaRunbookCheckSummary, betaRunbookChecks } from './betaRunbookChecks.ts'

describe('beta runbook checks', () => {
  it('passes the required private-beta environment checks when configured safely', () => {
    const checks = betaRunbookChecks({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'secret-service-role-value',
      FLIGHTAWARE_API_KEY: 'flightaware',
      AVIATIONSTACK_API_KEY: 'aviationstack',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'browser-public-key'
    })

    assert.deepEqual(betaRunbookCheckSummary(checks), { pass: 7, warn: 0, fail: 0 })
    assert.equal(JSON.stringify(checks).includes('secret-service-role-value'), false)
  })

  it('fails required environment and provider checks without exposing secret values', () => {
    const checks = betaRunbookChecks({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NONREVY_STORE_PROVIDER_RESULTS: 'true',
      SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-role'
    })
    const summary = betaRunbookCheckSummary(checks)

    assert.ok(summary.fail >= 2)
    assert.equal(JSON.stringify(checks).includes('super-secret-service-role'), false)
    assert.equal(checks.find((item) => item.key === 'supabase-public-client')?.status, 'fail')
    assert.equal(checks.find((item) => item.key === 'flightaware-provider-key')?.status, 'fail')
  })

  it('flags provider-result storage without service-role persistence', () => {
    const checks = betaRunbookChecks({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      FLIGHTAWARE_API_KEY: 'flightaware',
      NONREVY_STORE_PROVIDER_RESULTS: 'true'
    })

    assert.equal(checks.find((item) => item.key === 'provider-result-storage')?.status, 'fail')
    assert.match(checks.find((item) => item.key === 'provider-result-storage')?.nextAction || '', /Disable NONREVY_STORE_PROVIDER_RESULTS/)
  })

  it('flags alert safety risks and personal testing mode separately', () => {
    const checks = betaRunbookChecks({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      FLIGHTAWARE_API_KEY: 'flightaware',
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'never-public',
      NONREVY_TEST_DATA_MODE: 'true'
    })

    assert.equal(checks.find((item) => item.key === 'alert-notification-safety')?.status, 'fail')
    assert.equal(checks.find((item) => item.key === 'personal-testing-mode')?.status, 'warn')
    assert.equal(JSON.stringify(checks).includes('never-public'), false)
  })
})
