import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { parseItineraryPrompt } from './itinerarySearch.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { freshnessBadgeLabelFor, isCurrentLiveAvailability } from './liveAvailabilityGuard.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { ensureRouteFrameworkLabels } from './routeFrameworkLabels.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { savedTripWatchlistStorageKey, watchMatchesText, watchTargetLabel } from './watchlist.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { betaFeedbackCategories } from './betaFeedback.ts'

type MockStorage = {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
}

function createLocalStorage(seed: Record<string, string> = {}): MockStorage {
  const store = new Map(Object.entries(seed))
  return {
    get length() { return store.size },
    key: (index) => [...store.keys()][index] || null,
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => { store.set(key, value) },
    removeItem: (key) => { store.delete(key) },
    clear: () => { store.clear() }
  }
}

function withMockWindow<T>(seed: Record<string, string>, callback: () => T): T {
  const globalRecord = globalThis as Record<string, unknown>
  const previousWindow = globalRecord.window
  globalRecord.window = { localStorage: createLocalStorage(seed) }
  try {
    return callback()
  } finally {
    if (previousWindow === undefined) delete globalRecord.window
    else globalRecord.window = previousWindow
  }
}

describe('private beta smoke coverage', () => {
  it('parses itinerary search prompts without losing requested endpoints', () => {
    const parsed = parseItineraryPrompt('BOS to SBP tomorrow')

    assert.equal(parsed.origin, 'BOS')
    assert.equal(parsed.destination, 'SBP')
    assert.equal(parsed.parserFallbackApplied, false)
    assert.ok((parsed.parserConfidence || 0) >= 80)
  })

  it('keeps planning fallback labels non-live', () => {
    const framework = ensureRouteFrameworkLabels({
      source: 'route-framework',
      sourceProvider: 'route-framework',
      dataFreshnessRule: 'route-framework',
      productionAvailability: true,
      providerBadges: []
    })

    assert.equal(framework.productionAvailability, false)
    assert.equal(isCurrentLiveAvailability(framework), false)
    assert.equal(freshnessBadgeLabelFor(framework), 'Freshness: Route framework only')
  })

  it('covers watchlist matching labels for beta routes', () => {
    const watch = {
      id: 'watch-bos-sbp',
      watchType: 'route' as const,
      watchLabel: watchTargetLabel('route', 'BOS-SBP'),
      watchQuery: 'BOS → SBP',
      origin: 'BOS',
      destination: 'SBP',
      travelDate: 'Flexible',
      carrier: 'All carriers',
      selectedItinerary: 'BOS → DEN → SBP',
      score: 70,
      successProbability: 66,
      riskLevel: 'Medium',
      connections: 1,
      totalTravelTime: 'Pending schedule data',
      lastUpdated: '2026-07-04T00:00:00.000Z'
    }

    assert.equal(watch.watchLabel, 'BOS → SBP')
    assert.equal(watchMatchesText(watch, 'BOS → SBP route update'), true)
    assert.equal(watchMatchesText(watch, 'LAX → OGG'), false)
  })

  it('offers private beta feedback categories that match traveler reports', () => {
    assert.deepEqual(betaFeedbackCategories, [
      'Wrong flight/time',
      'Missing itinerary',
      'ZED issue',
      'Load request issue',
      'UI problem',
      'Other'
    ])
  })

  it('renders alert and watchlist activity feed items from local beta storage', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon-key'
    // @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
    const { alertHistoryStorageKey, alertSummary, buildRouteActivityFeed } = await import('./alerts.ts')
    const alert = {
      id: 'alert-1',
      eventKey: 'watchlist:bos-sbp',
      type: 'Watchlist activity' as const,
      severity: 'warning' as const,
      title: 'BOS → SBP watchlist updated',
      body: 'Route confidence changed; verify provider freshness before acting.',
      route: 'BOS → DEN → SBP',
      targetId: 'watch-bos-sbp',
      targetType: 'watched-route' as const,
      targetLabel: 'BOS → SBP',
      carrier: 'All carriers',
      metricLabel: 'Freshness',
      metricValue: 'Cached provider data',
      generatedAt: '2026-07-04T00:02:00.000Z',
      read: false,
      source: 'watchlist' as const,
      details: ['Freshness: Cached provider data']
    }
    const watch = {
      id: 'watch-bos-sbp',
      watchType: 'route' as const,
      watchLabel: 'BOS → SBP',
      watchQuery: 'BOS → SBP',
      origin: 'BOS',
      destination: 'SBP',
      travelDate: 'Flexible',
      carrier: 'All carriers',
      selectedItinerary: 'BOS → DEN → SBP',
      score: 70,
      successProbability: 66,
      riskLevel: 'Medium',
      connections: 1,
      totalTravelTime: 'Pending schedule data',
      lastUpdated: '2026-07-04T00:01:00.000Z'
    }

    withMockWindow({
      [alertHistoryStorageKey]: JSON.stringify([alert]),
      [savedTripWatchlistStorageKey]: JSON.stringify([watch])
    }, () => {
      assert.deepEqual(alertSummary([alert]), { unread: 1, critical: 0, warning: 1, byType: { 'Watchlist activity': 1 } })
      const feed = buildRouteActivityFeed()
      assert.equal(feed[0].title, 'BOS → SBP watchlist updated')
      assert.equal(feed[1].title, 'Watching BOS → SBP')
      assert.equal(feed.every((item) => item.route.includes('BOS') || item.route.includes('SBP')), true)
    })
  })
})
