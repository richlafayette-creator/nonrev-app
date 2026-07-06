import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { airportIntelligenceProviderConfiguration, airportIntelligenceProviderFeatureFlag, createAirportIntelligenceProvider, createAirportIntelligenceProviderRegistry, enabledDynamicAirportIntelligenceProviderNames, getAirportIntelligenceProviderReadiness, NullAirportIntelligenceProvider, type AirportIntelligenceProvider, type AirportIntelligenceProviderResult } from './airportIntelligenceProvider.ts'

class TestAirportIntelligenceProvider implements AirportIntelligenceProvider {
  readonly providerName = 'TestAirportIntelligenceProvider'
  readonly featureFlagEnvVar = airportIntelligenceProviderFeatureFlag
  readonly status = 'not-implemented' as const
  readonly liveCallsEnabled = false as const
  readonly advisoryOnly = true as const

  async getAirportIntelligence(): Promise<AirportIntelligenceProviderResult> {
    return {
      airportCode: 'SFO',
      congestionLevel: 'moderate',
      connectionRisk: 'low',
      minimumConnectionMinutes: 45,
      customsImmigrationRisk: 'moderate',
      terminalTransferRisk: 'low',
      alternateAirportOptions: [
        {
          airportCode: 'OAK',
          reason: 'Future alternate airport option shape only.',
          recoveryScore: 62,
          minimumConnectionMinutes: null,
          confidence: 40
        }
      ],
      recoveryScore: 71,
      confidence: 55,
      providerName: this.providerName,
      lastUpdated: '2026-07-06T03:58:00.000Z'
    }
  }
}

function assertNoStandbyClaims(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
  assert.doesNotMatch(lower, /(seat|seats|loads?)\s+(is\s+|are\s+)?available\s+for\s+standby/)
}

describe('airport intelligence provider readiness', () => {
  it('keeps dynamic airport intelligence sources disabled by default while preserving the local scaffold', () => {
    const readiness = getAirportIntelligenceProviderReadiness({
      FLIGHTAWARE_API_KEY: 'configured-but-disabled',
      NEXT_PUBLIC_MAPBOX_TOKEN: 'configured-but-disabled'
    })
    const local = readiness.find((source) => source.provider === 'Local static airport scaffold')
    const dynamic = readiness.filter((source) => source.provider !== 'Local static airport scaffold')

    assert.equal(local?.status, 'static-scaffold-ready')
    assert.equal(local?.liveCallsEnabled, false)
    assert.equal(local?.advisoryOnly, true)
    assert.equal(dynamic.every((source) => source.status === 'feature-disabled'), true)
    assert.deepEqual(enabledDynamicAirportIntelligenceProviderNames({ FLIGHTAWARE_API_KEY: 'configured-but-disabled' }), [])
  })

  it('reports public and credential readiness only behind the airport intelligence feature flag', () => {
    const env = {
      NONREV_AIRPORT_INTELLIGENCE_PROVIDER_ENABLED: 'true',
      FLIGHTAWARE_API_KEY: 'flightaware-key'
    }
    const readiness = getAirportIntelligenceProviderReadiness(env)
    const byProvider = Object.fromEntries(readiness.map((source) => [source.provider, source]))

    assert.equal(byProvider.OurAirports.status, 'public-source-ready')
    assert.equal(byProvider['FAA airport facilities'].status, 'public-source-ready')
    assert.equal(byProvider['FlightAware airport endpoints'].status, 'credential-configured')
    assert.equal(byProvider['Mapbox airport context'].status, 'credential-missing')
    assert.equal(byProvider['FlightAware airport endpoints'].featureFlagEnvVar, airportIntelligenceProviderFeatureFlag)
    assert.deepEqual(enabledDynamicAirportIntelligenceProviderNames(env), ['OurAirports', 'FAA airport facilities', 'FlightAware airport endpoints'])
  })

  it('keeps airport intelligence advisory-only and avoids standby or inventory claims', () => {
    const readiness = getAirportIntelligenceProviderReadiness({ NONREV_AIRPORT_INTELLIGENCE_PROVIDER_ENABLED: '1' })
    const joined = readiness.flatMap((source) => [...source.canProvide, ...source.cannotProvide, source.nextAction]).join(' ').toLowerCase()

    assert.match(joined, /connection difficulty|airport metadata|map rendering|visual orientation/)
    assert.match(joined, /confirmed standby availability|seat inventory|load factors|standby list position/)
    assert.doesNotMatch(joined, /scrape airline|airline website|standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
    assert.equal(readiness.every((source) => source.liveCallsEnabled === false), true)
    assert.equal(readiness.every((source) => source.advisoryOnly === true), true)
  })
})

describe('airport intelligence provider framework', () => {
  it('returns null airport intelligence fields by default without live calls', async () => {
    const provider = createAirportIntelligenceProvider({ env: {} })
    const result = await provider.getAirportIntelligence({ airportCode: ' sfo ', connectionMinutes: 35, internationalArrival: true })

    assert.ok(provider instanceof NullAirportIntelligenceProvider)
    assert.equal(provider.providerName, 'NullAirportIntelligenceProvider')
    assert.equal(provider.featureFlagEnvVar, airportIntelligenceProviderFeatureFlag)
    assert.equal(provider.liveCallsEnabled, false)
    assert.equal(provider.advisoryOnly, true)
    assert.deepEqual(result, {
      airportCode: 'SFO',
      congestionLevel: 'unknown',
      connectionRisk: 'unknown',
      minimumConnectionMinutes: null,
      customsImmigrationRisk: 'unknown',
      terminalTransferRisk: 'unknown',
      alternateAirportOptions: [],
      recoveryScore: null,
      confidence: 0,
      providerName: 'NullAirportIntelligenceProvider',
      lastUpdated: null
    })
  })

  it('supports registry and factory lookup only behind the future feature flag', async () => {
    const registry = createAirportIntelligenceProviderRegistry()
    registry.register(new TestAirportIntelligenceProvider())

    assert.deepEqual(registry.listProviderNames(), ['TestAirportIntelligenceProvider'])
    assert.equal(createAirportIntelligenceProvider({ providerName: 'TestAirportIntelligenceProvider', registry, env: {} }).providerName, 'NullAirportIntelligenceProvider')

    const provider = createAirportIntelligenceProvider({
      providerName: 'TestAirportIntelligenceProvider',
      registry,
      env: { NONREV_AIRPORT_INTELLIGENCE_PROVIDER_ENABLED: 'true' }
    })
    const result = await provider.getAirportIntelligence({ airportCode: 'SFO' })

    assert.equal(provider.providerName, 'TestAirportIntelligenceProvider')
    assert.equal(result.airportCode, 'SFO')
    assert.equal(result.congestionLevel, 'moderate')
    assert.equal(result.connectionRisk, 'low')
    assert.equal(result.minimumConnectionMinutes, 45)
    assert.equal(result.customsImmigrationRisk, 'moderate')
    assert.equal(result.terminalTransferRisk, 'low')
    assert.equal(result.alternateAirportOptions[0]?.airportCode, 'OAK')
    assert.equal(result.recoveryScore, 71)
    assert.equal(result.confidence, 55)
    assert.equal(result.providerName, 'TestAirportIntelligenceProvider')
    assert.equal(result.lastUpdated, '2026-07-06T03:58:00.000Z')
  })

  it('exposes config guardrails for future providers without implementing live providers', () => {
    const disabled = airportIntelligenceProviderConfiguration({ FLIGHTAWARE_API_KEY: 'configured-but-disabled' })
    const enabled = airportIntelligenceProviderConfiguration({
      NONREV_AIRPORT_INTELLIGENCE_PROVIDER_ENABLED: '1',
      FLIGHTAWARE_API_KEY: 'flightaware-key',
      NEXT_PUBLIC_MAPBOX_TOKEN: 'mapbox-token'
    })
    const missingCredential = airportIntelligenceProviderConfiguration({ NONREV_AIRPORT_INTELLIGENCE_PROVIDER_ENABLED: '1' })
    const notes = [...disabled, ...enabled, ...missingCredential].flatMap((provider) => provider.notes).join(' ')

    assert.equal(disabled.every((provider) => provider.status === 'feature-disabled'), true)
    assert.equal(disabled.every((provider) => provider.liveCallsEnabled === false), true)
    assert.equal(disabled.every((provider) => provider.advisoryOnly === true), true)
    assert.deepEqual(enabled.map((provider) => provider.providerName), [
      'OurAirportsAirportIntelligenceProvider',
      'FaaAirportFacilitiesIntelligenceProvider',
      'FlightAwareAirportIntelligenceProvider',
      'MapboxAirportContextProvider'
    ])
    assert.equal(enabled.every((provider) => provider.status === 'not-implemented'), true)
    assert.equal(missingCredential.find((provider) => provider.providerName === 'FlightAwareAirportIntelligenceProvider')?.status, 'credential-missing')
    assert.equal(missingCredential.find((provider) => provider.providerName === 'MapboxAirportContextProvider')?.status, 'credential-missing')
    assertNoStandbyClaims(notes)
  })

  it('falls back to the null provider for unknown provider names even when enabled', () => {
    const provider = createAirportIntelligenceProvider({
      providerName: 'UnknownFutureAirportProvider',
      env: { NONREV_AIRPORT_INTELLIGENCE_PROVIDER_ENABLED: 'true' }
    })

    assert.ok(provider instanceof NullAirportIntelligenceProvider)
    assert.equal(provider.status, 'feature-disabled')
  })
})
