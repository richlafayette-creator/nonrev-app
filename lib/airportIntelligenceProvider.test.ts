import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { airportIntelligenceProviderFeatureFlag, enabledDynamicAirportIntelligenceProviderNames, getAirportIntelligenceProviderReadiness } from './airportIntelligenceProvider.ts'

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
