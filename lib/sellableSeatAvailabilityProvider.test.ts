import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { createSellableSeatAvailabilityProvider, createSellableSeatAvailabilityProviderRegistry, NullSellableSeatAvailabilityProvider, sellableSeatAvailabilityLimitations, sellableSeatAvailabilityProviderConfiguration, sellableSeatAvailabilityProviderFeatureFlag, type SellableSeatAvailabilityProvider, type SellableSeatAvailabilityProviderResult } from './sellableSeatAvailabilityProvider.ts'

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
    const result = await provider.getAvailability({ carrier: 'UA', flightNumber: 'UA100', origin: 'SFO', destination: 'HNL', departureDate: '2026-07-20' })

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
    assert.equal(disabled.every((provider) => provider.status === 'feature-disabled'), true)
    assert.equal(disabled.every((provider) => provider.liveCallsEnabled === false), true)
    assert.equal(disabled.every((provider) => provider.advisoryOnly === true), true)
    assert.equal(disabled.every((provider) => provider.scrapingAllowed === false), true)
    assert.deepEqual(enabled.map((provider) => provider.providerName), [
      'DuffelSellableSeatAvailabilityProvider',
      'AmadeusGdsSellableSeatAvailabilityProvider',
      'SabreSellableSeatAvailabilityProvider',
      'ManualCommercialAvailabilityProvider'
    ])
    assert.equal(enabled.find((provider) => provider.providerName === 'DuffelSellableSeatAvailabilityProvider')?.status, 'credential-missing')
    assert.equal(enabled.find((provider) => provider.providerName === 'AmadeusGdsSellableSeatAvailabilityProvider')?.status, 'credential-missing')
    assert.equal(enabled.find((provider) => provider.providerName === 'SabreSellableSeatAvailabilityProvider')?.status, 'credential-missing')
    assert.equal(enabled.find((provider) => provider.providerName === 'ManualCommercialAvailabilityProvider')?.status, 'not-implemented')
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
})
