import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { freshnessBadgeLabelFor, isCurrentLiveAvailability } from './liveAvailabilityGuard.ts'

describe('live availability guard', () => {
  it('blocks stale cached provider rows from current-live treatment', () => {
    const cached = {
      sourceProvider: 'provider-cache:flightaware',
      dataFreshnessRule: 'cached-provider-yellow',
      dataFreshnessLabel: 'Older cached route data',
      providerBadges: ['Cached provider data'],
      productionAvailability: false
    }

    assert.equal(isCurrentLiveAvailability(cached), false)
    assert.equal(freshnessBadgeLabelFor(cached), 'Freshness: Cached provider data')
  })

  it('blocks stored Supabase rows even when their text mentions live unavailability', () => {
    const stored = {
      sourceProvider: 'supabase',
      dataFreshnessRule: 'stored-historical-data',
      dataFreshnessLabel: 'Stored exact-date schedule',
      dataFreshnessDetail: 'Live provider API unavailable; using stored Supabase rows.',
      providerBadges: ['Stored Supabase flight data'],
      productionAvailability: false
    }

    assert.equal(isCurrentLiveAvailability(stored), false)
    assert.equal(freshnessBadgeLabelFor(stored), 'Freshness: Stored historical data')
  })

  it('does not let no-current-live data mode render as live freshness', () => {
    assert.equal(freshnessBadgeLabelFor({ dataMode: 'no-current-live-data' }), 'Freshness: No current live availability')
  })

  it('allows only explicitly production-available live provider rows as current live availability', () => {
    const live = {
      sourceProvider: 'flightaware',
      dataFreshnessRule: 'exact-requested-date',
      dataFreshnessLabel: 'Live provider API data',
      providerBadges: ['Live provider API data'],
      productionAvailability: true
    }

    assert.equal(isCurrentLiveAvailability(live), true)
    assert.equal(freshnessBadgeLabelFor(live), 'Freshness: Live provider API data')
  })
})
