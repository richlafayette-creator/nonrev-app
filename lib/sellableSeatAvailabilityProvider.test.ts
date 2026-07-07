import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { commercialAvailabilitySafeLabel, createCommercialAvailabilityCacheEntry, createSellableSeatAvailabilityProvider, createSellableSeatAvailabilityProviderRegistry, getCommercialAvailabilityWithCache, InMemoryCommercialAvailabilityCacheStore, MockCommercialAvailabilityProvider, NullSellableSeatAvailabilityProvider, readCommercialAvailabilityCache, sellableSeatAvailabilityLimitations, sellableSeatAvailabilityProviderConfiguration, sellableSeatAvailabilityProviderFeatureFlag, type SellableSeatAvailabilityProvider, type SellableSeatAvailabilityProviderResult } from './sellableSeatAvailabilityProvider.ts'

class TestSellableSeatAvailabilityProvider implements SellableSeatAvailabilityProvider {
  readonly providerName = 'TestSellableSeatAvailabilityProvider'
  readonly featureFlagEnvVar = sellableSeatAvailabilityProviderFeatureFlag
  readonly status = 'not-implemented' as const
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const
  readonly scrapingAllowed = false as const

  async getAvailability(): Promise<SellableSeatAvailabilityProviderResult> {
    return {
      carrier: 'UA',
      flightNumber: 'UA100',
      origin: 'SFO',
      destination: 'HNL',
      departureDate: '2026-07-20',
      cabinAvailability: [
        {
          cabin: 'economy',
          sellableStatus: 'limited',
          availableInventory: null,
          confidence: 'low',
          lastUpdated: '2026-07-06T04:05:00.000Z'
        }
      ],
      fareClassAvailability: [
        {
          fareClass: 'Y',
          sellableStatus: 'available',
          observedPrice: 499,
          currency: 'USD',
          confidence: 'low',
          lastUpdated: '2026-07-06T04:05:00.000Z'
        }
      ],
      observedPrice: 499,
      priceTrend: 'stable',
      sellableStatus: 'limited',
      safeLabel: 'limited',
      confidence: 'low',
      providerName: this.providerName,
      lastUpdated: '2026-07-06T04:05:00.000Z',
      limitations: ['Test provider remains proxy-only.']
    }
  }
}

function assertNoForbiddenClaims(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(lower, /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
  assert.doesNotMatch(lower, /scrap(e|ing)\s+airline\s+websites?\s+(is\s+)?(enabled|allowed|implemented)/)
}

describe('sellable seat availability provider framework', () => {
  const query = {
    carrier: 'UA',
    flightNumber: 'UA100',
    origin: 'SFO',
    destination: 'HNL',
    departureDate: '2026-07-20'
  }

  it('returns conservative null availability fields by default without live calls', async () => {
    const provider = createSellableSeatAvailabilityProvider({ env: {} })
    const result = await provider.getAvailability({
      carrier: ' ua ',
      flightNumber: ' ua100 ',
      origin: ' sfo ',
      destination: ' hnl ',
      departureDate: '2026-07-20'
    })

    assert.ok(provider instanceof NullSellableSeatAvailabilityProvider)
    assert.equal(provider.providerName, 'NullSellableSeatAvailabilityProvider')
    assert.equal(provider.featureFlagEnvVar, sellableSeatAvailabilityProviderFeatureFlag)
    assert.equal(provider.liveCallsEnabled, false)
    assert.equal(provider.advisoryOnly, true)
    assert.equal(provider.scrapingAllowed, false)
    assert.deepEqual(result, {
      carrier: 'UA',
      flightNumber: 'UA100',
      origin: 'SFO',
      destination: 'HNL',
      departureDate: '2026-07-20',
      cabinAvailability: [],
      fareClassAvailability: [],
      observedPrice: null,
      priceTrend: 'unknown',
      sellableStatus: 'unknown',
      safeLabel: 'unknown',
      confidence: 'unknown',
      providerName: 'NullSellableSeatAvailabilityProvider',
      lastUpdated: null,
      limitations: sellableSeatAvailabilityLimitations
    })
  })

  it('supports registry and factory lookup only behind the future feature flag', async () => {
    const registry = createSellableSeatAvailabilityProviderRegistry()
    registry.register(new TestSellableSeatAvailabilityProvider())

    assert.deepEqual(registry.listProviderNames(), ['TestSellableSeatAvailabilityProvider'])
    assert.equal(createSellableSeatAvailabilityProvider({ providerName: 'TestSellableSeatAvailabilityProvider', registry, env: {} }).providerName, 'NullSellableSeatAvailabilityProvider')

    const provider = createSellableSeatAvailabilityProvider({
      providerName: 'TestSellableSeatAvailabilityProvider',
      registry,
      env: { NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true' }
    })
    const result = await provider.getAvailability(query)

    assert.equal(provider.providerName, 'TestSellableSeatAvailabilityProvider')
    assert.equal(result.carrier, 'UA')
    assert.equal(result.flightNumber, 'UA100')
    assert.equal(result.origin, 'SFO')
    assert.equal(result.destination, 'HNL')
    assert.equal(result.departureDate, '2026-07-20')
    assert.equal(result.cabinAvailability[0]?.cabin, 'economy')
    assert.equal(result.fareClassAvailability[0]?.fareClass, 'Y')
    assert.equal(result.observedPrice, 499)
    assert.equal(result.priceTrend, 'stable')
    assert.equal(result.sellableStatus, 'limited')
    assert.equal(result.safeLabel, 'limited')
    assert.equal(result.confidence, 'low')
    assert.equal(result.providerName, 'TestSellableSeatAvailabilityProvider')
    assert.equal(result.lastUpdated, '2026-07-06T04:05:00.000Z')
  })

  it('exposes config guardrails for future providers without implementing live providers or scraping', () => {
    const disabled = sellableSeatAvailabilityProviderConfiguration({
      DUFFEL_API_KEY: 'configured-but-disabled',
      AMADEUS_API_KEY: 'configured-but-disabled',
      SABRE_API_KEY: 'configured-but-disabled'
    })
    const enabled = sellableSeatAvailabilityProviderConfiguration({ NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: '1' })
    const notes = [...disabled, ...enabled].flatMap((provider) => provider.notes).join(' ')

    assert.equal(disabled.every((provider) => provider.enabled === false), true)
    assert.equal(disabled.every((provider) => provider.liveCallsEnabled === false), true)
    assert.equal(disabled.every((provider) => provider.advisoryOnly === true), true)
    assert.equal(disabled.every((provider) => provider.scrapingAllowed === false), true)
    assert.deepEqual(enabled.map((provider) => provider.providerName), [
      'DuffelSellableSeatAvailabilityProvider',
      'AmadeusGdsSellableSeatAvailabilityProvider',
      'SabreSellableSeatAvailabilityProvider',
      'ManualCommercialAvailabilityProvider',
      'MockCommercialAvailabilityProvider'
    ])
    assert.equal(enabled.find((provider) => provider.providerName === 'DuffelSellableSeatAvailabilityProvider')?.status, 'credential-missing')
    assert.equal(enabled.find((provider) => provider.providerName === 'AmadeusGdsSellableSeatAvailabilityProvider')?.status, 'credential-missing')
    assert.equal(enabled.find((provider) => provider.providerName === 'SabreSellableSeatAvailabilityProvider')?.status, 'credential-missing')
    assert.equal(enabled.find((provider) => provider.providerName === 'ManualCommercialAvailabilityProvider')?.status, 'not-implemented')
    assert.equal(enabled.find((provider) => provider.providerName === 'MockCommercialAvailabilityProvider')?.status, 'feature-disabled')
    assert.equal(enabled.every((provider) => provider.liveCallsEnabled === false), true)
    assert.equal(enabled.every((provider) => provider.scrapingAllowed === false), true)
    assertNoForbiddenClaims([...sellableSeatAvailabilityLimitations, notes].join(' '))
  })

  it('falls back to the null provider for unknown provider names even when enabled', () => {
    const provider = createSellableSeatAvailabilityProvider({
      providerName: 'UnknownFutureSellableProvider',
      env: { NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true' }
    })

    assert.ok(provider instanceof NullSellableSeatAvailabilityProvider)
    assert.equal(provider.status, 'feature-disabled')
  })

  it('keeps commercial availability disabled by feature flag and unknown neutral', async () => {
    const store = new InMemoryCommercialAvailabilityCacheStore()
    const result = await getCommercialAvailabilityWithCache({
      query,
      store,
      env: {
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_SCENARIO: 'favorable'
      },
      providerName: 'MockCommercialAvailabilityProvider'
    })

    assert.equal(result.status, 'disabled')
    assert.equal(result.safeLabel, 'unknown')
    assert.equal(result.providerCallsAttempted, false)
    assert.equal(result.cacheUpdated, false)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownNeutral, true)
    assert.equal(store.get(result.key), undefined)
  })

  it('returns and caches a mock favorable response behind feature flags', async () => {
    const store = new InMemoryCommercialAvailabilityCacheStore()
    const result = await getCommercialAvailabilityWithCache({
      query,
      store,
      now: new Date('2026-07-07T04:00:00.000Z'),
      env: {
        NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_SCENARIO: 'favorable'
      },
      providerName: 'MockCommercialAvailabilityProvider'
    })

    assert.equal(result.status, 'fetched')
    assert.equal(result.providerName, 'MockCommercialAvailabilityProvider')
    assert.equal(result.result?.sellableStatus, 'available')
    assert.equal(result.safeLabel, 'favorable')
    assert.equal(result.cacheUpdated, true)
    assert.equal(result.appliesToScoring, false)
    assert.ok(result.result?.limitations.some((item) => /demo-only|does not confirm non-rev/i.test(item)))
    assert.equal(store.get(result.key)?.result.safeLabel, 'favorable')
  })

  it('returns and caches a mock limited response behind feature flags', async () => {
    const store = new InMemoryCommercialAvailabilityCacheStore()
    const result = await getCommercialAvailabilityWithCache({
      query,
      store,
      now: new Date('2026-07-07T04:00:00.000Z'),
      env: {
        NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_SCENARIO: 'limited'
      },
      providerName: 'MockCommercialAvailabilityProvider'
    })

    assert.equal(result.status, 'fetched')
    assert.equal(result.result?.sellableStatus, 'limited')
    assert.equal(result.safeLabel, 'limited')
    assert.equal(result.result?.priceTrend, 'higher')
    assert.equal(result.cacheUpdated, true)
  })

  it('fails closed when the mock provider is unavailable', async () => {
    const store = new InMemoryCommercialAvailabilityCacheStore()
    const result = await getCommercialAvailabilityWithCache({
      query,
      store,
      env: {
        NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_SCENARIO: 'provider-unavailable'
      },
      providerName: 'MockCommercialAvailabilityProvider'
    })

    assert.equal(result.status, 'provider-unavailable')
    assert.equal(result.safeLabel, 'unknown')
    assert.equal(result.providerCallsAttempted, true)
    assert.equal(result.cacheUpdated, false)
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownNeutral, true)
    assert.equal(store.get(result.key), undefined)
    assert.ok(result.diagnostics.some((item) => /unknown remains neutral|left unchanged/i.test(item)))
  })

  it('treats stale cache as diagnostic-only and refreshes from the provider', async () => {
    const store = new InMemoryCommercialAvailabilityCacheStore()
    const staleResult = await new MockCommercialAvailabilityProvider({
      env: {
        NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_SCENARIO: 'favorable'
      },
      now: new Date('2026-07-07T03:00:00.000Z')
    }).getAvailability(query)
    store.set(createCommercialAvailabilityCacheEntry({
      query,
      result: staleResult,
      fetchedAt: new Date('2026-07-07T03:00:00.000Z'),
      policy: { freshForMinutes: 10, diagnosticStaleForMinutes: 120 }
    }))

    const read = readCommercialAvailabilityCache({
      query,
      store,
      now: new Date('2026-07-07T03:30:00.000Z'),
      env: { NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true' },
      policy: { freshForMinutes: 10, diagnosticStaleForMinutes: 120 }
    })
    assert.equal(read.status, 'stale')
    assert.equal(read.result, null)
    assert.equal(read.safeLabel, 'unknown')
    assert.equal(read.appliesToScoring, false)

    const refreshed = await getCommercialAvailabilityWithCache({
      query,
      store,
      now: new Date('2026-07-07T03:30:00.000Z'),
      policy: { freshForMinutes: 10, diagnosticStaleForMinutes: 120 },
      env: {
        NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_SCENARIO: 'limited'
      },
      providerName: 'MockCommercialAvailabilityProvider'
    })

    assert.equal(refreshed.cache.status, 'stale')
    assert.equal(refreshed.status, 'fetched')
    assert.equal(refreshed.safeLabel, 'limited')
    assert.equal(refreshed.cacheUpdated, true)
  })

  it('preserves unknown as a neutral safe label', async () => {
    const store = new InMemoryCommercialAvailabilityCacheStore()
    const result = await getCommercialAvailabilityWithCache({
      query,
      store,
      env: {
        NONREV_COMMERCIAL_AVAILABILITY_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_PROVIDER_ENABLED: 'true',
        NONREV_COMMERCIAL_AVAILABILITY_MOCK_SCENARIO: 'unknown'
      },
      providerName: 'MockCommercialAvailabilityProvider'
    })

    assert.equal(commercialAvailabilitySafeLabel('unknown'), 'unknown')
    assert.equal(result.status, 'provider-unavailable')
    assert.equal(result.safeLabel, 'unknown')
    assert.equal(result.appliesToScoring, false)
    assert.equal(result.unknownNeutral, true)
    assert.equal(result.cacheUpdated, false)
  })
})
