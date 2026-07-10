import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ProviderHealthMonitor,
  ProviderRateLimitManager,
  defaultProviderOnboardingConfigs,
  executeProviderOperation,
  freshnessFromNormalizedSchedules,
  providerInfrastructureSnapshot,
  providerOnboardingConfigFor,
  redactCredential,
  resolveProviderCredentials,
  withRetryBackoff
} from './providerInfrastructure'

describe('provider onboarding infrastructure', () => {
  it('defines production onboarding configs and credential abstraction for current and future providers', () => {
    const keys = defaultProviderOnboardingConfigs.map((config) => config.key)
    assert.deepEqual(keys, ['flightaware', 'aviationstack', 'amadeus', 'cirium', 'oag', 'community'])
    const flightAware = providerOnboardingConfigFor('flightaware')!
    assert.equal(flightAware.credentials?.[0].envKey, 'FLIGHTAWARE_API_KEY')
    assert.equal(resolveProviderCredentials(flightAware, {}).configured, false)
    assert.deepEqual(resolveProviderCredentials(flightAware, {}).missingEnvKeys, ['FLIGHTAWARE_API_KEY'])
    assert.equal(resolveProviderCredentials(flightAware, { FLIGHTAWARE_API_KEY: 'secret-key' }).configured, true)
    assert.equal(redactCredential('abcdefghi'), 'abc…ghi')
  })

  it('enforces rate limits per provider bucket', () => {
    const limiter = new ProviderRateLimitManager()
    const config = { capacity: 2, intervalMs: 1000 }
    assert.equal(limiter.acquire('flightaware', config, 1000).allowed, true)
    assert.equal(limiter.acquire('flightaware', config, 1001).allowed, true)
    assert.equal(limiter.acquire('flightaware', config, 1002).allowed, false)
    assert.equal(limiter.acquire('flightaware', config, 2001).allowed, true)
  })

  it('retries provider operations with backoff before surfacing failure', async () => {
    let attempts = 0
    const sleeps: number[] = []
    const result = await withRetryBackoff(async () => {
      attempts += 1
      if (attempts < 3) throw new Error('temporary provider failure')
      return 'ok'
    }, { retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 }, sleep: async (ms) => { sleeps.push(ms) } })

    assert.equal(result, 'ok')
    assert.equal(attempts, 3)
    assert.deepEqual(sleeps, [10, 20])
  })

  it('records health, latency, and freshness snapshots for executed provider operations', async () => {
    const config = { ...providerOnboardingConfigFor('community')!, enabled: true, rateLimit: { capacity: 1, intervalMs: 1000 } }
    const limiter = new ProviderRateLimitManager()
    const monitor = new ProviderHealthMonitor()
    let now = 1_000_000
    const result = await executeProviderOperation(config, async () => 'rows', {
      rateLimitManager: limiter,
      healthMonitor: monitor,
      now: () => { now += 25; return now },
      sleep: async () => {},
      freshness: () => ({ newestSourceCheckedAt: '2026-07-10T01:00:00.000Z', freshnessHours: 0.4 })
    })

    assert.equal(result, 'rows')
    const health = monitor.latest('community')!
    assert.equal(health.status, 'success')
    assert.equal(health.latencyMs, 25)
    assert.equal(health.freshness.newestSourceCheckedAt, '2026-07-10T01:00:00.000Z')
  })

  it('computes freshness and infrastructure snapshots without exposing credential values', () => {
    const freshness = freshnessFromNormalizedSchedules([
      { carrier: 'UA', flightNumber: 'UA100', origin: 'SFO', destination: 'HND', departureTime: '2026-07-10T03:00:00.000Z', arrivalTime: '2026-07-10T14:00:00.000Z', aircraft: '789', status: 'Scheduled', source: 'flightaware', sourceCheckedAt: '2026-07-10T01:00:00.000Z' }
    ], Date.parse('2026-07-10T02:00:00.000Z'))
    assert.equal(freshness.freshnessHours, 1)

    const snapshot = providerInfrastructureSnapshot(defaultProviderOnboardingConfigs.slice(0, 1), { FLIGHTAWARE_API_KEY: 'secret-value' }, new ProviderHealthMonitor())
    assert.equal(snapshot[0].credentialState.configured, true)
    assert.equal('credentials' in snapshot[0].credentialState, false)
  })
})
